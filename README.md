# TikTok Quiz

Minimal, production‑minded setup for running a TikTok Live multiple‑choice quiz with WebSocket relay and add‑ons.

## Support Matrix
- **Node:** 18+ (ESM)
- **TikTok Live Connector:** **^2.0.3** (stable)  
  Pin this version. Do **not** use 5.x.

## Install
```bash
npm i
```

## Configure
Create `config.json`:
```json
{ "username": "YOUR_TIKTOK_LIVE_USERNAME" }
```
Or set env:
```bash
TT_USERNAME=YOUR_TIKTOK_LIVE_USERNAME
```

## Run
Two processes:

**1) TikTok relay (WS + optional avatar proxy)**
```bash
node server.js
# WS:   ws://localhost:8081
# HTTP: http://localhost:8081   (health: /health, avatar proxy: /img?u=...)
```

**2) Static UI**
```bash
npx http-server -p 5500
# open http://localhost:5500
# set WebSocket URL in the UI to: ws://localhost:8081
```

> If you don’t want two processes, fold static serving into `server.js`. Default repo keeps them separate for clarity.

## Avatars
- Events carry `profilePictureUrl`. The client caches per‑user images and renders them on reveal and in add‑ons.  
- By default the client uses **direct TikTok URLs**. If your CDN blocks hotlinks, enable the built‑in proxy by wrapping image URLs as:
  ```
  http://localhost:8081/img?u=ENCODED_TIKTOK_URL
  ```
  (Add‑ons use `KQuiz.util.proxyURL()` if present.)

## Add‑ons
- Enabled via `<script>` tags in `index.html`.
- `avatar-flyover.js` v1.1 pulls photos from `profilePictureUrl` and the cached players map, with optional proxy support.
- `leaderboard.js`, `milestone-solo.js`, `chat-recorder.js` are read‑only and do not mutate avatar state.

## Cache Busting
Browsers cache aggressively. Bump query strings after changes:
```html
<script src="app.js?v=20251002" defer></script>
<script src="addons/avatar-flyover.js?v=2" defer></script>
```

## Troubleshooting
1. **No avatars**  
   - Open DevTools → Network → WS → select your socket → Frames. Check a recent `chat`/`member`.  
   - You must see a full URL in `profilePictureUrl` (or `profilePicture`).  
   - If empty: TikTok did not send a photo for that user/event.

2. **Images broken in overlay but proxy test works**  
   - Your UI hits `http://localhost:5500/img?...` by mistake. Use absolute proxy base `http://localhost:8081/img?u=...` or the provided helper.

3. **Old JS served**  
   - Increase `?v=` and hard refresh (Ctrl+F5). Disable CSP `<meta http-equiv="Content-Security-Policy">`.

4. **Connector errors about gifts**  
   - We do **not** subscribe to gifts. Ensure package is `tiktok-live-connector@^2.0.3` and reinstall:
     ```bash
     del package-lock.json
     rmdir /s /q node_modules
     npm i
     ```

5. **Verify cached players**  
   - In the console:
     ```js
     Object.values(KQuiz.state.players).map(p => p.avatar || p.pfp).filter(Boolean)
     ```

## Scripts
Optional NPM scripts:
```json
{
  "scripts": {
    "relay": "node server.js",
    "ui": "http-server -p 5500"
  }
}
```

## Notes
- Serve over HTTP. Do not open `index.html` via `file://`.
- Ports can be changed via `PORT` and `HEALTH_PORT` env vars.
- This repo is ESM‑only; no `require()`.

License: MIT
