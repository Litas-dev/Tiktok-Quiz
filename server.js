// server.js — TikTok → WebSocket bridge with auto-reconnect (ESM)
import { WebSocketServer } from "ws";
import { WebcastPushConnection } from "tiktok-live-connector";

const USERNAME = process.env.TIKTOK_USERNAME || process.argv[2] || "ibuxas"; // no "@"
const PORT = parseInt(process.env.PORT || "8081", 10);

if (!USERNAME) {
  console.error('Usage: node server.js <tiktok_username>');
  process.exit(1);
}

const wss = new WebSocketServer({ port: PORT });
const clients = new Set();
wss.on("connection", ws => { clients.add(ws); ws.on("close", ()=>clients.delete(ws)); });
console.log(`[WS] up on ws://localhost:${PORT}`);

function broadcast(obj){
  const msg = JSON.stringify(obj);
  for (const ws of clients) { try{ ws.send(msg); }catch{} }
}
// optional keepalive
setInterval(()=>broadcast({type:"ping", t:Date.now()}), 25000);

// --- TikTok connector with backoff reconnect ---
const tiktok = new WebcastPushConnection(USERNAME, { enableExtendedGiftInfo: false });

let attempt = 0;
const MAX_DELAY = 60000;

async function connectTikTok(){
  try{
    const state = await tiktok.connect();
    attempt = 0;
    console.log(`[TT] connected roomId=${state.roomId}`);
  }catch(err){
    scheduleReconnect(err?.message || err);
  }
}
function scheduleReconnect(reason){
  const delay = Math.min(1000 * (2 ** attempt++), MAX_DELAY);
  console.log(`[TT] reconnecting in ${delay}ms (${reason})`);
  setTimeout(connectTikTok, delay);
}

broadcast({
  type: 'chat',
  uniqueId: String(data.uniqueId || data.user?.uniqueId || ''),
  userId:   String(data.userId   || data.user?.userId   || ''),
  displayName: data.nickname || data.user?.nickname || data.uniqueId || '',
  avatar:   data.profilePictureUrl || data.user?.profilePictureUrl || '',
  text:     data.comment || data.msg || ''
});


tiktok.on("disconnected", () => { console.log("[TT] disconnected"); scheduleReconnect("disconnected"); });
tiktok.on("streamEnd",   () => { console.log("[TT] stream ended"); scheduleReconnect("streamEnd"); });
tiktok.on("error", err   => { console.error("[TT] error", err?.message || err); /* backoff handled by disconnected/streamEnd; also retry on hard errors */ });

connectTikTok();
