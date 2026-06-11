// ZapAtendente — lógica de horários e agendamento
const store = require('./store');

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

function toMin(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
function toHHMM(min) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

// slots livres de um dia, dado o business.json
function freeSlots(biz, date) {
  const d = new Date(`${date}T12:00:00`);
  if (isNaN(d)) return { error: 'Data inválida — usar formato AAAA-MM-DD' };
  const range = biz.horarios[DIAS[d.getDay()]];
  if (!range) return { closed: true, slots: [] };

  const step = biz.slot_min || 30;
  const slots = [];
  for (let t = toMin(range[0]); t + step <= toMin(range[1]); t += step) {
    const hhmm = toHHMM(t);
    if (!store.isSlotTaken(date, hhmm)) slots.push(hhmm);
  }

  // se for hoje, corta horários que já passaram
  const now = new Date();
  const todayStr = now.toLocaleDateString('sv-SE'); // YYYY-MM-DD local
  if (date === todayStr) {
    const nowMin = now.getHours() * 60 + now.getMinutes();
    return { closed: false, slots: slots.filter((s) => toMin(s) > nowMin) };
  }
  return { closed: false, slots };
}

function book(biz, jid, clientName, service, date, time) {
  const svc = biz.servicos.find(
    (s) => s.nome.toLowerCase() === (service || '').toLowerCase()
  );
  if (!svc) {
    return { error: `Serviço "${service}" não existe. Opções: ${biz.servicos.map((s) => s.nome).join(', ')}` };
  }
  const { closed, slots, error } = freeSlots(biz, date);
  if (error) return { error };
  if (closed) return { error: 'Fechado nesse dia.' };
  if (!slots.includes(time)) {
    return { error: `Horário ${time} indisponível. Livres em ${date}: ${slots.join(', ') || 'nenhum'}` };
  }
  const id = store.addBooking(jid, clientName, svc.nome, date, time);
  return { ok: true, id, service: svc.nome, price: svc.preco, date, time };
}

module.exports = { freeSlots, book, DIAS };
