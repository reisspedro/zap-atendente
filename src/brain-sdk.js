const store = require('./store');
const { freeSlots, book } = require('./agenda');
const { systemPrompt } = require('./prompt');

const MODEL = process.env.MODEL || 'haiku';

let sdkPromise = null;
function loadSdk() {

  if (!sdkPromise) sdkPromise = import('@anthropic-ai/claude-agent-sdk');
  return sdkPromise;
}

function buildTools(sdk, z, biz, jid, ctx) {
  return sdk.createSdkMcpServer({
    name: 'agenda',
    version: '1.0.0',
    tools: [
      sdk.tool(
        'ver_horarios',
        'Consulta horários livres de uma data (AAAA-MM-DD). Use antes de oferecer horários.',
        { date: z.string() },
        async ({ date }) => ({
          content: [{ type: 'text', text: JSON.stringify(freeSlots(biz, date)) }],
        })
      ),
      sdk.tool(
        'agendar',
        'Confirma agendamento. Só após cliente confirmar serviço, data, horário e nome.',
        { client_name: z.string(), service: z.string(), date: z.string(), time: z.string() },
        async (a) => ({
          content: [{ type: 'text', text: JSON.stringify(ctx?.expired
            ? { error: 'Tempo esgotado — ação NÃO executada.' }
            : book(biz, jid, a.client_name, a.service, a.date, a.time)) }],
        })
      ),
      sdk.tool(
        'meus_agendamentos',
        'Lista agendamentos futuros deste cliente.',
        {},
        async () => ({
          content: [{ type: 'text', text: JSON.stringify({ bookings: store.bookingsByJid(jid) }) }],
        })
      ),
      sdk.tool(
        'cancelar_agendamento',
        'Cancela agendamento pelo id (de meus_agendamentos). Confirme antes.',
        { id: z.number() },
        async ({ id }) => ({
          content: [{ type: 'text', text: JSON.stringify(ctx?.expired
            ? { error: 'Tempo esgotado — ação NÃO executada.' }
            : store.cancelBookingForJid(id, jid) ? { ok: true } : { error: 'não encontrado' }) }],
        })
      ),
    ],
  });
}

async function sdkReply(biz, jid, text, ctx) {
  const sdk = await loadSdk();
  const { z } = await import('zod');

  const history = store.history(jid, 16)
    .map((m) => `${m.role === 'user' ? 'CLIENTE' : 'VOCÊ'}: ${m.content}`)
    .join('\n');

  const prompt =
    (history ? `Conversa até agora:\n${history}\n\n` : '') +
    `CLIENTE: ${text}\n\nResponda a última mensagem do cliente.`;

  const q = sdk.query({
    prompt,
    options: {
      model: MODEL,
      systemPrompt: systemPrompt(biz),
      mcpServers: { agenda: buildTools(sdk, z, biz, jid, ctx) },
      allowedTools: [
        'mcp__agenda__ver_horarios',
        'mcp__agenda__agendar',
        'mcp__agenda__meus_agendamentos',
        'mcp__agenda__cancelar_agendamento',
      ],
      permissionMode: 'bypassPermissions',
      maxTurns: 8,
    },
  });

  let out = '';
  for await (const msg of q) {
    if (msg.type === 'result') {
      out = msg.subtype === 'success' ? (msg.result || '').trim() : '';
    }
  }
  return out || 'Só um instante, já te respondo! 🙏';
}

module.exports = { sdkReply };
