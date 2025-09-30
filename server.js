// server.js — TikTok → WebSocket tiltas
import { WebSocketServer } from 'ws';
import TikTokLiveConnection from 'tiktok-live-connector';

const USERNAME = process.env.TIKTOK_USERNAME || (process.argv[2] || 'ibuxas');
const PORT = parseInt(process.env.PORT || '8081', 10);

const wss = new WebSocketServer({ port: PORT });
const clients = new Set();
wss.on('connection', ws => { clients.add(ws); ws.on('close', ()=>clients.delete(ws)); });
console.log(`[WS] up on ws://localhost:${PORT}`);

function broadcast(obj){
  const msg = JSON.stringify(obj);
  for (const ws of clients){ try{ ws.send(msg); }catch{} }
}

const tiktok = new TikTokLiveConnection(USERNAME, { enableExtendedGiftInfo: false });

tiktok.on('connected', state => console.log(`[TT] connected roomId=${state.roomId}`));
tiktok.on('disconnected', ()=> console.log('[TT] disconnected'));
tiktok.on('streamEnd', ()=> console.log('[TT] stream ended'));

tiktok.on('chat', data => {
  broadcast({
    type:'chat',
    userId: String(data.userId || data.user?.userId || ''),
    uniqueId: data.uniqueId || data.user?.uniqueId || '',
    displayName: data.nickname || data.user?.nickname || data.uniqueId || '',
    nickname: data.nickname || '',
    avatar: data.profilePictureUrl || data.user?.profilePictureUrl || '',
    text: data.comment || data.msg || ''
  });
});

tiktok.on('error', err => console.error('[TT] error', err?.message || err));

tiktok.connect().catch(err=>{
  console.error('[TT] connect failed:', err?.message || err);
  console.error('Usage: node server.js <tiktok_username>');
});
