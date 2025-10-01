/* KQuiz addon: Avatar Flyover v1.0
   Shows a small avatar flying across the screen when a valid answer (A/B/C/D or 1–4)
   is posted DURING the question timer. Ignores everything else. */

(function () {
  function factory() {
    let mounted = false;
    let layer = null;
    const lastByUser = Object.create(null);
    const MAX_CONCURRENT = 12;
    const COOLDOWN_MS = 2000; // per-user anti-spam

    function mountUI() {
      if (mounted) return;
      const css = `
.kq-fly-layer{position:fixed;inset:0;pointer-events:none;z-index:70}
.kq-fly{position:fixed;left:-80px;width:28px;height:28px;border-radius:50%;overflow:hidden;
  border:1px solid #1E2A3F;box-shadow:0 6px 18px rgba(0,0,0,.35);will-change:transform,opacity}
.kq-fly img{width:100%;height:100%;object-fit:cover}
.kq-fly .init{width:100%;height:100%;display:flex;align-items:center;justify-content:center;
  background:#0E1730;color:#BBD7FF;font-weight:900;font-size:14px}
@keyframes kqFly {
  0%   { transform: translateX(0); opacity:0 }
  5%   { opacity:1 }
  95%  { opacity:1 }
  100% { transform: translateX(calc(100vw + 160px)); opacity:0 }
}
`;
      const style = document.createElement("style");
      style.textContent = css;
      document.head.appendChild(style);

      layer = document.createElement("div");
      layer.className = "kq-fly-layer";
      document.body.appendChild(layer);

      mounted = true;
    }

    function rand(min, max){ return Math.random()*(max-min)+min; }

    function spawn(avatarUrl, displayName){
      // keep the layer tidy
      while (layer.children.length >= MAX_CONCURRENT) layer.children[0].remove();

      const el = document.createElement("div");
      el.className = "kq-fly";

      if (avatarUrl) {
        const img = document.createElement("img");
        img.src = avatarUrl;
        img.alt = "";
        el.appendChild(img);
      } else {
        const init = (String(displayName||"").trim()[0]||"?").toUpperCase();
        const div = document.createElement("div");
        div.className = "init";
        div.textContent = init;
        el.appendChild(div);
      }

      // vertical track within safe area
      const safeBottom = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--safe-bottom")) || 0;
      const minY = 8;
      const maxY = Math.max(minY+40, window.innerHeight - safeBottom - 60);
      const y = Math.floor(rand(minY, maxY));
      el.style.top = y + "px";

      // duration 2.6–3.2s to avoid lingering
      const dur = (rand(2.6, 3.2)).toFixed(2) + "s";
      el.style.animation = `kqFly ${dur} linear forwards`;

      el.addEventListener("animationend", () => el.remove());
      layer.appendChild(el);
    }

    function enable(K){
      mountUI();

      // listen to raw WS messages
      K.on("wsMessage", (m)=>{
        if (!m || m.type!=="chat") return;

        // only when answers are accepted
        const s = K.state.session;
        if (!s.open || !s.timerRunning) return;

        // must be A/B/C/D or 1–4
        const key = K.util.parseAnswer(String(m.text||""));
        if (!key) return;

        // identity + cooldown
        const uid = String(m.uniqueId || m.uid || m.userId || "user").toLowerCase();
        const now = Date.now();
        if ((lastByUser[uid]||0) + COOLDOWN_MS > now) return;
        lastByUser[uid] = now;

        // pick avatar/name
        const avatar = String(m.avatar || "");
        const name = String(m.displayName || m.nickname || m.uniqueId || uid);
        spawn(avatar, name);
      });
    }

    function disable(){
      try { if (layer) layer.innerHTML = ""; } catch {}
      // listeners are lightweight; no explicit off() needed for this simple add-on
    }

    return {
      id: "avatarFlyover",
      name: "Avatar Flyover",
      description: "Parodo mažą avatarą skrendant per ekraną kiekvienam atsakymui per laikmatį.",
      defaultEnabled: true,
      enable, disable
    };
  }

  function register(){
    if (!window.KQuiz || !window.KQuiz.registerAddon) return setTimeout(register, 100);
    window.KQuiz.registerAddon(factory());
  }
  register();
})();
