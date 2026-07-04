process.env.FAKE_LLM = '1';
process.env.DB_PATH = require('path').join(__dirname, 'test.db');
const fs = require('fs');

for (const f of ['test.db', 'test.db-shm', 'test.db-wal']) {
  try { fs.unlinkSync(require('path').join(__dirname, f)); } catch {}
}

const assert = require('assert');
const store = require('../src/store');
const { freeSlots, book } = require('../src/agenda');
const { runTool, systemPrompt } = require('../src/brain');
const commands = require('../src/commands');

const biz = JSON.parse(fs.readFileSync(require('path').join(__dirname, '..', 'business.json'), 'utf8'));
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`✅ ${name}`); }
  catch (e) { console.error(`❌ ${name}: ${e.message}`); process.exitCode = 1; }
}

function formatDate(date) {
  return date.toLocaleDateString('sv-SE');
}

function nextWeekday(day) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  do {
    d.setDate(d.getDate() + 1);
  } while (d.getDay() !== day);
  return formatDate(d);
}

function formatTime(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

const SEG = nextWeekday(1);
const DOM = nextWeekday(0);
const ONTEM = formatDate(new Date(Date.now() - 86400000));

test('slots de segunda 9-19 com passo 30min', () => {
  const r = freeSlots(biz, SEG);
  assert.strictEqual(r.closed, false);
  assert.strictEqual(r.slots[0], '09:00');
  assert.strictEqual(r.slots[r.slots.length - 1], '18:30');
  assert.strictEqual(r.slots.length, 20);
});

test('domingo fechado', () => {
  const r = freeSlots(biz, DOM);
  assert.strictEqual(r.closed, true);
});

test('data invalida retorna erro', () => {
  assert.ok(freeSlots(biz, 'banana').error);
});

test('data passada retorna erro', () => {
  assert.ok(freeSlots(biz, ONTEM).error);
});

test('agendar em data passada retorna erro', () => {
  assert.ok(book(biz, 'passado@s.whatsapp.net', 'Cliente Passado', 'Corte', ONTEM, '10:00').error);
});

test('formato invalido retorna erro', () => {
  assert.ok(freeSlots(biz, '2026-7-5').error);
  assert.ok(freeSlots(biz, '2026-13-40').error);
});

test('agendar servico valido em slot livre', () => {
  const r = book(biz, '554799990001@s.whatsapp.net', 'Joao', 'Corte', SEG, '10:00');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.price, 45);
});

test('slot ocupado e recusado e some dos livres', () => {
  const r = book(biz, '554799990002@s.whatsapp.net', 'Maria', 'Barba', SEG, '10:00');
  assert.ok(r.error.includes('indisponível'));
  assert.ok(!freeSlots(biz, SEG).slots.includes('10:00'));
});

test('servico inexistente e recusado', () => {
  const r = book(biz, 'x@s.whatsapp.net', 'Ze', 'Luzes', SEG, '11:00');
  assert.ok(r.error.includes('não existe'));
});

test('duracao real ocupa todos os slots do servico', () => {
  const r = book(biz, '554799990004@s.whatsapp.net', 'Ana', 'Corte + Barba', SEG, '14:00');
  assert.strictEqual(r.ok, true);

  const slots = freeSlots(biz, SEG).slots;
  assert.ok(!slots.includes('14:00'));
  assert.ok(!slots.includes('14:30'));
  assert.ok(slots.includes('15:00'));
});

test('freeSlots respeita durationMin ao evitar conflito e fechamento', () => {
  const slots = freeSlots(biz, SEG, 60).slots;
  assert.ok(!slots.includes('14:00'));
  assert.ok(!slots.includes('14:30'));
  assert.ok(slots.includes('18:00'));
  assert.ok(!slots.includes('18:30'));
});

test('tool meus_agendamentos lista por jid', () => {
  const r = runTool(biz, '554799990001@s.whatsapp.net', 'meus_agendamentos', {});
  assert.strictEqual(r.bookings.length, 1);
  assert.strictEqual(r.bookings[0].client_name, 'Joao');
});

test('tool cancelar_agendamento rejeita jid diferente do dono', () => {
  const jid = '554799990005@s.whatsapp.net';
  const booked = book(biz, jid, 'Bruna', 'Corte', SEG, '15:00');
  assert.strictEqual(booked.ok, true);

  const wrong = runTool(biz, 'outro@s.whatsapp.net', 'cancelar_agendamento', { id: booked.id });
  assert.ok(wrong.error);

  const right = runTool(biz, jid, 'cancelar_agendamento', { id: booked.id });
  assert.strictEqual(right.ok, true);
});

test('tool cancelar_agendamento libera o slot', () => {
  const jid = '554799990001@s.whatsapp.net';
  const list = runTool(biz, jid, 'meus_agendamentos', {}).bookings;
  const r = runTool(biz, jid, 'cancelar_agendamento', { id: list[0].id });
  assert.strictEqual(r.ok, true);
  assert.ok(freeSlots(biz, SEG).slots.includes('10:00'));
});

test('comando #agenda lista o dia', () => {
  book(biz, '554799990003@s.whatsapp.net', 'Carlos', 'Corte + Barba', SEG, '16:00');
  const out = commands.handle(`#agenda ${SEG}`, 'any');
  assert.ok(out.includes('Carlos'));
  assert.ok(out.includes('16:00'));
});

test('comando #cancelar remove', () => {
  const list = store.bookingsOn(SEG);
  const out = commands.handle(`#cancelar ${list[0].id}`, 'any');
  assert.ok(out.includes('✅'));
});

test('pausa e despausa por chat', () => {
  const jid = '554799990009@s.whatsapp.net';
  assert.strictEqual(store.isPaused(jid), false);
  commands.handle('#pausar 2', jid);
  assert.strictEqual(store.isPaused(jid), true);
  commands.handle('#ativar', jid);
  assert.strictEqual(store.isPaused(jid), false);
});

test('historico persiste por contato', () => {
  store.addMessage('a@s.whatsapp.net', 'user', 'oi');
  store.addMessage('a@s.whatsapp.net', 'assistant', 'ola!');
  const h = store.history('a@s.whatsapp.net');
  assert.strictEqual(h.length, 2);
  assert.strictEqual(h[0].role, 'user');
});

test('system prompt contem precos, regras e data de hoje', () => {
  const sp = systemPrompt(biz);
  assert.ok(sp.includes('R$45'));
  assert.ok(sp.includes('NUNCA invente'));
  assert.ok(sp.includes(new Date().toLocaleDateString('sv-SE')));
});

test('lembretes incluem proximos e ignoram os ja marcados', () => {
  const alvo = new Date(Date.now() + 30 * 60000);
  const id = store.addBooking(
    'lembrete@s.whatsapp.net',
    'Cliente Lembrete',
    'Corte',
    formatDate(alvo),
    formatTime(alvo),
    30
  );

  assert.ok(store.bookingsNeedingReminder(60).some((b) => b.id === id));
  store.markReminded(id);
  assert.ok(!store.bookingsNeedingReminder(60).some((b) => b.id === id));
});

test('store.cancelBookingForJid restringe cancelamento por jid', () => {
  const jid = 'dono-store@s.whatsapp.net';
  const id = store.addBooking(jid, 'Dono Store', 'Corte', SEG, '17:00', 30);

  assert.strictEqual(store.cancelBookingForJid(id, 'jid-errado@s.whatsapp.net'), 0);
  assert.strictEqual(store.cancelBookingForJid(id, jid), 1);
});

console.log(`\n${passed} testes passaram.`);
