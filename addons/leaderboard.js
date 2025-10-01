/* KQuiz addon: Leaderboard v1.0 — moves leaderboard out of core */
(function(){
  function factory(){
    let mounted=false, scoresHandler=null;
    let overlay=null, listEl=null, floatBtn=null;

    const $ = (q,r=document)=>r.querySelector(q);
    const el=(t,a={},...cs)=>{const n=document.createElement(t);for(const[k,v]of Object.entries(a)){k==='class'?n.className=v:n.setAttribute(k,v)}cs.forEach(c=>n.appendChild(typeof c==='string'?document.createTextNode(c):c));return n};

    function mountUI(){
      if(mounted) return;
      overlay = $("#lbModal");
      listEl  = $("#lbList");
      floatBtn= $(".float-lb");

      if(!overlay){
        overlay = el('div',{id:'lbModal',class:'overlay'});
        const card = el('div',{class:'card'},
          el('div',{style:'text-align:center;font-weight:1000;font-size:22px;margin-bottom:6px'},'Lyderių lentelė'),
          (listEl=el('div',{class:'lbList',id:'lbList'})),
          el('div',{style:'text-align:center;margin-top:12px'},
            el('button',{class:'btn',id:'lbClose'},'Uždaryti')
          )
        );
        overlay.appendChild(card);
        document.body.appendChild(overlay);
      }
      if(!floatBtn){
        floatBtn = el('button',{class:'float-lb',id:'lbOpen'},'Lyderių lentelė');
        document.body.appendChild(floatBtn);
      }
      (document.getElementById('lbClose')||overlay.querySelector('button.btn')).onclick=closeLeaderboard;
      (document.getElementById('lbOpen') ||floatBtn).onclick=openLeaderboard;

      // expose for existing buttons in HTML
      window.openLeaderboard = openLeaderboard;
      window.closeLeaderboard = closeLeaderboard;

      mounted=true;
    }

    function render(K){
      if(!listEl) return;
      listEl.innerHTML='';
      const arr = Object.entries(K.state.players).map(([id,p])=>({id,name:p.name||id,score:p.score||0,avatar:p.avatar||''}));
      arr.sort((a,b)=>b.score-a.score || a.name.localeCompare(b.name));
      if(!arr.length){
        listEl.appendChild(el('div',{class:'row'},el('div',{},'Nėra žaidėjų'),el('div',{},'0'))); return;
      }
      arr.forEach((p,i)=>{
        const left = el('div',{class:'rowL'}, p.avatar?el('img',{class:'av',src:p.avatar,alt:''}):el('span',{},''), el('div',{},`${i+1}. ${p.name}`));
        listEl.appendChild(el('div',{class:'row'}, left, el('div',{}, String(p.score))));
      });
    }

    function openLeaderboard(){ if(overlay){ overlay.style.display='flex'; render(window.KQuiz); } }
    function closeLeaderboard(){ if(overlay) overlay.style.display='none'; }

    function enable(K){
      mountUI(); render(K);
      scoresHandler = ()=>{ if(overlay && overlay.style.display==='flex') render(K); };
      K.on('scoresChanged', scoresHandler);
    }
    function disable(){
      try{ if(scoresHandler && window.KQuiz) window.KQuiz.off('scoresChanged', scoresHandler); }catch{}
      scoresHandler=null;
      if(overlay) overlay.style.display='none';
      try{ delete window.openLeaderboard; delete window.closeLeaderboard; }catch{}
      mounted=false;
    }

    return { id:'leaderboard', name:'Leaderboard', description:'Lyderių lentelė kaip papildinys.', defaultEnabled:true, enable, disable };
  }
  function register(){ if(!window.KQuiz||!window.KQuiz.registerAddon) return setTimeout(register,100); window.KQuiz.registerAddon(factory()); }
  register();
})();
