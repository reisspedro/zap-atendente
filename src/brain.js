const store = require('./store');
const { freeSlots, book } = require('./agenda');
const { systemPrompt } = require('./prompt');

const MODEL = process.env.MODEL || 'claude-haiku-4-5';

const TOOLS = [
  {
    name: 'ver_horarios',
    description: 'Consulta os horários livres de uma data. Use sempre antes de oferecer horários ao cliente.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Data no formato AAAA-MM-DD' },
        service: { type: 'string', description: 'Nome do serviço, se já souber — considera a duração real dele' },
      },
      required: ['date'],
    },
  },
  {
    name: 'agendar',
    description: 'Confirma um agendamento. Só chame depois que o cliente confirmar serviço, data, horário e nome.',
    input_schema: {
      type: 'object',
      properties: {
        client_name: { type: 'string', description: 'Nome do cliente' },
        service: { type: 'string', description: 'Nome exato do serviço' },
        date: { type: 'string', description: 'AAAA-MM-DD' },
        time: { type: 'string', description: 'HH:MM' },
      },
      required: ['client_name', 'service', 'date', 'time'],
    },
  },
  {
    name: 'meus_agendamentos',
    description: 'Lista os agendamentos futuros deste cliente (para consultar ou antes de cancelar).',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'cancelar_agendamento',
    description: 'Cancela um agendamento pelo id (obtido via meus_agendamentos). Confirme com o cliente antes.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'number', description: 'id do agendamento' } },
      required: ['id'],
    },
  },
];

function runTool(biz, jid, name, input, ctx) {
  if (ctx?.expired && (name === 'agendar' || name === 'cancelar_agendamento')) {
    return { error: 'Tempo esgotado — ação NÃO executada. Peça pro cliente confirmar de novo.' };
  }
  if (name === 'ver_horarios') {
    const svc = input.service
      ? biz.servicos.find((s) => s.nome.toLowerCase() === input.service.toLowerCase())
      : null;
    return freeSlots(biz, input.date, svc?.duracao_min);
  }
  if (name === 'agendar') return book(biz, jid, input.client_name, input.service, input.date, input.time);
  if (name === 'meus_agendamentos') return { bookings: store.bookingsByJid(jid) };
  if (name === 'cancelar_agendamento') {
    const changes = store.cancelBookingForJid(input.id, jid);
    return changes ? { ok: true } : { error: 'Agendamento não encontrado entre os seus' };
  }
  return { error: `Tool desconhecida: ${name}` };
}

function fakeReply(biz, jid, text) {
  if (/horário|horarios|agendar/i.test(text)) {
    const date = new Date().toLocaleDateString('sv-SE');
    const r = freeSlots(biz, date);
    return `[FAKE] Livres hoje: ${(r.slots || []).slice(0, 4).join(', ') || 'nenhum'}`;
  }
  return `[FAKE] Recebi: "${text}"`;
}

async function apiReply(biz, jid, messages, ctx) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic();

  let response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt(biz),
    tools: TOOLS,
    messages,
  });

  for (let i = 0; i < 5 && response.stop_reason === 'tool_use'; i++) {
    const toolUses = response.content.filter((b) => b.type === 'tool_use');
    messages.push({ role: 'assistant', content: response.content });
    messages.push({
      role: 'user',
      content: toolUses.map((tu) => ({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: JSON.stringify(runTool(biz, jid, tu.name, tu.input, ctx)),
      })),
    });
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt(biz),
      tools: TOOLS,
      messages,
    });
  }

  return response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim() || '…';
}

const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS) || 60000;

function withTimeout(promise, ms, ctx) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, rej) => {
      timer = setTimeout(() => {
        if (ctx) ctx.expired = true;
        rej(new Error(`provider não respondeu em ${ms / 1000}s`));
      }, ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function reply(biz, jid, text) {
  store.addMessage(jid, 'user', text);

  const provider = process.env.FAKE_LLM
    ? 'fake'
    : (process.env.PROVIDER || (process.env.USE_API ? 'anthropic' : 'openai'));

  const ctx = { expired: false };
  let out;
  if (provider === 'fake') {
    out = fakeReply(biz, jid, text);
  } else if (provider === 'anthropic') {
    const messages = store.history(jid).map((m) => ({ role: m.role, content: m.content }));
    out = await withTimeout(apiReply(biz, jid, messages, ctx), LLM_TIMEOUT_MS, ctx);
  } else if (provider === 'claude-code') {
    const { sdkReply } = require('./brain-sdk');
    out = await withTimeout(sdkReply(biz, jid, text, ctx), LLM_TIMEOUT_MS, ctx);
  } else {
    const { openaiReply } = require('./brain-openai');
    out = await withTimeout(openaiReply(biz, jid, text, TOOLS, (b, j, n, i) => runTool(b, j, n, i, ctx)), LLM_TIMEOUT_MS, ctx);
  }

  store.addMessage(jid, 'assistant', out);
  return out;
}

module.exports = { reply, systemPrompt, runTool, TOOLS };
