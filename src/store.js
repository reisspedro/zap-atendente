const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'zap.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

db.exec(`
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jid TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jid TEXT NOT NULL,
  client_name TEXT NOT NULL,
  service TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  duration_min INTEGER NOT NULL DEFAULT 30,
  reminded INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'confirmado' CHECK (status IN ('confirmado','cancelado')),
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS paused (
  jid TEXT PRIMARY KEY,
  until TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msg_jid ON messages(jid, id);
CREATE INDEX IF NOT EXISTS idx_book_date ON bookings(date, status);
`);

for (const col of ['duration_min INTEGER NOT NULL DEFAULT 30', 'reminded INTEGER NOT NULL DEFAULT 0']) {
  try { db.exec(`ALTER TABLE bookings ADD COLUMN ${col}`); } catch {}
}
try {
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_book_slot ON bookings(date, time) WHERE status='confirmado'");
} catch {}
db.prepare("DELETE FROM messages WHERE created_at < datetime('now','localtime','-90 days')").run();

const store = {
  addMessage(jid, role, content) {
    db.prepare('INSERT INTO messages (jid, role, content) VALUES (?,?,?)').run(jid, role, content);
  },
  history(jid, limit = 20) {
    return db.prepare(
      'SELECT role, content FROM messages WHERE jid=? ORDER BY id DESC LIMIT ?'
    ).all(jid, limit).reverse();
  },

  addBooking(jid, clientName, service, date, time, durationMin = 30) {
    return db.prepare(
      'INSERT INTO bookings (jid, client_name, service, date, time, duration_min) VALUES (?,?,?,?,?,?)'
    ).run(jid, clientName, service, date, time, durationMin).lastInsertRowid;
  },
  withTx(fn) {
    return db.transaction(fn)();
  },
  bookingsOn(date) {
    return db.prepare(
      "SELECT * FROM bookings WHERE date=? AND status='confirmado' ORDER BY time"
    ).all(date);
  },
  bookingsByJid(jid) {
    return db.prepare(
      "SELECT * FROM bookings WHERE jid=? AND status='confirmado' AND date >= date('now','localtime') ORDER BY date, time"
    ).all(jid);
  },
  cancelBooking(id) {
    return db.prepare("UPDATE bookings SET status='cancelado' WHERE id=?").run(id).changes;
  },
  cancelBookingForJid(id, jid) {
    return db.prepare(
      "UPDATE bookings SET status='cancelado' WHERE id=? AND jid=? AND status='confirmado'"
    ).run(id, jid).changes;
  },
  bookingsNeedingReminder(withinMin) {
    return db.prepare(
      `SELECT * FROM bookings WHERE status='confirmado' AND reminded=0
       AND datetime(date || ' ' || time) BETWEEN datetime('now','localtime')
       AND datetime('now','localtime','+' || ? || ' minutes')`
    ).all(withinMin);
  },
  markReminded(id) {
    db.prepare('UPDATE bookings SET reminded=1 WHERE id=?').run(id);
  },
  isSlotTaken(date, time) {
    return !!db.prepare(
      "SELECT id FROM bookings WHERE date=? AND time=? AND status='confirmado'"
    ).get(date, time);
  },

  pause(jid, hours = 4) {
    db.prepare(
      `INSERT INTO paused (jid, until) VALUES (?, datetime('now','localtime',?))
       ON CONFLICT(jid) DO UPDATE SET until=excluded.until`
    ).run(jid, `+${hours} hours`);
  },
  unpause(jid) {
    db.prepare('DELETE FROM paused WHERE jid=?').run(jid);
  },
  isPaused(jid) {
    const row = db.prepare(
      "SELECT 1 ok FROM paused WHERE jid=? AND until > datetime('now','localtime')"
    ).get(jid);
    return !!row;
  },
};

module.exports = store;
