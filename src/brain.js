// ZapAtendente — cérebro: despacha entre os modos
//   padrão     → Agent SDK (usa a ASSINATURA do Claude Code — sem custo de API)
//   USE_API=1  → API da Anthropic (pra quando virar serviço comercial)
//   FAKE_LLM=1 → respostas falsas (testes sem rede)
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

function runTool(biz, jid, name, input) {
  if (name === 'ver_horarios') return freeSlots(biz, input.date);
  if (name === 'agendar') return book(biz, jid, input.client_name, input.service, input.date, input.time);
  if (name === 'meus_agendamentos') return { bookings: store.bookingsByJid(jid) };
  if (name === 'cancelar_agendamento') {
    const changes = store.cancelBooking(input.id);
    return changes ? { ok: true } : { error: 'Agendamento não encontrado' };
  }
  return { error: `Tool desconhecida: ${name}` };
}

// resposta fake pra testes sem API key / sem assinatura
function fakeReply(biz, jid, text) {
  if (/horário|horarios|agendar/i.test(text)) {
    const date = new Date().toLocaleDateString('sv-SE');
    const r = freeSlots(biz, date);
    return `[FAKE] Livres hoje: ${(r.slots || []).slice(0, 4).join(', ') || 'nenhum'}`;
  }
  return `[FAKE] Recebi: "${text}"`;
}

async function apiReply(biz, jid, messages) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic();

  let response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt(biz),
    tools: TOOLS,
    messages,
  });

  // loop de tools (máx 5 iterações de segurança)
  for (let i = 0; i < 5 && response.stop_reason === 'tool_use'; i++) {
    const toolUses = response.content.filter((b) => b.type === 'tool_use');
    messages.push({ role: 'assistant', content: response.content });
    messages.push({
      role: 'user',
      content: toolUses.map((tu) => ({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: JSON.stringify(runTool(biz, jid, tu.name, tu.input)),
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

async function reply(biz, jid, text) {
  store.addMessage(jid, 'user', text);

  let out;
  if (process.env.FAKE_LLM) {
    out = fakeReply(biz, jid, text);
  } else if (process.env.USE_API) {
    const messages = store.history(jid).map((m) => ({ role: m.role, content: m.content }));
    out = await apiReply(biz, jid, messages);
  } else {
    const { sdkReply } = require('./brain-sdk');
    out = await sdkReply(biz, jid, text);
  }

  store.addMessage(jid, 'assistant', out);
  return out;
}

module.exports = { reply, systemPrompt, runTool, TOOLS };
