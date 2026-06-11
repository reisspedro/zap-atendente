// Testes do ZapAtendente — roda sem WhatsApp e sem API key (FAKE_LLM)
process.env.FAKE_LLM = '1';
process.env.DB_PATH = require('path').join(__dirname, 'test.db');
const fs = require('fs');

// banco limpo a cada rodada
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

// uma segunda-feira futura fixa pra testes determinísticos
const SEG = '2026-06-15';
const DOM = '2026-06-14';

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

test('data inválida retorna erro', () => {
  assert.ok(freeSlots(biz, 'banana').error);
});

test('agendar serviço válido em slot livre', () => {
  const r = book(biz, '554799990001@s.whatsapp.net', 'João', 'Corte', SEG, '10:00');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.price, 45);
});

test('slot ocupado é recusado e some dos livres', () => {
  const r = book(biz, '554799990002@s.whatsapp.net', 'Maria', 'Barba', SEG, '10:00');
  assert.ok(r.error.includes('indisponível'));
  assert.ok(!freeSlots(biz, SEG).slots.includes('10:00'));
});

test('serviço inexistente é recusado', () => {
  const r = book(biz, 'x@s.whatsapp.net', 'Zé', 'Luzes', SEG, '11:00');
  assert.ok(r.error.includes('não existe'));
});

test('tool meus_agendamentos lista por jid', () => {
  const r = runTool(biz, '554799990001@s.whatsapp.net', 'meus_agendamentos', {});
  assert.strictEqual(r.bookings.length, 1);
  assert.strictEqual(r.bookings[0].client_name, 'João');
});

test('tool cancelar_agendamento libera o slot', () => {
  const list = runTool(biz, '554799990001@s.whatsapp.net', 'meus_agendamentos', {}).bookings;
  const r = runTool(biz, '554799990001@s.whatsapp.net', 'cancelar_agendamento', { id: list[0].id });
  assert.strictEqual(r.ok, true);
  assert.ok(freeSlots(biz, SEG).slots.includes('10:00'));
});

test('comando #agenda lista o dia', () => {
  book(biz, '554799990003@s.whatsapp.net', 'Carlos', 'Corte + Barba', SEG, '14:00');
  const out = commands.handle(`#agenda ${SEG}`, 'any');
  assert.ok(out.includes('Carlos'));
  assert.ok(out.includes('14:00'));
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

test('histórico persiste por contato', () => {
  store.addMessage('a@s.whatsapp.net', 'user', 'oi');
  store.addMessage('a@s.whatsapp.net', 'assistant', 'olá!');
  const h = store.history('a@s.whatsapp.net');
  assert.strictEqual(h.length, 2);
  assert.strictEqual(h[0].role, 'user');
});

test('system prompt contém preços, regras e data de hoje', () => {
  const sp = systemPrompt(biz);
  assert.ok(sp.includes('R$45'));
  assert.ok(sp.includes('NUNCA invente'));
  assert.ok(sp.includes(new Date().toLocaleDateString('sv-SE')));
});

console.log(`\n${passed} testes passaram.`);
