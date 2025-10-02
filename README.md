# TikTok Quiz

Opinionated, low-latency TikTok Live quiz runner. WebSocket relay + browser UI + optional add‑ons.

## System of record
- **Node:** 18+ (ESM only)
- **TikTok Live Connector:** **^2.0.3** (stable). Pin this. Do **not** use 5.x.
- **Browsers:** Modern Chromium/Firefox

---

## Install
```bash
npm i
```

## Configure
Create `config.json` with the broadcaster username:
```json
{ "username": "YOUR_TIKTOK_LIVE_USERNAME" }
```
Or set an environment variable:
```bash
# Windows (CMD)
set TT_USERNAME=YOUR_TIKTOK_LIVE_USERNAME
# PowerShell
$env:TT_USERNAME="YOUR_TIKTOK_LIVE_USERNAME"
# macOS/Linux
export TT_USERNAME=YOUR_TIKTOK_LIVE_USERNAME
```

## Operate
Two processes. Keep concerns separate.

**1) Relay (WebSocket + health + optional avatar proxy)**
```bash
node server.js
# WS:   ws://localhost:8081
# HTTP: http://localhost:8081
# Health: GET /health  -> "ok"
# Avatar proxy: GET /img?u=ENCODED_TIKTOK_URL
```

**2) Static UI**
```bash
npx http-server -p 5500
# open http://localhost:5500
# in Settings, set WebSocket URL to: ws://localhost:8081
```

> If you insist on one process, you can fold static serving into `server.js`. Default is split for clarity and failure isolation.

---

## Avatars: what to expect
- TikTok Live Connector exposes a **direct image URL** on each user event as `profilePictureUrl`. That is the primary source of truth.
- The client caches per‑user photos in `KQuiz.state.players[uid].avatar` (also `pfp` for legacy code paths). Winners and add‑ons read from that cache.

**When do images fail?**
- If a given event does **not** include a profile photo, there is nothing to render. Some sessions omit it on chat but include it on member/like.
- Some CDNs block hotlinking. If direct URLs break, use the built‑in proxy:

```
http://localhost:8081/img?u=ENCODED_TIKTOK_URL
```

`app.js` exposes `KQuiz.util.proxyURL(url)` so add‑ons can opt in to proxying without hardcoding host/port.

---

## Add‑ons
All add‑ons are opt‑in. Load via `<script>` tags in `index.html` then toggle in **Settings → Add‑ons**.

- **`addons/milestone-solo.js`**  
  Triggers a solo challenge at 100/200/300… points. Pauses the main round and runs a one‑question, timed spotlight for that player.

- **`addons/leaderboard.js`**  
  Renders a live leaderboard panel. Read‑only. Pulls from `KQuiz.state.players`.

- **`addons/avatar-flyover.js`** *(v1.1)*  
  On valid answers during the timer (A/B/C/D or 1–4), shows a small avatar flying across the screen. Sources from `profilePictureUrl` then the cached players map. Uses `KQuiz.util.proxyURL()` if present.

- **`addons/chat-recorder.js`**  
  Lightweight chat logger for moderation/debug. Stores recent chats in memory; no persistent storage.

Example script tags with cache‑busting:
```html
<!-- Core -->
<script src="app.js?v=20251002" defer></script>

<!-- Add‑ons -->
<script src="addons/milestone-solo.js?v=2" defer></script>
<script src="addons/leaderboard.js?v=2" defer></script>
<script src="addons/avatar-flyover.js?v=2" defer></script>
<script src="addons/chat-recorder.js?v=2" defer></script>
```

---

## Authoring questions
Load a JSON array in **Settings → Upload**. Shape:
```json
[
  { "q": "Capital of France?", "correct": "Paris", "wrong": ["Lyon","Marseille","Nice"], "note":"", "cat":"Geography" }
]
```

---

## Troubleshooting runbook
1) **No avatars anywhere**
   - DevTools → Network → WS → select your socket → Frames. Click a recent `chat` or `member` frame.
   - Field must contain a URL: `profilePictureUrl` (or `profilePicture` for raw). If empty, upstream didn’t send a photo for that event.

2) **Overlay blank but proxy test works**
   - Your UI may be requesting `/img?...` on port 5500. Use absolute host: `http://localhost:8081/img?u=...` or the provided `proxyURL()` helper.

3) **Stale JavaScript**
   - Browsers cache aggressively. Bump query strings (`?v=...`) and hard refresh (Ctrl+F5). Remove any CSP `<meta http-equiv="Content-Security-Policy">` while testing.

4) **Gift crash**
   - This codebase does not subscribe to gifts. Ensure the dependency is **tiktok-live-connector@^2.0.3** then reinstall:
     ```bash
     del package-lock.json
     rmdir /s /q node_modules
     npm i
     ```

5) **Verify cached players**
   - Console:
     ```js
     Object.values(KQuiz.state.players).map(p => p.avatar || p.pfp).filter(Boolean)
     ```

6) **Socket not connecting**
   - Confirm the UI points to `ws://localhost:8081`. Check server logs for `[tiktok] connected`.

---

## NPM scripts (optional)
```json
{
  "scripts": {
    "relay": "node server.js",
    "ui": "http-server -p 5500"
  }
}
```

## Notes
- Serve over HTTP. Do not open `index.html` with `file://`.
- Ports can be changed via `PORT` and `HEALTH_PORT` env vars.
- ESM only; no `require()`.

## License
See [`LICENSE`](./LICENSE) for terms.
