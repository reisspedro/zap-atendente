# 📲 ZapAtendente

**Atendente de IA pro WhatsApp do seu negócio.** Responde clientes na hora, informa preços e serviços, e **agenda horários sozinho** — 24h por dia, direto no número que o negócio já usa.

Feito pra barbearia, salão, clínica, estética, petshop, oficina — qualquer negócio que vive de horário marcado e perde cliente por demorar a responder.

## O que faz

- Responde dúvidas (preços, serviços, endereço, FAQ) com tom configurável
- **Agenda de verdade**: consulta horários livres, oferece opções, confirma e grava
- Cliente consulta e cancela o próprio horário pela conversa
- **Dono no controle pelo próprio WhatsApp**:
  - `#agenda hoje` / `#agenda amanha` / `#agenda 2026-06-20` — vê o dia
  - `#cancelar <id>` — cancela
  - `#pausar` / `#ativar` — silencia o bot num chat
  - **Handoff automático**: se o dono responder um cliente manualmente, o bot se cala naquele chat por 4h
- Ignora grupos e status. Memória de conversa por contato.

## Stack

- [Baileys](https://github.com/WhiskeySockets/Baileys) — WhatsApp Web (QR code, sem API paga da Meta)
- LLM com tool use pra agendamento — provider-agnostic (Ollama local grátis, Groq, DeepSeek, OpenRouter…)
- SQLite — conversas, agendamentos, pausas
- Custo de IA: ~R$5-20/mês por negócio em uso normal

## Rodar

**Independente de fornecedor de IA.** Padrão: qualquer API OpenAI-compatible — incluindo **Ollama local (100% grátis)**, Groq, DeepSeek, OpenRouter.

```bash
npm install
# Ollama local (grátis): instalar ollama.com → ollama pull llama3.1
npm start    # mostra QR → escanear com o WhatsApp do negócio

# ou apontar pra um provedor hospedado:
set LLM_BASE_URL=https://api.groq.com/openai/v1
set LLM_API_KEY=gsk_...
set MODEL=llama-3.3-70b-versatile
npm start
```

Configurar o negócio: editar `business.json` (nome, serviços/preços, horários, FAQ, tom).
Cada cliente do produto = uma cópia de `business.json` + uma instância + um número.

Testes (sem WhatsApp nem API key): `npm test`

## Variáveis

| Var | Default | Obs |
|-----|---------|-----|
| `PROVIDER` | openai | `openai` (compatible); outros provedores suportados no código |
| `LLM_BASE_URL` | http://localhost:11434/v1 | Ollama local; trocar p/ Groq, DeepSeek etc. |
| `LLM_API_KEY` | ollama | key do provedor escolhido |
| `MODEL` | llama3.1 | conforme o provedor |
| `BUSINESS_CONFIG` | ./business.json | config do negócio |
| `DB_PATH` | ./data/zap.db | banco |
| `AUTH_DIR` | ./data/auth | sessão WhatsApp (NÃO commitar) |

## Avisos

- Baileys usa o protocolo do WhatsApp Web — não é API oficial. Pra uso de atendimento (responder quem chama) o risco de bloqueio é baixo; **nunca usar pra disparo em massa**.
- Modelo de negócio: R$149-249/mês por estabelecimento, hospedagem numa VPS única (cada cliente = 1 processo pm2).

---

*"Toda obra do diligente certamente prospera." — Provérbios 13:4*
