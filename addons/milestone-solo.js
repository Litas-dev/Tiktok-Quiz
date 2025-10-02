/* KQuiz addon: Milestone Solo Challenge v1.3 (manual resume)
   Flow: intro (name+avatar) -> host clicks "Toliau" -> 30s question.
   Only that player’s chat counts. Shows result with correct answer.
   Sounds: timer tick (if enabled in core), fail sound on wrong/timeout.
   Change v1.3: no auto-resume; host must click "Tęsti žaidimą". Highlights correct choice.
*/

(function () {
  function factory() {
    let queue = [];
    let running = false;
    let targetId = null;
    let stage = "idle"; // 'idle' | 'intro' | 'question'
    let t = null, left = 0, total = 0;
    let overlay = null, styleEl = null, mounted = false;
    let scoresHandler = null;
    let guardActive = false;

    // keep current question info for result display
    let curQ = null;

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
.kq-choice.is-correct{outline:3px solid #2EE5A9}
.kq-choice.is-dim{filter:grayscale(.35) opacity(.85)}
.kq-key{min-width:56px;height:44px;display:inline-flex;align-items:center;justify-content:center;border-radius:14px;background:#0E1730;border:1px solid #26365A;color:#BBD7FF;font-weight:900}
.kq-bar{height:14px;border-radius:999px;background:#11213A;border:1px solid #1E2A3F;overflow:hidden;margin-top:6px}
.kq-fill{height:100%;width:0%;background:linear-gradient(90deg,#7C5CFF,#2EE5A9)}
.kq-ctrls{display:flex;gap:10px;justify-content:center;margin-top:12px;flex-wrap:wrap}
.kq-btn{padding:10px 14px;border-radius:14px;border:1px solid #1E2A3F;background:#0E162B;color:#F3F6FC;font-weight:900;cursor:pointer}
.kq-hide{display:none}
.kq-result{margin-top:10px;text-align:center;font-weight:900;font-size:clamp(16px,3vw,22px)}
.kq-result.ok{color:#2EE5A9}
.kq-result.bad{color:#FF5A6E}
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
            <div id="kqSoloResult" class="kq-result kq-hide"></div>
            <div class="kq-ctrls">
              <button class="kq-btn" id="kqSoloCancel2">Atšaukti</button>
              <button class="kq-btn kq-hide" id="kqSoloResume">Tęsti žaidimą</button>
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

      const p = K.state.players[id];
      document.getElementById("kqSoloName").textContent = p?.name || id;
      document.getElementById("kqSoloAva").src = p?.avatar || "";

      document.getElementById("kqSoloIntro").classList.remove("kq-hide");
      document.getElementById("kqSoloPlay").classList.add("kq-hide");
      overlay.style.display = "flex";

      document.getElementById("kqSoloGo").onclick = () => startQuestion(K);
      document.getElementById("kqSoloCancel1").onclick = () => resolve(K, false); // treat cancel as incorrect
    }

    function startQuestion(K) {
      if (stage !== "intro") return;
      stage = "question";

      // random question
      const q = K.control.getRandomQuestion() || {
        q: "Klausimas",
        options: ["Atsakymas A", "Atsakymas B", "Atsakymas C", "Atsakymas D"],
        keys: ["A", "B", "C", "D"],
        correctKey: "A",
        correctText: "Atsakymas A"
      };
      curQ = q;

      document.getElementById("kqSoloIntro").classList.add("kq-hide");
      document.getElementById("kqSoloPlay").classList.remove("kq-hide");
      document.getElementById("kqSoloResult").classList.add("kq-hide");

      const qEl = document.getElementById("kqSoloQ");
      const box = document.getElementById("kqSoloAns");
      const fill = document.getElementById("kqSoloFill");
      const leftEl = document.getElementById("kqSoloLeft");
      const cancelBtn = document.getElementById("kqSoloCancel2");
      const resumeBtn = document.getElementById("kqSoloResume");

      if (resumeBtn) resumeBtn.classList.add("kq-hide");

      qEl.textContent = q.q;
      box.innerHTML = "";
      q.options.forEach((opt, i) => {
        const key = q.keys[i];
        const node = K.util.el("div", { class: "kq-choice", "data-key": key }, K.util.el("div", { class: "kq-key" }, key), opt);
        box.appendChild(node);
      });

      // accept only this user's answer while in question stage
      if (!guardActive) {
        K.control.setChatGuard((msg, { parseAnswer, ensurePlayer }) => {
          if (stage !== "question") return true;
          const { id: uid } = ensurePlayer(msg);
          if (uid !== targetId) return true;
          const key = parseAnswer(String(msg.text || ""));
          if (!key) return true;
          resolve(K, key === q.correctKey);
          return true;
        });
        guardActive = true;
      }

      // start tick sound if enabled in core
      try {
        if (K.state.settings.sounds.ticking) {
          const a = document.getElementById("tickAudio");
          if (a) { a.currentTime = 0; a.play(); }
        }
      } catch {}

      // 30s timer
      left = 30; total = left;
      leftEl.textContent = String(left);
      fill.style.width = "0%";
      if (t) clearInterval(t);
      t = setInterval(() => {
        left--;
        leftEl.textContent = String(Math.max(0, left));
        fill.style.width = (total ? (100 * (total - left) / total) : 0) + "%";
        if (left <= 0) { clearInterval(t); t = null; resolve(K, false); } // timeout = incorrect
      }, 1000);

      cancelBtn.onclick = () => resolve(K, false);
    }

    function stopTick() {
      try { const a = document.getElementById("tickAudio"); if (a) a.pause(); } catch {}
    }

    function playFail() {
      try {
        if (window.KQuiz?.state?.settings?.sounds?.fail) {
          const f = document.getElementById("failAudio");
          if (f) { f.currentTime = 0; f.play(); }
        }
      } catch {}
    }

    function highlightCorrect() {
      if (!curQ) return;
      try {
        const nodes = Array.from(document.querySelectorAll("#kqSoloAns .kq-choice"));
        nodes.forEach(n => {
          const k = (n.getAttribute("data-key") || "").trim();
          if (k === curQ.correctKey) n.classList.add("is-correct");
          else n.classList.add("is-dim");
        });
      } catch {}
    }

    function resolve(K, ok) {
      if (t) { clearInterval(t); t = null; }
      stopTick();

      // score
      const p = K.state.players[targetId];
      if (p) p.score = ok ? (p.score || 0) + 10 : Math.floor((p.score || 0) * 0.5);

      // result banner with correct answer
      const res = document.getElementById("kqSoloResult");
      if (res && curQ) {
        res.classList.remove("kq-hide");
        res.classList.toggle("ok", !!ok);
        res.classList.toggle("bad", !ok);
        res.textContent = ok
          ? `Teisinga! +10 (${curQ.correctText})`
          : `Neteisinga. −50% | Teisingas: ${curQ.correctText}`;
      }

      // visually mark the correct choice
      highlightCorrect();

      if (!ok) playFail();

      // release chat guard, but keep overlay visible
      if (guardActive) { try { K.control.clearChatGuard(); } catch {} guardActive = false; }

      // show manual resume button; do NOT auto-resume
      const resumeBtn = document.getElementById("kqSoloResume");
      if (resumeBtn) {
        resumeBtn.classList.remove("kq-hide");
        resumeBtn.onclick = () => {
          try { overlay.style.display = "none"; } catch {}
          // reset solo state
          stage = "idle"; running = false; targetId = null; curQ = null;
          // resume main flow on host command
          try { K.control.resumeFlow(); } catch {}
          // optional: do NOT auto-kick next queued solos here
        };
      }
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
        stopTick();
        try { window.KQuiz?.control?.clearChatGuard(); } catch {}
        if (overlay) overlay.style.display = "none";
        running = false; targetId = null; stage = "idle"; curQ = null;
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