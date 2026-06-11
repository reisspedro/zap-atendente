const store = require('./store');
const { systemPrompt } = require('./prompt');

const BASE_URL = (process.env.LLM_BASE_URL || 'http://localhost:11434/v1').replace(/\/$/, '');
const API_KEY = process.env.LLM_API_KEY || 'ollama';
const MODEL = process.env.MODEL || 'llama3.1';

function toOpenAiTools(tools) {
  return tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));
}

async function chat(messages, tools) {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ model: MODEL, messages, tools, temperature: 0.6 }),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.choices[0].message;
}

async function openaiReply(biz, jid, text, TOOLS, runTool) {
  const tools = toOpenAiTools(TOOLS);
  const messages = [
    { role: 'system', content: systemPrompt(biz) },
    ...store.history(jid).map((m) => ({ role: m.role, content: m.content })),
  ];

  let msg = await chat(messages, tools);

  for (let i = 0; i < 5 && msg.tool_calls?.length; i++) {
    messages.push(msg);
    for (const tc of msg.tool_calls) {
      let args = {};
      try { args = JSON.parse(tc.function.arguments || '{}'); } catch {}
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(runTool(biz, jid, tc.function.name, args)),
      });
    }
    msg = await chat(messages, tools);
  }

  return (msg.content || '').trim() || '…';
}

module.exports = { openaiReply };
