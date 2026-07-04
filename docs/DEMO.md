# Roteiro de Demonstração - ZapAtendente (~5 minutos)

**Objetivo:** fechar dono de barbearia/salão como cliente pagante (R$149-249/mês).

**Material necessário:**
- 2 celulares
- Celular 1: número demo da Barbearia do Marcos (ZapAtendente rodando com business.json abaixo)
- Celular 2: celular do dono/prospect (usado como "cliente")

**Vendedor:** Pedro

**Dados do demo (business.json injetado):**
- Nome: Barbearia do Marcos
- Serviços: Corte (R$45 / 30min), Barba (R$35 / 30min), Corte + Barba (R$70 / 60min), Sobrancelha (R$15 / 15min)
- Horário: seg-sex 09:00-19:00, sáb 09:00-13:00
- Tom: informal e simpático, usa "tu" ou "você" natural

---

### 1. Preço real na hora (30s)

**Pedro:** Manda pro número demo: "quanto tá o corte?"

**Dono** (do celular dele pro número demo):  
quanto tá o corte?

**IA responde na hora (no celular do dono):**  
O corte tá R$45, dura uns 30 minutos. Quer marcar?

*(Mostra: preço vem direto do business.json, sem enrolação.)*

### 2. Horários reais (45s)

**Dono:** tem horário amanhã de tarde?

**IA:**  
Amanhã de tarde tem: 14:00, 14:30, 15:00, 15:30, 16:00, 16:30. Qual horário te cai bem?

*(IA consulta horários livres de verdade. Não inventa.)*

### 3. Agenda com confirmação (45s)

**Dono:** marca corte pra mim amanhã 14:00

**IA:**  
Beleza, agendei corte amanhã 14:00 por R$45. Confirma?

**Dono:** confirma

**IA:**  
Fechado! Corte amanhã 14:00 na Barbearia do Marcos. Qualquer coisa é só falar.

*(Agenda respeita duração do serviço. Grava de verdade.)*

### 4. Não fura agenda (45s)

**Dono:** e dá pra marcar barba no mesmo horário?

**IA:**  
14:00 já tem corte marcado. Corte + barba dura 60 minutos. Quer 14:30 ou outro horário?

*(Prova que respeita duração e não sobrepõe. Recusa educada + alternativa.)*

### 5. Áudio (20s)

**Dono** manda um áudio qualquer.

**IA:**  
Desculpa, não entendo áudio. Manda em texto que eu te ajudo.

*(Não fica mudo. Resposta honesta.)*

### 6. Dono vê a agenda (#agenda) (30s)

**Dono** (mesmo celular):  
#agenda amanha

**Resposta:**  
Agenda de amanhã (Barbearia do Marcos):

14:00 - Corte - R$45

*(Dono controla pelo próprio WhatsApp. Vê o dia organizado em um comando.)*

### 7. Dono responde manualmente → bot cala (45s)

**Pedro:** Agora você responde o cliente manualmente, como se fosse você atendendo.

**Dono** responde direto uma mensagem anterior (ex: "Pode vir 13:50").

**Pedro:** Repara: a IA não respondeu nada depois. Ela cala por 4h nesse chat quando o dono entra manualmente.

*(Mostra quem manda é o dono. Handoff automático.)*

### 8. Lembrete automático 1h antes (fechamento) (30s)

**Pedro:** Amanhã, 1h antes do horário, o cliente recebe sozinho:

"Lembrete: seu corte amanhã 14:00 na Barbearia do Marcos, Rua das Palmeiras, 123. Qualquer dúvida é só chamar."

Menos furo de agenda. Você não precisa lembrar ninguém.

---

**Fechamento (15s):**

Pedro: "O bot responde preço, agenda, cancela e lembra. Você controla tudo pelo seu WhatsApp com #agenda, #cancelar, #pausar. Quando você atende manualmente, o bot para. R$149-249/mês dependendo do volume. Quer testar com seus dados reais na próxima semana?"

---

## Objeções comuns (respostas honestas)

**E se a IA falar besteira?**  
Se errar, manda mensagem honesta pro cliente ("Desculpa, tive um problema") e avisa você. Você responde manualmente e o bot silencia 4h naquele chat.

**E se cair?**  
A VPS cai raramente. Se cair, cliente recebe mensagem clara e você é alertado. Atendimentos simples (preço/horário) são o grosso do uso.

**Preciso trocar de número?**  
Não. Usa o número que o negócio já usa. Conecta via QR do WhatsApp Web. Zero mudança pro cliente.

---

## Checklist de preparação pré-demo

- Base zerada (data/zap.db limpo ou sem agendamentos antigos)
- business.json com dados reais do prospect (nome, serviços, preços, horários, endereço) se possível — senão usa o demo e avisa que é exemplo
- Dia seguinte com horários livres à tarde (testar antes)
- Dois celulares com bateria + WhatsApp limpo no número demo
- LLM rodando (Ollama local ou provedor configurado)
- Comandos do dono testados: #agenda amanha, #cancelar <id>, #pausar, #ativar, #ajuda
- Ter 1-2 agendamentos de teste prontos para mostrar conflito

