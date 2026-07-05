const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const path = require('path');
const fs = require('fs');

const store = require('./store');
const { reply } = require('./brain');
const commands = require('./commands');

const BIZ_PATH = process.env.BUSINESS_CONFIG || path.join(__dirname, '..', 'business.json');
const biz = JSON.parse(fs.readFileSync(BIZ_PATH, 'utf8'));
if (biz.timezone) process.env.TZ = biz.timezone;

const AUTH_DIR = process.env.AUTH_DIR || path.join(__dirname, '..', 'data', 'auth');

const BUFFER_MS = Number(process.env.BUFFER_MS) || 2500;
const FALLBACK_MSG = '⚠️ Tive um probleminha técnico agora. Já avisei o responsável — te respondo em breve!';
const MEDIA_MSG = 'Opa! Ainda não consigo ouvir áudio nem ver imagem por aqui 😅 Me manda por texto?';

const botSentIds = new Set();
const buffers = new Map();
const chains = new Map();

let currentSock = null;
let reconnectDelay = 1000;
let reconnecting = false;
let reminderTimer = null;

function ownerJid() {
  const phone = biz.dono_whatsapp || biz.telefone_humano;
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  return `${digits.startsWith('55') ? digits : '55' + digits}@s.whatsapp.net`;
}

async function alertOwner(text) {
  const jid = ownerJid();
  if (!jid || !currentSock) return;
  try { await send(currentSock, jid, text); } catch (e) { console.error('Falha ao alertar dono:', e.message); }
}

function enqueue(jid, fn) {
  const prev = chains.get(jid) || Promise.resolve();
  const next = prev.then(fn).catch((e) => console.error(`Erro no chat ${jid}:`, e.message));
  chains.set(jid, next);
  return next;
}

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'warn' }),
  });
  currentSock = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('\n📱 Escaneie o QR com o WhatsApp do negócio (Aparelhos conectados):\n');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'open') {
      reconnectDelay = 1000;
      console.log(`✅ ${biz.nome} conectado ao WhatsApp.`);
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        console.log('❌ Sessão deslogada. Apague data/auth e escaneie de novo.');
        return;
      }
      if (reconnecting) return;
      reconnecting = true;
      console.log(`🔄 Reconectando em ${reconnectDelay / 1000}s…`);
      setTimeout(() => {
        reconnecting = false;
        start().catch((e) => console.error('Falha na reconexão:', e.message));
      }, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 60000);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      try {
        handleMessage(sock, msg);
      } catch (err) {
        console.error('Erro tratando mensagem:', err.message);
      }
    }
  });

  const reminderMin = biz.lembrete_min ?? 60;
  if (!reminderTimer && reminderMin > 0) {
    reminderTimer = setInterval(() => checkReminders(reminderMin), 5 * 60 * 1000);
  }
}

async function checkReminders(withinMin) {
  if (!currentSock) return;
  for (const b of store.bookingsNeedingReminder(withinMin)) {
    try {
      await send(currentSock, b.jid, `⏰ Lembrete: ${b.service} hoje às ${b.time} aqui na ${biz.nome}. Te esperamos!`);
      store.markReminded(b.id);
    } catch (e) {
      console.error(`Falha no lembrete ${b.id}:`, e.message);
    }
  }
}

function handleMessage(sock, msg) {
  const jid = msg.key.remoteJid;
  if (!jid || jid.endsWith('@g.us') || jid === 'status@broadcast') return;

  const text =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    '';

  if (msg.key.fromMe) {
    if (botSentIds.has(msg.key.id)) { botSentIds.delete(msg.key.id); return; }
    if (!text) return;

    if (commands.isOwnerCommand(text)) {
      const out = commands.handle(text, jid);
      if (out) enqueue(jid, () => send(sock, jid, out));
    } else {
      store.pause(jid, 4);
      console.log(`🤫 Humano assumiu ${jid} — bot pausado 4h.`);
    }
    return;
  }

  if (store.isPaused(jid)) return;

  if (!text) {
    const isMedia = msg.message?.audioMessage || msg.message?.imageMessage ||
      msg.message?.videoMessage || msg.message?.documentMessage;
    if (isMedia) enqueue(jid, () => send(sock, jid, MEDIA_MSG));
    return;
  }

  bufferText(sock, jid, text);
}

function bufferText(sock, jid, text) {
  const buf = buffers.get(jid) || { texts: [], timer: null };
  buf.texts.push(text);
  if (buf.timer) clearTimeout(buf.timer);
  buf.timer = setTimeout(() => {
    buffers.delete(jid);
    const joined = buf.texts.join('\n');
    enqueue(jid, async () => {
      try {
        const out = await reply(biz, jid, joined);
        await send(sock, jid, out);
      } catch (err) {
        console.error(`Provider falhou pra ${jid}:`, err.message);
        store.pause(jid, 1);
        try { await send(sock, jid, FALLBACK_MSG); } catch (e) { console.error(`Falha ao enviar fallback pra ${jid}:`, e.message); }
        await alertOwner(`⚠️ ZapAtendente: falha ao responder ${jid.split('@')[0]} ("${err.message}"). Chat pausado 1h — responda manualmente.`);
      }
    });
  }, BUFFER_MS);
  buffers.set(jid, buf);
}

async function send(sock, jid, text) {
  const sent = await sock.sendMessage(jid, { text });
  if (sent?.key?.id) botSentIds.add(sent.key.id);
}

start().catch((e) => {
  console.error('Falha ao iniciar:', e);
  process.exit(1);
});
