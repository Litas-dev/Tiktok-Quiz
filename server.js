// server.js
// Node 18+ recommended. ESM module.
// Start: `npm start`
// Config: set USERNAME in config.json or env.

import fs from "node:fs";
import http from "node:http";
import { WebSocketServer } from "ws";
import { WebcastPushConnection, WebcastEvent } from "tiktok-live-connector";

// ---------- Config ----------
const cfg = (() => {
  try {
    return JSON.parse(fs.readFileSync("./config.json", "utf8"));
  } catch {
    return {};
  }
})();
const USERNAME = process.env.TT_USERNAME || cfg.username || cfg.USERNAME || "";
if (!USERNAME) {
  console.error("Missing username. Set TT_USERNAME env or config.json {\"username\":\"...\"}");
  process.exit(1);
}

const PORT = Number(process.env.PORT || 8077);
const HEALTH_PORT = Number(process.env.HEALTH_PORT || 8078);
const WS_PATH = "/"; // change if needed

// ---------- HTTP health ----------
const healthServer = http.createServer((_, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("ok");
});
healthServer.listen(HEALTH_PORT, () => {
  console.log(`[health] http://localhost:${HEALTH_PORT}`);
});

// ---------- WebSocket hub ----------
const wss = new WebSocketServer({ port: PORT, path: WS_PATH });
const clients = new Set();

wss.on("connection", (ws) => {
  clients.add(ws);
  ws.on("close", () => clients.delete(ws));
  ws.on("error", () => {/* no-op */});
});

function broadcast(obj) {
  const data = typeof obj === "string" ? obj : JSON.stringify(obj);
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(data);
  }
}

// Keep connections alive
setInterval(() => {
  for (const ws of clients) {
    if (ws.readyState === 1) ws.ping();
  }
}, 25000);

console.log(`[ws] listening ws://localhost:${PORT}${WS_PATH}`);

// ---------- TikTok connection with auto-retry ----------
let conn = null;
let stopping = false;

const baseBackoffMs = 2000;
const maxBackoffMs = 30000;

async function startConnection() {
  let attempt = 0;

  while (!stopping) {
    try {
      conn = new WebcastPushConnection(USERNAME, {
        // Keep defaults sane. Tweak if needed.
        processInitialData: true,
        enableExtendedGiftInfo: false
      });

      wireHandlers(conn);

      console.log(`[tiktok] connecting as @${USERNAME} ...`);
      await conn.connect();
      console.log("[tiktok] connected");
      attempt = 0; // reset backoff after success

      // Wait here until disconnected
      await new Promise((resolve) => conn.once("disconnected", resolve));
      console.warn("[tiktok] disconnected");
      if (stopping) break;

    } catch (err) {
      console.error("[tiktok] connect error:", err?.message || err);
    }

    // Backoff then retry
    attempt++;
    const sleep = Math.min(baseBackoffMs * Math.pow(2, attempt - 1), maxBackoffMs);
    console.log(`[tiktok] retry in ${sleep} ms`);
    await new Promise((r) => setTimeout(r, sleep));
  }
}

function stopConnection() {
  stopping = true;
  try { conn?.disconnect(); } catch { /* no-op */ }
}

// ---------- Event wiring ----------
function wireHandlers(connection) {
  // Unified user picture extractor
  const getProfilePicture = (u) =>
    u?.profilePictureUrl ||
    u?.profilePicture ||
    u?.avatarLarger?.urlList?.[0] ||
    u?.avatarMedium?.urlList?.[0] ||
    u?.avatarThumb?.urlList?.[0] ||
    null;

  // Normalize user fields
  const normUser = (u = {}) => ({
    userId: u.userId || u.secUid || u.uniqueId || null,
    uniqueId: u.uniqueId || null,
    displayName: u.nickname || u.uniqueId || "Unknown",
    profilePicture: getProfilePicture(u)
  });

  // Utility: answer detection (A/B/C/D or 1–4, exact match)
  const isAnswer = (txt = "") => /^[a-d1-4]$/i.test(txt.trim());

  // Connected
  connection.on("connected", (state) => {
    broadcast({ type: "status", status: "connected", room: state?.roomId || null, ts: Date.now() });
  });

  // Disconnected
  connection.on("disconnected", () => {
    broadcast({ type: "status", status: "disconnected", ts: Date.now() });
    // upstream startConnection loop will handle retry
  });

  // Errors
  connection.on("streamEnd", () => {
    broadcast({ type: "status", status: "ended", ts: Date.now() });
    try { connection.disconnect(); } catch {}
  });
  connection.on("error", (err) => {
    broadcast({ type: "status", status: "error", message: String(err?.message || err), ts: Date.now() });
  });

  // Core: CHAT
  connection.on(WebcastEvent.CHAT, (data) => {
    const u = normUser(data?.user);
    const text = data?.comment || "";
    const payload = {
      type: "chat",
      text,
      user: u,
      // backward compat keys many UIs expect:
      userId: u.userId,
      displayName: u.displayName,
      avatar: u.profilePicture,             // legacy
      profilePicture: u.profilePicture,     // canonical
      ts: Date.now()
    };
    broadcast(payload);

    if (isAnswer(text)) {
      broadcast({
        type: "answer",
        value: text.trim().toUpperCase(),   // "A".."D" or "1".."4"
        user: u,
        userId: u.userId,
        displayName: u.displayName,
        profilePicture: u.profilePicture,
        ts: Date.now()
      });
    }
  });

  // Optional: LIKE events
  connection.on(WebcastEvent.LIKE, (data) => {
    const u = normUser(data?.user);
    broadcast({
      type: "like",
      count: data?.likeCount || 1,
      total: data?.totalLikeCount || null,
      user: u,
      userId: u.userId,
      displayName: u.displayName,
      profilePicture: u.profilePicture,
      ts: Date.now()
    });
  });

  // Optional: GIFT events
  connection.on(WebcastEvent.GIFT, (data) => {
    const u = normUser(data?.user);
    broadcast({
      type: "gift",
      id: data?.giftId || null,
      name: data?.giftName || data?.gift?.name || null,
      repeatCount: data?.repeatCount || 1,
      diamondCount: data?.diamondCount || data?.gift?.diamond_count || 0,
      user: u,
      userId: u.userId,
      displayName: u.displayName,
      profilePicture: u.profilePicture,
      ts: Date.now()
    });
  });

  // Optional: JOIN events
  connection.on(WebcastEvent.MEMBER, (data) => {
    const u = normUser(data?.user);
    broadcast({
      type: "join",
      user: u,
      userId: u.userId,
      displayName: u.displayName,
      profilePicture: u.profilePicture,
      ts: Date.now()
    });
  });
}

// Graceful shutdown
process.on("SIGINT", () => { console.log("SIGINT"); stopConnection(); process.exit(0); });
process.on("SIGTERM", () => { console.log("SIGTERM"); stopConnection(); process.exit(0); });

// Boot
startConnection().catch((e) => {
  console.error("fatal start error", e);
  process.exit(1);
});
