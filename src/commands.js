const store = require('./store');

function isOwnerCommand(text) {
  return text.startsWith('#');
}

function handle(text, currentJid) {
  const [cmd, ...rest] = text.trim().split(/\s+/);

  if (cmd === '#agenda') {

    let date = rest[0];
    const today = new Date();
    if (!date || date === 'hoje') date = today.toLocaleDateString('sv-SE');
    else if (date === 'amanha' || date === 'amanhã') {
      const t = new Date(today.getTime() + 86400000);
      date = t.toLocaleDateString('sv-SE');
    }
    const list = store.bookingsOn(date);
    if (!list.length) return `📅 ${date}: nenhum agendamento.`;
    return `📅 ${date}:\n` + list.map(
      (b) => `${b.time} — ${b.client_name} (${b.service}) [id ${b.id}]`
    ).join('\n');
  }

  if (cmd === '#cancelar' && rest[0]) {
    const ok = store.cancelBooking(Number(rest[0]));
    return ok ? `✅ Agendamento ${rest[0]} cancelado.` : `❌ Não achei o agendamento ${rest[0]}.`;
  }

  if (cmd === '#pausar') {
    const hours = Number(rest[0]) || 4;
    store.pause(currentJid, hours);
    return `🤫 Bot pausado neste chat por ${hours}h. Use #ativar pra voltar.`;
  }

  if (cmd === '#ativar') {
    store.unpause(currentJid);
    return '🤖 Bot reativado neste chat.';
  }

  if (cmd === '#ajuda' || cmd === '#help') {
    return [
      'Comandos do dono:',
      '#agenda [hoje|amanha|AAAA-MM-DD] — ver agendamentos',
      '#cancelar <id> — cancelar agendamento',
      '#pausar [horas] — silencia o bot neste chat (padrão 4h)',
      '#ativar — reativa o bot neste chat',
    ].join('\n');
  }

  return null;
}

module.exports = { isOwnerCommand, handle };
