const store = require('./store');

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toMin(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
function toHHMM(min) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

function parseDate(date) {
  if (!DATE_RE.test(date || '')) return null;
  const d = new Date(`${date}T12:00:00`);
  if (isNaN(d) || d.toLocaleDateString('sv-SE') !== date) return null;
  return d;
}

function takenIntervals(biz, date) {
  const step = biz.slot_min || 30;
  return store.bookingsOn(date).map((b) => {
    const start = toMin(b.time);
    return [start, start + (b.duration_min || step)];
  });
}

function freeSlots(biz, date, durationMin) {
  const d = parseDate(date);
  if (!d) return { error: 'Data inválida — usar formato AAAA-MM-DD' };
  const todayStr = new Date().toLocaleDateString('sv-SE');
  if (date < todayStr) return { error: `Data no passado — hoje é ${todayStr}` };
  const range = biz.horarios[DIAS[d.getDay()]];
  if (!range) return { closed: true, slots: [] };

  const step = biz.slot_min || 30;
  const dur = durationMin || step;
  const taken = takenIntervals(biz, date);
  const close = toMin(range[1]);
  const slots = [];
  for (let t = toMin(range[0]); t + dur <= close; t += step) {
    const overlaps = taken.some(([s, e]) => t < e && t + dur > s);
    if (!overlaps) slots.push(toHHMM(t));
  }

  const now = new Date();
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
  const dur = svc.duracao_min || biz.slot_min || 30;
  try {
    return store.withTx(() => {
      const { closed, slots, error } = freeSlots(biz, date, dur);
      if (error) return { error };
      if (closed) return { error: 'Fechado nesse dia.' };
      if (!slots.includes(time)) {
        return { error: `Horário ${time} indisponível. Livres em ${date}: ${slots.join(', ') || 'nenhum'}` };
      }
      const id = store.addBooking(jid, clientName, svc.nome, date, time, dur);
      return { ok: true, id, service: svc.nome, price: svc.preco, date, time };
    });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return { error: `Horário ${time} acabou de ser ocupado. Consulte os horários livres de novo.` };
    }
    throw e;
  }
}

module.exports = { freeSlots, book, DIAS };
