// ZapAtendente — cérebro: Claude + tools de agendamento
// Modelo barato de propósito: economia do produto (R$149/mês por cliente) exige custo de IA baixo.
const Anthropic = require('@anthropic-ai/sdk');
const store = require('./store');
const { freeSlots, book } = require('./agenda');

const MODEL = process.env.MODEL || 'claude-haiku-4-5';
const client = process.env.FAKE_LLM ? null : new Anthropic();

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

function systemPrompt(biz) {
  const hoje = new Date();
  const servicos = biz.servicos
    .map((s) => `- ${s.nome}: R$${s.preco} (${s.duracao_min}min)`)
    .join('\n');
  const faq = (biz.faq || []).map((f) => `P: ${f.q}\nR: ${f.a}`).join('\n');
  const horarios = Object.entries(biz.horarios)
    .map(([d, h]) => `${d}: ${h ? `${h[0]}-${h[1]}` : 'fechado'}`)
    .join(', ');

  return `Você é o atendente virtual de WhatsApp do negócio "${biz.nome}".
${biz.descricao}
Endereço: ${biz.endereco}

HOJE é ${hoje.toLocaleDateString('sv-SE')} (${['domingo','segunda','terça','quarta','quinta','sexta','sábado'][hoje.getDay()]}), ${hoje.getHours()}:${String(hoje.getMinutes()).padStart(2, '0')}.

SERVIÇOS E PREÇOS:
${servicos}

HORÁRIO DE FUNCIONAMENTO: ${horarios}

FAQ:
${faq}

REGRAS:
- Tom: ${biz.tom}
- Responda CURTO — é WhatsApp, não e-mail. 1-3 linhas na maioria das vezes.
- Para agendar: pergunte serviço, dia e nome se ainda não souber. Use ver_horarios antes de oferecer horários (ofereça no máximo 4-5 opções). Só chame agendar após confirmação explícita.
- Converta datas relativas ("amanhã", "sexta") para AAAA-MM-DD usando a data de HOJE acima.
- NUNCA invente preço, serviço ou horário que não esteja listado.
- Se o cliente pedir algo fora do seu alcance (reclamação séria, negociação, urgência), diga que vai chamar o responsável e oriente ligar para ${biz.telefone_humano}.
- Nunca diga que é IA, a menos que perguntem diretamente — aí seja honesto.`;
}

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

// resposta fake pra testes sem API key
function fakeReply(biz, jid, text) {
  if (/horário|horarios|agendar/i.test(text)) {
    const date = new Date().toLocaleDateString('sv-SE');
    const r = freeSlots(biz, date);
    return `[FAKE] Livres hoje: ${(r.slots || []).slice(0, 4).join(', ') || 'nenhum'}`;
  }
  return `[FAKE] Recebi: "${text}"`;
}

async function reply(biz, jid, text) {
  store.addMessage(jid, 'user', text);

  if (process.env.FAKE_LLM) {
    const out = fakeReply(biz, jid, text);
    store.addMessage(jid, 'assistant', out);
    return out;
  }

  const messages = store.history(jid).map((m) => ({ role: m.role, content: m.content }));

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

  const out = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim() || '…';
  store.addMessage(jid, 'assistant', out);
  return out;
}

module.exports = { reply, systemPrompt, runTool, TOOLS };
