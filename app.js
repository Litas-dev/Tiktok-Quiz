"use strict";
const $=(q,r=document)=>r.querySelector(q);
const $$=(q,r=document)=>Array.from(r.querySelectorAll(q));
const el=(t,a={},...cs)=>{const n=document.createElement(t);Object.entries(a).forEach(([k,v])=>k==='class'?n.className=v:n.setAttribute(k,v));cs.forEach(c=>n.appendChild(typeof c==='string'?document.createTextNode(c):c));return n;}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};

const state={
  settings:{ secsPerQuestion:20, autoNext:false, sounds:{ticking:true, fail:true} },
  bank:[],
  players:{},
  session:{
    deck:[], i:0, open:false, timerRunning:false,
    correctKey:'A', answers:{}, counts:{A:0,B:0,C:0,D:0},
    done:0, shownTop:{}, used:{},
    curr:null
  },
  ws:null, wsOk:false
};
function save(){ try{localStorage.setItem('kquiz', JSON.stringify({settings:state.settings}))}catch{} }
function restore(){
  try{const s=JSON.parse(localStorage.getItem('kquiz')||'{}'); if(s.settings) Object.assign(state.settings,s.settings);}catch{}
  const autoNextEl=document.getElementById('autoNext');
  const secsEl=document.getElementById('secsPerQ');
  const tickEl=document.getElementById('sndTick');
  const failEl=document.getElementById('sndFail');
  if(autoNextEl) autoNextEl.checked=!!state.settings.autoNext;
  if(secsEl) secsEl.value=state.settings.secsPerQuestion;
  if(tickEl) tickEl.checked=!!state.settings.sounds.ticking;
  if(failEl) failEl.checked=!!state.settings.sounds.fail;
}
document.addEventListener('DOMContentLoaded',()=>{
  restore();
  const hamburger=document.getElementById('hamburger');
  if(hamburger){ hamburger.addEventListener('click',()=>toggleMenu()); }
});

function nav(id){ $$('.section').forEach(s=>s.classList.remove('active')); $('#'+id).classList.add('active'); }
function toggleMenu(force){
  const sidebar=document.getElementById('sidebar');
  const open=(typeof force==='boolean')?force:!sidebar.classList.contains('open');
  sidebar.classList.toggle('open',open);
}

async function loadJSON(file){
  if(!file) return;
  const text=await file.text();
  let data=[]; try{ data=JSON.parse(text); if(!Array.isArray(data)) throw 0; }catch{ alert('Blogas JSON.'); return; }
  const out=[]; const seen=new Set();
  for(const o of data){
    if(!o||!o.q||seen.has(o.q)) continue;
    seen.add(o.q);
    const wrong=Array.isArray(o.wrong)?o.wrong.slice(0,3):[];
    while(wrong.length<3) wrong.push('');
    out.push({q:String(o.q), correct:String(o.correct||''), wrong, note:String(o.note||''), cat:String(o.cat||'')});
  }
  if(!out.length){ alert('Klausimų nerasta.'); return; }
  state.bank=out;
  state.session.deck=shuffle([...Array(out.length).keys()]);
  state.session.i=0; state.session.used={}; state.session.done=0; state.session.curr=null;
  document.getElementById('bankStat').textContent=`Įkelta ${out.length} klausimų.`;
  document.getElementById('roundNum').textContent='0';
}

let timer=null, timeLeft=0, totalTime=0;
function startGame(){
  if(!state.bank.length){ alert('Įkelkite JSON banką Nustatymuose.'); return; }
  if(state.session.i>=state.session.deck.length){ state.session.deck=shuffle([...Array(state.bank.length).keys()]); state.session.i=0; state.session.used={}; state.session.done=0; }
  nav('game'); nextQ();
}
function cancelAuto(){ if(window.autoNextTimer){ clearTimeout(window.autoNextTimer); window.autoNextTimer=null; } }
function bootTimer(){
  timeLeft=parseInt(state.settings.secsPerQuestion)||20; totalTime=timeLeft;
  state.session.timerRunning=true; updateTimerUI(); tickStart();
  if(timer) clearInterval(timer);
  timer=setInterval(()=>{
    timeLeft--; updateTimerUI();
    if(timeLeft<=0){ clearInterval(timer); timer=null; state.session.timerRunning=false; tickStop(); reveal(true); }
  },1000);
}
function updateTimerUI(){
  document.getElementById('tLeft').textContent=String(Math.max(0,timeLeft));
  const pct=totalTime?100*(totalTime-timeLeft)/totalTime:0;
  document.getElementById('timerFill').style.width=`${pct}%`;
}
function nextQ(){
  cancelAuto();
  state.session.open=true;
  while(state.session.i<state.session.deck.length && state.session.used[state.session.deck[state.session.i]]) state.session.i++;
  if(state.session.i>=state.session.deck.length){ finish(); return; }

  const qid=state.session.deck[state.session.i];
  const q=state.bank[qid];
  const opts=[q.correct, ...(q.wrong||[])].slice(0,4); while(opts.length<4) opts.push('');
  const ord=[0,1,2,3]; shuffle(ord); const keys=['A','B','C','D'];

  document.getElementById('q').textContent=q.q;
  const box=document.getElementById('ans'); box.innerHTML='';
  ord.forEach((oi,i)=> box.appendChild(el('div',{class:'choice'}, el('div',{class:'key'}, keys[i]), opts[oi])));

  const cKey=keys[ord.indexOf(0)]||'A';
  state.session.correctKey=cKey;
  state.session.answers={}; state.session.counts={A:0,B:0,C:0,D:0};
  state.session.curr={qid, correctKey:cKey, correctText:q.correct||'', note:q.note||''};
  document.getElementById('lockBtn').classList.remove('hidden');
  document.getElementById('revealBtn').classList.remove('hidden');
  document.getElementById('nextBtn').classList.add('hidden');
  document.getElementById('roundNum').textContent=String(state.session.done+1);
  save();
  bootTimer();
}
function lockNow(){
  state.session.open=false; state.session.timerRunning=false;
  if(timer){ clearInterval(timer); timer=null; } tickStop();
  document.getElementById('lockBtn').classList.add('hidden');
}
function reveal(auto){
  if(timer){ clearInterval(timer); timer=null; }
  state.session.timerRunning=false; tickStop(); lockNow();

  const curr=state.session.curr, correct=curr?curr.correctKey:state.session.correctKey;
  const winners=[];
  for(const [id,k] of Object.entries(state.session.answers||{})){
    if(k===correct){
      const p=state.players[id]||(state.players[id]={name:id,score:0,nextMilestone:100,avatar:''});
      p.score=(p.score||0)+10; winners.push({id,name:p.name||id, score:p.score, avatar:p.avatar||''});
      if(p.score>=(p.nextMilestone||100)){ p.nextMilestone=(p.nextMilestone||100)+100; }
    }
  }
  if(!winners.length && state.settings.sounds.fail){ try{ const f=document.getElementById('failAudio'); f.currentTime=0; f.play(); }catch{} }

  try{ if(curr) state.session.used[curr.qid]=true; }catch{}
  document.getElementById('ovAnswer').textContent=curr?curr.correctText:'';
  document.getElementById('ovNote').textContent=curr?curr.note:'';
  const box=document.getElementById('ovWinners'); box.innerHTML='';
  if(winners.length){
    winners.sort((a,b)=>b.score-a.score);
    winners.forEach(w=>{
      const left=el('div',{class:'rowL'}, w.avatar?el('img',{class:'av',src:w.avatar,alt:''}):el('span',{},''), el('div',{}, w.name));
      box.appendChild(el('div',{class:'row'}, left, el('div',{}, String(w.score))));
    });
  }else{
    box.appendChild(el('div',{class:'row'}, el('div',{}, 'Niekas neatsakė teisingai'), el('div',{}, '0')));
  }
  document.getElementById('overlay').style.display='flex';
  document.getElementById('nextBtn').classList.remove('hidden'); save();

  if(state.settings.autoNext && auto){
    window.autoNextTimer=setTimeout(()=>{ if(document.getElementById('overlay').style.display!=='none'){ document.getElementById('overlay').style.display='none'; proceed(); } }, 3000);
  }
}
function proceed(){
  document.getElementById('overlay').style.display='none';
  state.session.i++; state.session.done++; state.session.curr=null;
  document.getElementById('roundNum').textContent=String(state.session.done); save(); nextQ();
}
function finish(){
  document.getElementById('q').textContent='Klausimai baigėsi.';
  document.getElementById('ans').innerHTML=''; document.getElementById('lockBtn').classList.add('hidden'); document.getElementById('revealBtn').classList.add('hidden'); document.getElementById('nextBtn').classList.add('hidden');
}

function tickStart(){ if(!state.settings.sounds.ticking) return; try{ const a=document.getElementById('tickAudio'); a.currentTime=0; a.play(); }catch{} }
function tickStop(){ try{ document.getElementById('tickAudio').pause(); }catch{} }

function openLeaderboard(){
  const box=document.getElementById('lbList'); box.innerHTML='';
  const arr=Object.entries(state.players).map(([id,p])=>({id,name:p.name||id,score:p.score||0,avatar:p.avatar||''}));
  arr.sort((a,b)=> b.score-a.score || a.name.localeCompare(b.name));
  if(!arr.length){
    box.appendChild(el('div',{class:'row'}, el('div',{}, 'Nėra žaidėjų'), el('div',{}, '0')));
  }else{
    arr.forEach((p,i)=>{
      const left=el('div',{class:'rowL'}, p.avatar?el('img',{class:'av',src:p.avatar,alt:''}):el('span',{},''), el('div',{}, (i+1)+'. '+p.name));
      box.appendChild(el('div',{class:'row'}, left, el('div',{}, String(p.score))));
    });
  }
  document.getElementById('lbModal').style.display='flex';
}
function closeLeaderboard(){ document.getElementById('lbModal').style.display='none'; }

function connectWS(){
  const url=(document.getElementById('wsUrl').value||'').trim()||'ws://localhost:8081';
  let attempts=0;
  function dial(){
    try{ if(state.ws) state.ws.close(); }catch{}
    const ws=new WebSocket(url); state.ws=ws; document.getElementById('wsState').textContent='jungiamasi...';
    ws.onopen=()=>{ attempts=0; state.wsOk=true; document.getElementById('wsState').textContent='prijungta'; };
    ws.onclose=ws.onerror=()=>{ state.wsOk=false; document.getElementById('wsState').textContent='neprijungta';
      setTimeout(dial, Math.min(10000, 1000*(2**(attempts++))));
    };
    ws.onmessage=ev=>{ try{ const m=JSON.parse(ev.data); if(m.type==='chat') handleChat(m); }catch{} };
  }
  dial();
}

function ensurePlayer(msg){
  const id  = String(msg.userId || msg.uniqueId || msg.displayName || msg.nickname || 'user');
  const name= String(msg.displayName || msg.nickname || msg.uniqueId || msg.userId || 'Žaidėjas');
  const ava = String(msg.avatar || msg.profilePictureUrl || msg.userProfilePictureUrl || '');
  let p = state.players[id];
  if(!p){ p = state.players[id] = { name, score:0, nextMilestone:100, avatar: ava }; }
  else{
    if(name && p.name!==name) p.name = name;
    if(ava && p.avatar!==ava) p.avatar = ava;
  }
  return {id, p};
}

function handleChat(msg){
  if(!state.session.timerRunning || !state.session.open) return;
  const key=parseAnswer(String(msg.text||'')); if(!key) return;
  const {id} = ensurePlayer(msg);
  if(state.session.answers[id]) return;
  state.session.answers[id]=key; state.session.counts[key]=(state.session.counts[key]||0)+1;
}
function parseAnswer(t){
  t=t.trim().toUpperCase();
  const m=t.match(/\b([ABCD])\b|(^|[^0-9])([1-4])($|[^0-9])/);
  if(m) return m[1] || ['A','B','C','D'][parseInt(m[3],10)-1];
  return null;
}

window.addEventListener('keydown',e=>{
  if(e.key===' '){
    e.preventDefault();
    if(document.getElementById('overlay').style.display==='flex') proceed(); else reveal(false);
  }
});
