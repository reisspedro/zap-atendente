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
- Claude Haiku (Anthropic) — cérebro com tool use pra agendamento
- SQLite — conversas, agendamentos, pausas
- Custo de IA: ~R$5-20/mês por negócio em uso normal

## Rodar

**Modo padrão — assinatura Claude (sem custo de API):** requer Claude Code instalado e logado na máquina (`claude` → `/login`). Testado e funcionando, inclusive tool use de agendamento.

```bash
npm install
npm start    # mostra QR → escanear com o WhatsApp do negócio
```

**Modo API (pra quando virar serviço comercial — assinatura não cobre revenda):**

```bash
set USE_API=1
set ANTHROPIC_API_KEY=sk-ant-...
npm start
```

Configurar o negócio: editar `business.json` (nome, serviços/preços, horários, FAQ, tom).
Cada cliente do produto = uma cópia de `business.json` + uma instância + um número.

Testes (sem WhatsApp nem API key): `npm test`

## Variáveis

| Var | Default | Obs |
|-----|---------|-----|
| `USE_API` | — | `1` = usar API paga em vez da assinatura |
| `ANTHROPIC_API_KEY` | — | só no modo API |
| `MODEL` | haiku (assinatura) / claude-haiku-4-5 (API) | barato de propósito |
| `BUSINESS_CONFIG` | ./business.json | config do negócio |
| `DB_PATH` | ./data/zap.db | banco |
| `AUTH_DIR` | ./data/auth | sessão WhatsApp (NÃO commitar) |

## Avisos

- Baileys usa o protocolo do WhatsApp Web — não é API oficial. Pra uso de atendimento (responder quem chama) o risco de bloqueio é baixo; **nunca usar pra disparo em massa**.
- Modelo de negócio: R$149-249/mês por estabelecimento, hospedagem numa VPS única (cada cliente = 1 processo pm2).

---

*"Toda obra do diligente certamente prospera." — Provérbios 13:4*
