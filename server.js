// server.js — HTTP+WS server with avatar proxy, modern client, no gifts
// Node 18+
// Start: node server.js   (reads ./config.json)   or   set TT_USERNAME and run
// config.json example: {"username":"zmoguskunasvardas"}

import http from "node:http";
import fs from "node:fs";
import { Readable } from "node:stream";
import { WebSocketServer } from "ws";
import { TikTokLiveConnection, WebcastEvent } from "tiktok-live-connector";

// ---------- Config ----------
let CFG_USERNAME = "";
try {
  const raw = fs.readFileSync("./config.json", "utf8");
  CFG_USERNAME = JSON.parse(raw)?.username || "";
} catch {}
const USERNAME = process.env.TT_USERNAME || CFG_USERNAME;
if (!USERNAME) {
  console.error('Missing username. Set TT_USERNAME or put {"username":"..."} in config.json');
  process.exit(1);
}

const PORT = Number(process.env.PORT || 8081);
const WS_PATH = "/";

// ---------- HTTP server (health + avatar proxy) ----------
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === "/health") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
      return;
    }

    if (url.pathname === "/img") {
      const u = url.searchParams.get("u");
      if (!u || !/^https?:\/\//i.test(u)) {
        res.writeHead(400, { "content-type": "text/plain" });
        res.end("bad url");
        return;
      }
      const upstream = await fetch(u, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
          "Referer": "https://www.tiktok.com/",
          "Origin": "https://www.tiktok.com"
        }
      });
      if (!upstream.ok) {
        res.writeHead(502, { "content-type": "text/plain" });
        res.end("upstream error");
        return;
      }
      const ct = upstream.headers.get("content-type") || "image/jpeg";
      res.writeHead(200, {
        "content-type": ct,
        "cache-control": "public, max-age=300",
        "access-control-allow-origin": "*"
      });
      if (upstream.body) {
        Readable.fromWeb(upstream.body).pipe(res);
      } else {
        const buf = Buffer.from(await upstream.arrayBuffer());
        res.end(buf);
      }
      return;
    }

    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  } catch (e) {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end("server error");
  }
});

server.listen(PORT, () => {
  console.log(`[http] http://localhost:${PORT}  |  proxy: GET /img?u=ENCODED_URL`);
});

// ---------- WebSocket hub ----------
const wss = new WebSocketServer({ server, path: WS_PATH });
const clients = new Set();
wss.on("connection", (ws) => {
  clients.add(ws);
  ws.on("close", () => clients.delete(ws));
  ws.on("error", () => {});
});
function broadcast(obj) {
  const data = typeof obj === "string" ? obj : JSON.stringify(obj);
  for (const ws of clients) if (ws.readyState === 1) ws.send(data);
}
setInterval(() => { for (const ws of clients) if (ws.readyState === 1) ws.ping(); }, 25000);
console.log(`[ws] listening ws://localhost:${PORT}${WS_PATH}`);

// ---------- TikTok connection (modern, gift-free) ----------
let conn = null;
let stopping = false;

async function startConnection() {
  let attempt = 0;
  while (!stopping) {
    try {
      conn = new TikTokLiveConnection(USERNAME, {
        processInitialData: false,
        fetchRoomInfoOnConnect: true,
        enableExtendedGiftInfo: false
      });
      wireHandlers(conn);
      console.log(`[tiktok] connecting @${USERNAME}`);
      await conn.connect();
      console.log("[tiktok] connected");
      attempt = 0;
      await new Promise((resolve) => conn.once("disconnected", resolve));
      if (stopping) break;
      console.warn("[tiktok] disconnected");
    } catch (err) {
      console.error("[tiktok] connect error:", err?.message || err);
    }
    attempt++;
    const sleep = Math.min(2000 * 2 ** (attempt - 1), 30000);
    console.log(`[tiktok] retry in ${sleep} ms`);
    await new Promise((r) => setTimeout(r, sleep));
  }
}

const first = (x) => (Array.isArray(x) && x.length ? x[0] : null);
const picFrom = (obj) => {
  if (!obj) return null;
  if (typeof obj === "string") return obj;
  return (
    obj.profilePictureUrl ||
    first(obj.profilePicture?.urlList) ||
    first(obj.profilePicture?.urls) ||
    first(obj.profilePicture?.url_list) ||
    obj.profilePicture?.uri ||
    first(obj.avatarLarger?.urlList) ||
    first(obj.avatarMedium?.urlList) ||
    first(obj.avatarThumb?.urlList) ||
    first(obj.avatarLarger?.urls) ||
    first(obj.avatarMedium?.urls) ||
    first(obj.avatarThumb?.urls) ||
    obj.avatarLarger?.uri ||
    obj.avatarMedium?.uri ||
    obj.avatarThumb?.uri ||
    null
  );
};
const normUser = (evt = {}) => {
  const u = evt.user || {};
  const userId = (u.userId ?? evt.userId ?? u.secUid ?? evt.secUid ?? u.uniqueId ?? evt.uniqueId ?? "user") + "";
  const displayName = u.nickname || evt.nickname || u.uniqueId || evt.uniqueId || userId || "Guest";
  const profilePicture = u.profilePictureUrl || picFrom(u) || picFrom(evt) || null;
  return { userId, displayName, profilePicture };
};
const isAnswer = (t = "") => /^[a-d1-4]$/i.test(String(t).trim());

function wireHandlers(connection) {
  connection.on("connected", (state) => { broadcast({ type: "status", status: "connected", room: state?.roomId || null, ts: Date.now() }); });
  connection.on("disconnected", () => { broadcast({ type: "status", status: "disconnected", ts: Date.now() }); });
  connection.on(WebcastEvent.STREAM_END, () => { broadcast({ type: "status", status: "ended", ts: Date.now() }); try { connection.disconnect(); } catch {} });
  connection.on("error", (err) => { broadcast({ type: "status", status: "error", message: String(err?.message || err), ts: Date.now() }); });

  const emitFrame = (kind, d) => {
    const u = normUser(d);
    const base = {
      type: kind,
      user: u,
      userId: u.userId,
      displayName: u.displayName,
      profilePicture: u.profilePicture,
      avatar: u.profilePicture,
      ts: Date.now()
    };
    if (kind === "chat") base.text = (d?.comment || "").trim();
    broadcast(base);
    if (kind === "chat" && isAnswer(base.text)) {
      broadcast({ type: "answer", value: base.text.toUpperCase(), ...base });
    }
  };

  connection.on(WebcastEvent.CHAT,   (d) => emitFrame("chat", d));
  connection.on(WebcastEvent.MEMBER, (d) => emitFrame("member", d));
  connection.on(WebcastEvent.LIKE,   (d) => emitFrame("like", d));
  // No gifts
}

process.on("SIGINT",  () => { console.log("SIGINT");  stopping = true; try { conn?.disconnect(); } catch {}; process.exit(0); });
process.on("SIGTERM", () => { console.log("SIGTERM"); stopping = true; try { conn?.disconnect(); } catch {}; process.exit(0); });

startConnection().catch((e) => { console.error("fatal start error", e); process.exit(1); });
