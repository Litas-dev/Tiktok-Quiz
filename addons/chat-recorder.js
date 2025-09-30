/* KQuiz addon: Chat Recorder v1.0
   Logs raw chat with timestamps and tracks first submissions per round.
   Export JSON/CSV from Settings. */

(function () {
  function factory() {
    let log = [];
    let persist = true;
    const LS_KEY = "kquiz_chatlog_v1";
    const LIMIT = 5000;

    let currRound = 0;
    let currQid = null;
    let roundSubmissions = {}; // userId -> key
    let ui = { card: null, count: null, persistCb: null };

    function nowISO(ts) { try { return new Date(ts).toISOString(); } catch { return ""; } }
    function saveLS() { if (!persist) return; try { localStorage.setItem(LS_KEY, JSON.stringify(log.slice(-LIMIT))); } catch {} }
    function loadLS() { try { const x = JSON.parse(localStorage.getItem(LS_KEY) || "[]"); if (Array.isArray(x)) log = x; } catch {} }
    function bumpCount() { if (ui.count) ui.count.textContent = String(log.length); }

    function mountUI() {
      const grid = document.querySelector("#settings .grid2");
      if (!grid) return;
      const card = document.createElement("div");
      card.className = "card";
      card.id = "chatRecCard";
      card.innerHTML = `
        <h3 style="margin:0 0 8px">Chat įrašymas</h3>
        <div class="muted" style="margin:0 0 8px">Fiksuojami visi chat pranešimai ir pirmi atsakymai kiekviename rate.</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0">
          <button class="btn" id="crExportJson">Eksportuoti JSON</button>
          <button class="btn" id="crExportCsv">Eksportuoti CSV</button>
          <button class="btn alt" id="crClear">Išvalyti</button>
          <label style="margin-left:auto"><input type="checkbox" id="crPersist" checked> Saugoti naršyklėje</label>
        </div>
        <div class="muted">Įrašų: <span id="crCount">0</span></div>
      `;
      grid.appendChild(card);
      ui.card = card;
      ui.count = card.querySelector("#crCount");
      ui.persistCb = card.querySelector("#crPersist");
      ui.persistCb.addEventListener("change", e => { persist = !!e.target.checked; if (persist) saveLS(); });
      card.querySelector("#crClear").onclick = () => { log.length = 0; saveLS(); bumpCount(); };
      card.querySelector("#crExportJson").onclick = () => exportJSON();
      card.querySelector("#crExportCsv").onclick = () => exportCSV();
      bumpCount();
    }

    function exportJSON() {
      const blob = new Blob([JSON.stringify(log, null, 2)], { type: "application/json;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `chat-log-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    }

    function exportCSV() {
      const cols = ["ts", "iso", "round", "qid", "userId", "name", "text", "parsed", "in_window", "accepted", "correct"];
      const rows = [cols.join(",")];
      for (const r of log) {
        const line = [
          r.ts ?? "",
          nowISO(r.ts),
          r.round ?? "",
          r.qid ?? "",
          csvEsc(r.userId),
          csvEsc(r.name),
          csvEsc(r.text),
          r.parsed ?? "",
          r.in_window ? "1" : "0",
          r.accepted ? "1" : "0",
          r.correct === true ? "1" : r.correct === false ? "0" : ""
        ].join(",");
        rows.push(line);
      }
      const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `chat-log-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      function csvEsc(v) {
        const s = String(v ?? "");
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }
    }

    function enable(K) {
      loadLS(); bumpCount(); mountUI();

      K.on("questionStart", ({ qid }) => { currQid = qid; currRound += 1; roundSubmissions = {}; });
      K.on("questionEnd", () => { currQid = null; });

      // Accepted answers are emitted at reveal via scoresChanged
      K.on("scoresChanged", ({ id, correct }) => {
        // find the first log entry for this round from this user that has parsed == roundSubmissions[id]
        const key = roundSubmissions[id];
        if (!key) return;
        for (let i = log.length - 1; i >= 0; i--) {
          const r = log[i];
          if (r.round !== currRound) continue;
          if (r.userId !== id) continue;
          if (r.parsed !== key) continue;
          if (r.accepted) break;
          r.accepted = true;
          r.correct = !!correct;
          break;
        }
        saveLS();
      });

      // Raw chat capture
      K.on("wsMessage", (m) => {
        if (!m || m.type !== "chat") return;
        const st = K.state;
        const { parseAnswer, } = K.util;
        const id = String(m.userId || m.uniqueId || m.displayName || m.nickname || "user");
        const name = String(m.displayName || m.nickname || m.uniqueId || m.userId || "Žaidėjas");
        const text = String(m.text || "");
        const parsed = parseAnswer(text) || "";
        const inWindow = !!(st.session.open && st.session.timerRunning);

        // first submission per round heuristic
        if (inWindow && parsed && !roundSubmissions[id]) {
          roundSubmissions[id] = parsed;
        }

        log.push({
          ts: Date.now(),
          round: currRound,
          qid: currQid,
          userId: id,
          name,
          text,
          parsed,
          in_window: inWindow,
          accepted: false
        });
        if (log.length > LIMIT) log.splice(0, log.length - LIMIT);
        bumpCount(); saveLS();
      });
    }

    function disable() {
      // Remove UI
      try { if (ui.card && ui.card.parentNode) ui.card.parentNode.removeChild(ui.card); } catch {}
      ui = { card: null, count: null, persistCb: null };
      // No need to clear log; user controls it.
      // Remove listeners
      try {
        window.KQuiz?.off("wsMessage", null); // noop; bus doesn’t expose per-handler removal reliably here
      } catch {}
    }

    return {
      id: "chatRecorder",
      name: "Chat Recorder",
      description: "Įrašo visą chat ir pirmus atsakymus. Eksportas JSON/CSV.",
      defaultEnabled: true,
      enable, disable
    };
  }

  function register() {
    if (!window.KQuiz || !window.KQuiz.registerAddon) return setTimeout(register, 100);
    window.KQuiz.registerAddon(factory());
  }
  register();
})();
