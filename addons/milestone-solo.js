/* KQuiz addon: Milestone Solo Challenge v1.0
   Triggers a personal timed question at every 100/200/300… points.
   Scoring: +10 if correct, otherwise −50% of current points. */

(function () {
  function factory() {
    let queue = [];
    let running = false;
    let t = null;
    let left = 0;
    let total = 0;
    let targetId = null;

    let overlay = null;
    let styleEl = null;
    let mounted = false;
    let guardSet = false;
    let scoresHandler = null;

    function mountUI() {
      if (mounted) return;

      const css = `
.kq-solo-overlay{position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:99;padding:16px;background:rgba(3,8,18,.65);backdrop-filter:blur(3px)}
.kq-solo-card{width:min(900px,96vw);background:rgba(16,24,40,.55);border:1px solid #1E2A3F;border-radius:20px;padding:16px;box-shadow:0 10px 30px rgba(0,0,0,.25)}
.kq-row{display:flex;align-items:center;gap:8px}
.kq-av{width:48px;height:48px;border-radius:50%;object-fit:cover;border:1px solid #1E2A3F}
.kq-name{font-weight:900}
.kq-badge{font-size:12px;color:#9FB0C6}
.kq-q{text-align:center;font-weight:900;line-height:1.25;font-size:clamp(22px,4.6vw,36px);margin:10px 0}
.kq-ans{width:100%;max-width:900px;display:grid;gap:12px;grid-template-columns:1fr}
@media (min-width:720px){.kq-ans{grid-template-columns:1fr 1fr}}
.kq-choice{display:flex;align-items:center;gap:12px;padding:16px 14px;border-radius:18px;border:1px solid #1E2A3F;background:rgba(17,27,47,.75);font-weight:800;font-size:clamp(18px,3.6vw,28px)}
.kq-key{min-width:56px;height:44px;display:inline-flex;align-items:center;justify-content:center;border-radius:14px;background:#0E1730;border:1px solid #26365A;color:#BBD7FF;font-weight:900}
.kq-bar{height:14px;border-radius:999px;background:#11213A;border:1px solid #1E2A3F;overflow:hidden;margin-top:6px}
.kq-fill{height:100%;width:0%;background:linear-gradient(90deg,#7C5CFF,#2EE5A9)}
.kq-ctrls{display:flex;gap:10px;justify-content:center;margin-top:10px}
.kq-btn{padding:10px 14px;border-radius:14px;border:1px solid #1E2A3F;background:#0E162B;color:#F3F6FC;font-weight:900;cursor:pointer}
`;
      styleEl = document.createElement("style");
      styleEl.textContent = css;
      document.head.appendChild(styleEl);

      overlay = document.createElement("div");
      overlay.className = "kq-solo-overlay";
      overlay.innerHTML = `
        <div class="kq-solo-card">
          <div class="kq-row">
            <img class="kq-av" id="kqSoloAva" alt="">
            <div>
              <div class="kq-name" id="kqSoloName">Žaidėjas</div>
              <div class="kq-badge">Asmeninis iššūkis</div>
            </div>
          </div>

          <div class="kq-q" id="kqSoloQ">Klausimas...</div>

          <div class="kq-bar"><div class="kq-fill" id="kqSoloFill"></div></div>
          <div class="kq-row" style="justify-content:space-between;color:#9FB0C6;font-weight:700;margin:4px 2px">
            <div>Laikas: <span id="kqSoloLeft">0</span>s</div>
            <div>Riba: +10 / -50%</div>
          </div>

          <div class="kq-ans" id="kqSoloAns"></div>

          <div class="kq-ctrls">
            <button class="kq-btn" id="kqSoloCancel">Atšaukti</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      mounted = true;
    }

    function unmountUI() {
      if (overlay?.parentNode) overlay.parentNode.removeChild(overlay);
      if (styleEl?.parentNode) styleEl.parentNode.removeChild(styleEl);
      overlay = null;
      styleEl = null;
      mounted = false;
    }

    function kick(K) {
      if (running || queue.length === 0) return;
      run(K, queue.shift());
    }

    function run(K, id) {
      running = true;
      targetId = id;
      K.control.pauseMain();

      const p = K.state.players[id];
      if (!p) {
        finish(K);
        return;
      }

      const q =
        K.control.getRandomQuestion() || {
          q: "Klausimas",
          options: ["Atsakymas A", "Atsakymas B", "Atsakymas C", "Atsakymas D"],
          keys: ["A", "B", "C", "D"],
          correctKey: "A",
          correctText: "Atsakymas A",
        };

      overlay.style.display = "flex";
      const nameEl = document.getElementById("kqSoloName");
      const avaEl = document.getElementById("kqSoloAva");
      const qEl = document.getElementById("kqSoloQ");
      const box = document.getElementById("kqSoloAns");
      const fill = document.getElementById("kqSoloFill");
      const leftEl = document.getElementById("kqSoloLeft");
      const cancelBtn = document.getElementById("kqSoloCancel");

      nameEl.textContent = p.name || id;
      avaEl.src = p.avatar || "";
      qEl.textContent = q.q;
      box.innerHTML = "";
      q.options.forEach((opt, i) => {
        const key = q.keys[i];
        box.appendChild(
          K.util.el(
            "div",
            { class: "kq-choice" },
            K.util.el("div", { class: "kq-key" }, key),
            opt
          )
        );
      });

      if (!guardSet) {
        K.control.setChatGuard((msg, { parseAnswer, ensurePlayer }) => {
          const { id: uid } = ensurePlayer(msg);
          if (uid !== targetId) return true; // consume others
          const key = parseAnswer(String(msg.text || ""));
          if (!key) return true;
          resolve(K, key === q.correctKey);
          return true;
        });
        guardSet = true;
      }

      left = 12;
      total = left;
      leftEl.textContent = String(left);
      fill.style.width = "0%";

      if (t) clearInterval(t);
      t = setInterval(() => {
        left--;
        leftEl.textContent = String(Math.max(0, left));
        const pct = total ? (100 * (total - left)) / total : 0;
        fill.style.width = pct + "%";
        if (left <= 0) {
          clearInterval(t);
          t = null;
          resolve(K, false);
        }
      }, 1000);

      cancelBtn.onclick = () => resolve(K, false);

      function resolve(K, ok) {
        if (t) {
          clearInterval(t);
          t = null;
        }
        const player = K.state.players[id];
        if (player) {
          if (ok) player.score = (player.score || 0) + 10;
          else player.score = Math.floor((player.score || 0) * 0.5);
        }
        overlay.style.display = "none";
        K.control.clearChatGuard();
        guardSet = false;
        finish(K);
      }
    }

    function finish(K) {
      running = false;
      targetId = null;
      if (queue.length > 0) run(K, queue.shift());
      else K.control.resumeFlow();
    }

    return {
      id: "milestoneSolo",
      name: "Milestone Solo Challenge",
      description: "Asmeninis iššūkis kas 100/200/300… taškų (+10 arba −50% taškų).",
      defaultEnabled: true,
      enable(K) {
        mountUI();
        scoresHandler = ({ id, before, after }) => {
          if (Math.floor(after / 100) > Math.floor(before / 100)) {
            if (!queue.includes(id)) queue.push(id);
            kick(K);
          }
        };
        K.on("scoresChanged", scoresHandler);
      },
      disable() {
        try {
          if (scoresHandler && window.KQuiz) window.KQuiz.off("scoresChanged", scoresHandler);
        } catch {}
        scoresHandler = null;
        queue.length = 0;
        if (t) {
          clearInterval(t);
          t = null;
        }
        if (overlay) overlay.style.display = "none";
        try { window.KQuiz?.control?.clearChatGuard(); } catch {}
        if (running) {
          try { window.KQuiz?.control?.resumeFlow(); } catch {}
        }
        running = false;
        targetId = null;
        unmountUI();
      },
    };
  }

  function register() {
    if (!window.KQuiz || !window.KQuiz.registerAddon) {
      setTimeout(register, 100);
      return;
    }
    const addon = factory();
    window.KQuiz.registerAddon(addon);
  }

  register();
})();
