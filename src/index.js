// ZapAtendente — conexão WhatsApp (Baileys) + roteamento
// "Toda obra do diligente certamente prospera." — Provérbios 13:4
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

const AUTH_DIR = process.env.AUTH_DIR || path.join(__dirname, '..', 'data', 'auth');

// ids de mensagens que o próprio bot mandou (pra distinguir de humano no mesmo número)
const botSentIds = new Set();

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'warn' }),
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('\n📱 Escaneie o QR com o WhatsApp do negócio (Aparelhos conectados):\n');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'open') console.log(`✅ ${biz.nome} conectado ao WhatsApp.`);
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) {
        console.log('🔄 Reconectando…');
        start();
      } else {
        console.log('❌ Sessão deslogada. Apague data/auth e escaneie de novo.');
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      try {
        await handleMessage(sock, msg);
      } catch (err) {
        console.error('Erro tratando mensagem:', err.message);
      }
    }
  });
}

async function handleMessage(sock, msg) {
  const jid = msg.key.remoteJid;
  if (!jid || jid.endsWith('@g.us') || jid === 'status@broadcast') return; // ignora grupos/status

  const text =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    '';
  if (!text) return;

  // mensagem enviada PELO número do negócio (fromMe)
  if (msg.key.fromMe) {
    if (botSentIds.has(msg.key.id)) { botSentIds.delete(msg.key.id); return; }
    // é o DONO digitando no aparelho:
    if (commands.isOwnerCommand(text)) {
      const out = commands.handle(text, jid);
      if (out) await send(sock, jid, out);
    } else {
      // dono respondeu manualmente um cliente → bot se cala nesse chat por 4h
      store.pause(jid, 4);
      console.log(`🤫 Humano assumiu ${jid} — bot pausado 4h.`);
    }
    return;
  }

  // mensagem de cliente
  if (store.isPaused(jid)) return;

  const out = await reply(biz, jid, text);
  await send(sock, jid, out);
}

async function send(sock, jid, text) {
  const sent = await sock.sendMessage(jid, { text });
  if (sent?.key?.id) botSentIds.add(sent.key.id);
}

start().catch((e) => {
  console.error('Falha ao iniciar:', e);
  process.exit(1);
});
