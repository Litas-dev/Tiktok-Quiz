# Kostelio Klausimynas

Mobile‑first quiz for TikTok LIVE. Runs as a static web app. Optional Node relay ingests chat and maps `A/B/C/D` or `1–4` to answers.

## Value Proposition
- Audience engagement with timer‑gated rounds and scoring.
- Zero backend for core play. Optional WebSocket bridge for chat answers.
- Add‑on architecture for feature velocity. No core edits required.

## Feature Set
- Responsive UI optimized for phones.
- Question bank loader (JSON). Timer, reveal, scoring, leaderboard.
- Audio cues (tick while active, fail if no winners).
- Live‑safe layout: bottom safe area to avoid TikTok chat overlap. Toggle in Settings.
- **Add‑on:** Milestone Solo Challenge (optional module).

## Architecture
```
index.html
style.css
app.js                 # Core engine with plugin API
addons/
  milestone-solo.js    # Add-on: personal challenge at 100/200/300… pts
server.js              # Example relay (optional)
package.json
config.example.json
```
Core exposes a lightweight API on `window.KQuiz`:

```js
// Events
KQuiz.on('init' | 'questionStart' | 'questionEnd' | 'scoresChanged', handler)

// State and helpers
KQuiz.state            // game state (players, settings, session)
KQuiz.util.el, KQuiz.util.$, KQuiz.util.$$, KQuiz.util.parseAnswer

// Control surface
KQuiz.control.pauseMain()
KQuiz.control.resumeFlow()
KQuiz.control.nextQuestionNow()
KQuiz.control.setChatGuard(fn)   // intercept chat; return truthy to consume
KQuiz.control.clearChatGuard()
KQuiz.control.getRandomQuestion() // {q, options[4], keys[4], correctKey, correctText}
```

### Add‑on: Milestone Solo Challenge
- Trigger: whenever a player’s score crosses 100‑point boundaries (100, 200, 300, …).
- Flow: core pauses → full‑screen modal with player avatar/name → 12s timed single question.
- Input gate: only that player’s chat input is accepted during the solo.
- Scoring: +10 if correct; otherwise reduce current score by 50%.
- Queue: multiple players run one‑by‑one. Resumes round after queue drains.
- Implementation lives entirely in `addons/milestone-solo.js` and is loaded via a `<script>` tag.

## Getting Started
1. Open `index.html` in a modern browser.
2. Settings → **Live režimas** ON if streaming on TikTok. Set **Apatinis chat aukštis** to match the chat overlay.
3. Load your question bank JSON.
4. Press **Start**.

### Question Bank Format
```json
[
  {
    "q": "Kada Cezaris peržengė Rubikoną?",
    "correct": "49",
    "wrong": ["84", "61", "39"],
    "note": "49 m. pr. Kr.",
    "cat": "istorija"
  }
]
```

## TikTok Chat Relay (Optional)
Minimal Node relay using `tiktok-live-connector` + WebSocket broadcast.

**server.js**
```js
// broadcasts {type:'chat', userId, displayName, avatar, text} to ws://localhost:8081
```

**package.json**
```json
{
  "name": "tiktok-quiz-relay",
  "private": true,
  "type": "module",
  "dependencies": {
    "tiktok-live-connector": "^5",
    "ws": "^8"
  },
  "scripts": { "start": "node server.js" }
}
```

**config.example.json**
```json
{ "username": "YOUR_TIKTOK_USERNAME" }
```

Point the quiz to the relay in Settings. Click **Prisijungti**.

## Keyboard Shortcuts
- Space: Reveal or continue.

## License
MIT.

