/* KQuiz addon: Milestone Solo Challenge */
(function(){
  function plugin(K){
    if(!K || !K.on) return;

    // inject minimal CSS
    const css = `.kq-solo-overlay{position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:99;padding:16px;background:rgba(3,8,18,.65);backdrop-filter:blur(3px)}
.kq-solo-card{width:min(900px,96vw);background:rgba(16,24,40,.55);border:1px solid #1E2A3F;border-radius:20px;padding:16px;box-shadow:0 10px 30px rgba(0,0,0,.25)}
.kq-row{display:flex;align-items:center;gap:8px}
.kq-av{width:48px;height:48px;border-radius:50%;object-fit:cover;border:1px solid #1E2A3F}
.kq-name{font-weight:900}
.kq-badge{font-size:12px;color:#9FB0C6}
.kq-q{ text-align:center; font-weight:900; line-height:1.25; font-size: clamp(22px, 4.6vw, 36px); margin:10px 0 }
.kq-ans{ width:100%; max-width:900px; display:grid; gap:12px; grid-template-columns: 1fr }
@media (min-width:720px){ .kq-ans{ grid-template-columns: 1fr 1fr } }
.kq-choice{display:flex;align-items:center;gap:12px;padding:16px 14px;border-radius:18px;border:1px solid #1E2A3F;background:rgba(17,27,47,.75);font-weight:800;font-size: clamp(18px, 3.6vw, 28px);}
.kq-key{min-width:56px;height:44px;display:inline-flex;align-items:center;justify-content:center;border-radius:14px;background:#0E1730;border:1px solid #26365A;color:#BBD7FF;font-weight:900}
.kq-bar{height:14px;border-radius:999px;background:#11213A;border:1px solid #1E2A3F;overflow:hidden;margin-top:6px}
.kq-fill{height:100%;width:0%}
.kq-ctrls{display:flex;gap:10px;justify-content:center;margin-top:10px}
.kq-btn{padding:10px 14px;border-radius:14px;border:1px solid #1E2A3F;background:#0E162B;color:#F3F6FC;font-weight:900;cursor:pointer}
`;
    const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

    // overlay DOM
    const overlay = document.createElement('div'); overlay.className='kq-solo-overlay'; overlay.innerHTML = `
      <div class="kq-solo-card">
        <div class="kq-row"><img class="kq-av" id="kqSoloAva"/><div><div class="kq-name" id="kqSoloName">Žaidėjas</div><div class="kq-badge">Asmeninis iššūkis</div></div></div>
        <div class="kq-q" id="kqSoloQ">Klausimas...</div>
        <div class="kq-bar"><div class="kq-fill" id="kqSoloFill"></div></div>
        <div class="kq-row" style="justify-content:space-between;color:#9FB0C6;font-weight:700;margin:4px 2px">
          <div>Laikas: <span id="kqSoloLeft">0</span>s</div>
          <div>Riba: +10 / -50%</div>
        </div>
        <div class="kq-ans" id="kqSoloAns"></div>
        <div class="kq-ctrls"><button class="kq-btn" id="kqSoloCancel">Atšaukti</button></div>
      </div>`;
    document.body.appendChild(overlay);

    let queue=[], running=false, t=null, left=0, total=0, targetId=null;
    function kick(){ if(running || queue.length===0) return; run(queue.shift()); }

    function run(id){
      running=true; targetId=id; K.control.pauseMain();
      const p = K.state.players[id]; if(!p){ finish(); return; }
      // question
      const q = K.control.getRandomQuestion() || {q:'Klausimas', options:['A','B','C','D'], keys:['A','B','C','D'], correctKey:'A', correctText:'A'};
      // render
      $('#kqSoloName').textContent = p.name || id;
      $('#kqSoloAva').src = p.avatar || '';
      $('#kqSoloQ').textContent = q.q;
      const box = $('#kqSoloAns'); box.innerHTML='';
      q.options.forEach((opt,i)=>{
        const key=q.keys[i];
        box.appendChild(K.util.el('div',{class:'kq-choice'}, K.util.el('div',{class:'kq-key'}, key), opt));
      });
      // guard only this user
      K.control.setChatGuard((msg,{parseAnswer,ensurePlayer})=>{
        const {id:uid}=ensurePlayer(msg);
        if(uid!==targetId) return true; // consume others
        const key=parseAnswer(String(msg.text||''));
        if(!key) return true;
        resolve(key===q.correctKey);
        return true;
      });
      // timer
      left=12; total=left; $('#kqSoloLeft').textContent=String(left); $('#kqSoloFill').style.width='0%';
      if(t) clearInterval(t);
      t=setInterval(()=>{
        left--; $('#kqSoloLeft').textContent=String(Math.max(0,left));
        const pct = total?100*(total-left)/total:0; $('#kqSoloFill').style.width=pct+'%';
        if(left<=0){ clearInterval(t); t=null; resolve(false); }
      },1000);
      overlay.style.display='flex';
      $('#kqSoloCancel').onclick=()=>resolve(false);
      function resolve(ok){
        if(t){ clearInterval(t); t=null; }
        const p = K.state.players[id]; if(p){
          if(ok) p.score = (p.score||0)+10;
          else p.score = Math.floor((p.score||0)*0.5);
        }
        overlay.style.display='none';
        K.control.clearChatGuard();
        finish();
      }
    }

    function finish(){
      running=false; targetId=null;
      if(queue.length>0){ run(queue.shift()); } else { K.control.resumeFlow(); }
    }

    // Listen for score changes and enqueue on 100s boundaries
    K.on('scoresChanged', ({id, before, after})=>{
      if(Math.floor(after/100) > Math.floor(before/100)){
        if(!queue.includes(id)) queue.push(id);
        kick();
      }
    });
  }

  if(window.KQuiz){ window.KQuiz.use(plugin); }
  else{
    // fallback if core loads later
    window.addEventListener('DOMContentLoaded', ()=>{ if(window.KQuiz) window.KQuiz.use(plugin); });
  }
})();
