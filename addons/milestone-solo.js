/* KQuiz addon: Milestone Solo Challenge v1.1
   Flow: intro (name+avatar) -> host clicks "Toliau" -> question shown -> only that player can answer.
   Timer: 30s. Scoring: +10 correct, −50% incorrect. Queue supports multiple triggers. */

(function () {
  function factory() {
    // runtime state
    let queue = [];
    let running = false;
    let targetId = null;
    let stage = "idle"; // 'idle' | 'intro' | 'question'
    let t = null, left = 0, total = 0;
    let overlay = null, styleEl = null, mounted = false;
    let scoresHandler = null;
    let guardActive = false;

    // UI mount
    function mountUI() {
      if (mounted) return;

      const css = `
.kq-solo-overlay{position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:99;padding:16px;background:rgba(3,8,18,.65);backdrop-filter:blur(3px)}
.kq-solo-card{width:min(900px,96vw);background:rgba(16,24,40,.55);border:1px solid #1E2A3F;border-radius:20px;padding:16px;box-shadow:0 10px 30px rgba(0,0,0,.25)}
.kq-row{display:flex;align-items:center;gap:8px}
.kq-av{width:64px;height:64px;border-radius:50%;object-fit:cover;border:1px solid #1E2A3F}
.kq-name{font-weight:900; font-size:clamp(18px,3.4vw,24px)}
.kq-badge{font-size:12px;color:#9FB0C6}
.kq-q{text-align:center;font-weight:900;line-height:1.25;font-size:clamp(22px,4.6vw,36px);margin:10px 0}
.kq-ans{width:100%;max-width:900px;display:grid;gap:12px;grid-template-columns:1fr}
@media (min-width:720px){.kq-ans{grid-template-columns:1fr 1fr}}
.kq-choice{display:flex;align-items:center;gap:12px;padding:16px 14px;border-radius:18px;border:1px solid #1E2A3F;background:rgba(17,27,47,.75);font-weight:800;font-size:clamp(18px,3.6vw,28px)}
.kq-key{min-width:56px;height:44px;display:inline-flex;align-items:center;justify-content:center;border-radius:14px;background:#0E1730;border:1px solid #26365A;color:#BBD7FF;font-weight:900}
.kq-bar{height:14px;border-radius:999px;background:#11213A;border:1px solid #1E2A3F;overflow:hidden;margin-top:6px}
.kq-fill{height:100%;width:0%;background:linear-gradient(90deg,#7C5CFF,#2EE5A9)}
.kq-ctrls{display:flex;gap:10px;justify-content:center;margin-top:12px;flex-wrap:wrap}
.kq-btn{padding:10px 14px;border-radius:14px;border:1px solid #1E2A3F;background:#0E162B;color:#F3F6FC;font-weight:900;cursor:pointer}
.kq-hide{display:none}
      `;
      styleEl = document.createElement("style"); styleEl.textContent = css; document.head.appendChild(styleEl);

      overlay = document.createElement("div");
      overlay.className = "kq-solo-overlay";
      overlay.innerHTML = `
        <div class="kq-solo-card">
          <!-- INTRO -->
          <div id="kqSoloIntro">
            <div class="kq-row" style="justify-content:center;gap:12px;margin-bottom:8px">
              <img class="kq-av" id="kqSoloAva" alt="">
              <div>
                <div class="kq-name" id="kqSoloName">Žaidėjas</div>
                <div class="kq-badge">Asmeninis iššūkis</div>
              </div>
            </div>
            <div class="kq-ctrls">
              <button class="kq-btn" id="kqSoloGo">Toliau</button>
              <button class="kq-btn" id="kqSoloCancel1">Atšaukti</button>
            </div>
          </div>

          <!-- QUESTION -->
          <div id="kqSoloPlay" class="kq-hide">
            <div class="kq-q" id="kqSoloQ">Klausimas...</div>
            <div class="kq-bar"><div class="kq-fill" id="kqSoloFill"></div></div>
            <div class="kq-row" style="justify-content:space-between;color:#9FB0C6;font-weight:700;margin:4px 2px">
              <div>Laikas: <span id="kqSoloLeft">0</span>s</div>
              <div>Riba: +10 / -50%</div>
            </div>
            <div class="kq-ans" id="kqSoloAns"></div>
            <div class="kq-ctrls">
              <button class="kq-btn" id="kqSoloCancel2">Atšaukti</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      mounted = true;
    }

    function unmountUI() {
      if (overlay?.parentNode) overlay.parentNode.removeChild(overlay);
      if (styleEl?.parentNode) styleEl.parentNode.removeChild(styleEl);
      overlay = null; styleEl = null; mounted = false;
    }

    function kick(K) { if (!running && queue.length > 0) runIntro(K, queue.shift()); }

    function runIntro(K, id) {
      running = true;
      targetId = id;
      stage = "intro";
      K.control.pauseMain();

      mountUI();

      // load player visuals
      const p = K.state.players[id];
      const nameEl = document.getElementById("kqSoloName");
      const avaEl  = document.getElementById("kqSoloAva");
      nameEl.textContent = p?.name || id;
      avaEl.src = p?.avatar || "";

      // show intro, hide question
      document.getElementById("kqSoloIntro").classList.remove("kq-hide");
      document.getElementById("kqSoloPlay").classList.add("kq-hide");
      overlay.style.display = "flex";

      // wire buttons
      document.getElementById("kqSoloGo").onclick = () => startQuestion(K);
      document.getElementById("kqSoloCancel1").onclick = () => resolve(K, false); // cancel = incorrect
    }

    function startQuestion(K) {
      if (stage !== "intro") return;
      stage = "question";

      // render a random question
      const q = K.control.getRandomQuestion() || {
        q: "Klausimas",
        options: ["Atsakymas A", "Atsakymas B", "Atsakymas C", "Atsakymas D"],
        keys: ["A", "B", "C", "D"],
        correctKey: "A",
        correctText: "Atsakymas A"
      };

      document.getElementById("kqSoloIntro").classList.add("kq-hide");
      document.getElementById("kqSoloPlay").classList.remove("kq-hide");

      const qEl = document.getElementById("kqSoloQ");
      const box = document.getElementById("kqSoloAns");
      const fill = document.getElementById("kqSoloFill");
      const leftEl = document.getElementById("kqSoloLeft");
      const cancelBtn = document.getElementById("kqSoloCancel2");

      qEl.textContent = q.q;
      box.innerHTML = "";
      q.options.forEach((opt, i) => {
        const key = q.keys[i];
        box.appendChild(K.util.el("div", { class: "kq-choice" }, K.util.el("div", { class: "kq-key" }, key), opt));
      });

      // guard: accept only this player's answer, only during stage 'question'
      if (!guardActive) {
        K.control.setChatGuard((msg, { parseAnswer, ensurePlayer }) => {
          if (stage !== "question") return true; // consume all until question stage
          const { id: uid } = ensurePlayer(msg);
          if (uid !== targetId) return true;     // consume others
          const key = parseAnswer(String(msg.text || ""));
          if (!key) return true;
          resolve(K, key === q.correctKey);
          return true; // consume this too
        });
        guardActive = true;
      }

      // 30s timer
      left = 30; total = left;
      leftEl.textContent = String(left);
      fill.style.width = "0%";
      if (t) clearInterval(t);
      t = setInterval(() => {
        left--;
        leftEl.textContent = String(Math.max(0, left));
        const pct = total ? 100 * (total - left) / total : 0;
        fill.style.width = pct + "%";
        if (left <= 0) {
          clearInterval(t); t = null;
          resolve(K, false); // time out = incorrect
        }
      }, 1000);

      cancelBtn.onclick = () => resolve(K, false);
    }

    function resolve(K, ok) {
      // score and cleanup
      if (t) { clearInterval(t); t = null; }
      const p = K.state.players[targetId];
      if (p) {
        if (ok) p.score = (p.score || 0) + 10;
        else    p.score = Math.floor((p.score || 0) * 0.5);
      }
      if (guardActive) { try { K.control.clearChatGuard(); } catch {} guardActive = false; }
      overlay.style.display = "none";
      stage = "idle";
      finish(K);
    }

    function finish(K) {
      running = false;
      targetId = null;
      // continue queued turns or resume main game
      if (queue.length > 0) runIntro(K, queue.shift());
      else K.control.resumeFlow();
    }

    return {
      id: "milestoneSolo",
      name: "Milestone Solo Challenge",
      description: "Intro -> Toliau -> 30s solo. Tik to žaidėjo atsakymas skaičiuojamas.",
      defaultEnabled: true,
      enable(K) {
        mountUI();
        scoresHandler = ({ id, before, after }) => {
          if (Math.floor(after / 100) > Math.floor(before / 100)) {
            if (!queue.includes(id)) queue.push(id);
            // start immediately if idle
            if (!running) kick(K);
          }
        };
        K.on("scoresChanged", scoresHandler);
      },
      disable() {
        try { if (scoresHandler && window.KQuiz) window.KQuiz.off("scoresChanged", scoresHandler); } catch {}
        scoresHandler = null;
        queue.length = 0;
        if (t) { clearInterval(t); t = null; }
        try { window.KQuiz?.control?.clearChatGuard(); } catch {}
        if (overlay) overlay.style.display = "none";
        running = false; targetId = null; stage = "idle";
        unmountUI();
      }
    };
  }

  function register() {
    if (!window.KQuiz || !window.KQuiz.registerAddon) { setTimeout(register, 100); return; }
    window.KQuiz.registerAddon(factory());
  }
  register();
})();
