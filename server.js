const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'ferie-secret-key-change-in-production';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], index: 'index.html' }));

// Database
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
const db = new Database(path.join(dataDir, 'ferie.db'));

// Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT DEFAULT 'employee',
    phone TEXT DEFAULT '',
    department TEXT DEFAULT '',
    total_days INTEGER DEFAULT 26,
    used_days INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    nome TEXT NOT NULL,
    email TEXT NOT NULL,
    reparto TEXT,
    responsabile TEXT,
    inizio TEXT NOT NULL,
    fine TEXT NOT NULL,
    giorni INTEGER DEFAULT 1,
    tipo TEXT DEFAULT 'Ferie',
    urgenza TEXT DEFAULT 'Normale',
    motivo TEXT,
    stato TEXT DEFAULT 'In attesa',
    approved_by INTEGER,
    approved_at TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cantieri (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    cliente TEXT NOT NULL,
    indirizzo TEXT,
    stato TEXT DEFAULT 'Attivo',
    data_inizio TEXT,
    data_fine TEXT,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cantieri_assegnazioni (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cantiere_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    ruolo TEXT DEFAULT 'Tecnico',
    UNIQUE(cantiere_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS rapportini (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    cantiere_id INTEGER NOT NULL,
    data TEXT NOT NULL,
    ore REAL NOT NULL,
    descrizione TEXT,
    materiali TEXT,
    problemi TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS timbrature (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    cantiere_id INTEGER,
    tipo TEXT NOT NULL,
    data TEXT NOT NULL,
    ora TEXT NOT NULL,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS scadenze (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    tipo TEXT NOT NULL,
    descrizione TEXT NOT NULL,
    data_scadenza TEXT NOT NULL,
    stato TEXT DEFAULT 'Attiva',
    notificato INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS attrezzature (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    codice TEXT UNIQUE,
    categoria TEXT,
    stato TEXT DEFAULT 'Disponibile',
    assegnato_a INTEGER,
    cantiere_id INTEGER,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS veicoli (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    targa TEXT UNIQUE NOT NULL,
    modello TEXT NOT NULL,
    assegnato_a INTEGER,
    km_attuali INTEGER DEFAULT 0,
    scadenza_bollo TEXT,
    scadenza_assicurazione TEXT,
    scadenza_revisione TEXT,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS richieste_materiale (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    cantiere_id INTEGER,
    materiale TEXT NOT NULL,
    quantita TEXT,
    urgenza TEXT DEFAULT 'Normale',
    stato TEXT DEFAULT 'In attesa',
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS documenti (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    tipo TEXT,
    cantiere_id INTEGER,
    url TEXT,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS avvisi (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titolo TEXT NOT NULL,
    messaggio TEXT NOT NULL,
    priorita TEXT DEFAULT 'Normale',
    attivo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sedi (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT UNIQUE NOT NULL,
    indirizzo TEXT,
    attiva INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Add sede_id column to users if not exists
try { db.exec('ALTER TABLE users ADD COLUMN sede_id INTEGER DEFAULT NULL'); } catch {}

// Default sedi
const defaultSedi = ['Ferrara', 'Ravenna'];
const insertSede = db.prepare('INSERT OR IGNORE INTO sedi (nome) VALUES (?)');
defaultSedi.forEach(s => insertSede.run(s));

// Default users
const defaultUsers = [
  { username: 'admin', password: 'admin123', name: 'Amministratore', email: 'admin@azienda.it', role: 'admin' },
  { username: 'manager', password: 'manager123', name: 'Responsabile', email: 'manager@azienda.it', role: 'manager' },
  { username: 'tecnico', password: 'tec123', name: 'Mario Rossi', email: 'mario@azienda.it', role: 'employee' },
];
const insertUser = db.prepare('INSERT OR IGNORE INTO users (username, password, name, email, role) VALUES (?, ?, ?, ?, ?)');
defaultUsers.forEach(u => insertUser.run(u.username, bcrypt.hashSync(u.password, 10), u.name, u.email, u.role));

// Helpers
const calcDays = (start, end) => {
  let count = 0, cur = new Date(start);
  while (cur <= new Date(end)) { if (cur.getDay() % 6 !== 0) count++; cur.setDate(cur.getDate() + 1); }
  return count || 1;
};

const notify = (userId, message) => db.prepare('INSERT INTO notifications (user_id, message) VALUES (?, ?)').run(userId, message);

// Auth middleware
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token mancante' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Token non valido' }); }
};
const isAdmin = (req, res, next) => req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Accesso negato' });
const isManager = (req, res, next) => ['admin', 'manager'].includes(req.user.role) ? next() : res.status(403).json({ error: 'Accesso negato' });

// AUTH
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT u.*, s.nome as sede_nome FROM users u LEFT JOIN sedi s ON u.sede_id = s.id WHERE u.username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Credenziali non valide' });
  const token = jwt.sign({ id: user.id, username: user.username, name: user.name, email: user.email, role: user.role, sede_id: user.sede_id }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, user: { id: user.id, username: user.username, name: user.name, email: user.email, role: user.role, total_days: user.total_days, used_days: user.used_days, sede_id: user.sede_id, sede_nome: user.sede_nome } });
});

app.post('/api/register', (req, res) => {
  const { username, password, name, email, sede_id } = req.body;
  if (!username || !password || !name || !email || !sede_id) return res.status(400).json({ error: 'Tutti i campi sono obbligatori, inclusa la sede' });
  if (username.length < 3 || password.length < 6) return res.status(400).json({ error: 'Username min 3, password min 6 caratteri' });
  try {
    const result = db.prepare('INSERT INTO users (username, password, name, email, role, sede_id) VALUES (?, ?, ?, ?, ?, ?)').run(username, bcrypt.hashSync(password, 10), name, email, 'employee', sede_id);
    const user = db.prepare('SELECT u.*, s.nome as sede_nome FROM users u LEFT JOIN sedi s ON u.sede_id = s.id WHERE u.id = ?').get(result.lastInsertRowid);
    const token = jwt.sign({ id: user.id, username: user.username, name: user.name, email: user.email, role: user.role, sede_id: user.sede_id }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, user: { id: user.id, username: user.username, name: user.name, email: user.email, role: user.role, total_days: user.total_days, used_days: user.used_days, sede_id: user.sede_id, sede_nome: user.sede_nome } });
  } catch { res.status(400).json({ error: 'Username o email già in uso' }); }
});

// SEDI
app.get('/api/sedi', (req, res) => res.json(db.prepare('SELECT * FROM sedi WHERE attiva = 1 ORDER BY nome').all()));
app.post('/api/sedi', auth, isAdmin, (req, res) => {
  const { nome, indirizzo } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome obbligatorio' });
  try { db.prepare('INSERT INTO sedi (nome, indirizzo) VALUES (?,?)').run(nome, indirizzo || ''); res.json({ message: 'OK' }); }
  catch { res.status(400).json({ error: 'Sede già esistente' }); }
});
app.delete('/api/sedi/:id', auth, isAdmin, (req, res) => {
  const users = db.prepare('SELECT COUNT(*) as c FROM users WHERE sede_id = ?').get(req.params.id);
  if (users.c > 0) return res.status(400).json({ error: 'Impossibile eliminare: ci sono dipendenti assegnati' });
  db.prepare('UPDATE sedi SET attiva = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'OK' });
});

// PROFILE
app.get('/api/profile', auth, (req, res) => res.json(db.prepare('SELECT u.id, u.username, u.name, u.email, u.role, u.phone, u.department, u.total_days, u.used_days, u.sede_id, s.nome as sede_nome FROM users u LEFT JOIN sedi s ON u.sede_id = s.id WHERE u.id = ?').get(req.user.id)));
app.patch('/api/profile', auth, (req, res) => {
  const { name, phone, department } = req.body;
  db.prepare('UPDATE users SET name=COALESCE(?,name), phone=COALESCE(?,phone), department=COALESCE(?,department) WHERE id=?').run(name, phone, department, req.user.id);
  res.json({ message: 'OK' });
});
app.post('/api/change-password', auth, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const user = db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(oldPassword, user.password)) return res.status(400).json({ error: 'Password errata' });
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 10), req.user.id);
  res.json({ message: 'OK' });
});

// NOTIFICATIONS
app.get('/api/notifications', auth, (req, res) => res.json(db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(req.user.id)));
app.post('/api/notifications/read', auth, (req, res) => { db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.user.id); res.json({ message: 'OK' }); });

// REQUESTS (Ferie)
app.get('/api/requests', auth, (req, res) => {
  const sql = req.user.role === 'employee' ? 'SELECT * FROM requests WHERE user_id = ? ORDER BY created_at DESC' : 'SELECT * FROM requests ORDER BY created_at DESC';
  res.json(req.user.role === 'employee' ? db.prepare(sql).all(req.user.id) : db.prepare(sql).all());
});
app.post('/api/requests', auth, (req, res) => {
  const { nome, email, reparto, responsabile, inizio, fine, tipo, urgenza, motivo } = req.body;
  if (!inizio || !fine) return res.status(400).json({ error: 'Date obbligatorie' });
  const giorni = calcDays(inizio, fine);
  db.prepare('INSERT INTO requests (user_id, nome, email, reparto, responsabile, inizio, fine, giorni, tipo, urgenza, motivo) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(req.user.id, nome, email, reparto, responsabile, inizio, fine, giorni, tipo, urgenza, motivo);
  res.json({ message: 'OK', giorni });
});
app.patch('/api/requests/:id/status', auth, isManager, (req, res) => {
  const { stato } = req.body;
  const r = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Non trovata' });
  db.prepare('UPDATE requests SET stato=?, approved_by=?, approved_at=? WHERE id=?').run(stato, req.user.id, new Date().toISOString(), req.params.id);
  if (stato === 'Approvata' && r.tipo === 'Ferie') db.prepare('UPDATE users SET used_days = used_days + ? WHERE id = ?').run(r.giorni, r.user_id);
  notify(r.user_id, `Richiesta ${r.inizio} - ${r.fine}: ${stato}`);
  res.json({ message: 'OK' });
});
app.delete('/api/requests/:id', auth, isAdmin, (req, res) => { db.prepare('DELETE FROM requests WHERE id = ?').run(req.params.id); res.json({ message: 'OK' }); });

// STATS
app.get('/api/stats', auth, isManager, (req, res) => {
  res.json({
    total: db.prepare('SELECT COUNT(*) as c FROM requests').get().c,
    pending: db.prepare("SELECT COUNT(*) as c FROM requests WHERE stato = 'In attesa'").get().c,
    approved: db.prepare("SELECT COUNT(*) as c FROM requests WHERE stato = 'Approvata'").get().c,
    rejected: db.prepare("SELECT COUNT(*) as c FROM requests WHERE stato = 'Rifiutata'").get().c,
    thisMonth: db.prepare("SELECT COUNT(*) as c FROM requests WHERE stato = 'Approvata' AND inizio LIKE ?").get(`${new Date().toISOString().slice(0, 7)}%`).c
  });
});

// USERS
app.get('/api/users', auth, (req, res) => {
  // Admin/Manager vedono tutti, employee vede solo quelli della sua sede
  if (['admin', 'manager'].includes(req.user.role)) {
    res.json(db.prepare('SELECT u.id, u.username, u.name, u.email, u.role, u.phone, u.department, u.total_days, u.used_days, u.sede_id, s.nome as sede_nome FROM users u LEFT JOIN sedi s ON u.sede_id = s.id ORDER BY s.nome, u.name').all());
  } else {
    res.json(db.prepare('SELECT u.id, u.username, u.name, u.email, u.role, u.phone, u.department, u.total_days, u.used_days, u.sede_id, s.nome as sede_nome FROM users u LEFT JOIN sedi s ON u.sede_id = s.id WHERE u.sede_id = ? ORDER BY u.name').all(req.user.sede_id));
  }
});
app.post('/api/users', auth, isAdmin, (req, res) => {
  const { username, password, name, email, role, total_days, sede_id } = req.body;
  if (!username || !password || !name || !email) return res.status(400).json({ error: 'Campi obbligatori' });
  try {
    db.prepare('INSERT INTO users (username, password, name, email, role, total_days, sede_id) VALUES (?,?,?,?,?,?,?)').run(username, bcrypt.hashSync(password, 10), name, email, role || 'employee', total_days || 26, sede_id || null);
    res.json({ message: 'OK' });
  } catch { res.status(400).json({ error: 'Già esistente' }); }
});
app.patch('/api/users/:id', auth, isManager, (req, res) => {
  const { name, email, role, total_days, used_days, sede_id, resetPassword } = req.body;
  // Solo admin può cambiare ruolo
  if (role && req.user.role !== 'admin') return res.status(403).json({ error: 'Solo admin può cambiare ruolo' });
  if (resetPassword) db.prepare('UPDATE users SET password = ? WHERE id = ?').run(bcrypt.hashSync(resetPassword, 10), req.params.id);
  db.prepare('UPDATE users SET name=COALESCE(?,name), email=COALESCE(?,email), role=COALESCE(?,role), total_days=COALESCE(?,total_days), used_days=COALESCE(?,used_days), sede_id=COALESCE(?,sede_id) WHERE id=?').run(name, email, role, total_days, used_days, sede_id, req.params.id);
  res.json({ message: 'OK' });
});
app.delete('/api/users/:id', auth, isAdmin, (req, res) => {
  if (req.params.id == req.user.id) return res.status(400).json({ error: 'Non puoi eliminare te stesso' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ message: 'OK' });
});

// CANTIERI
app.get('/api/cantieri', auth, (req, res) => {
  const cantieri = db.prepare('SELECT * FROM cantieri ORDER BY created_at DESC').all();
  cantieri.forEach(c => {
    c.tecnici = db.prepare('SELECT u.id, u.name FROM cantieri_assegnazioni ca JOIN users u ON ca.user_id = u.id WHERE ca.cantiere_id = ?').all(c.id);
  });
  res.json(cantieri);
});
app.post('/api/cantieri', auth, isManager, (req, res) => {
  const { nome, cliente, indirizzo, data_inizio, data_fine, note } = req.body;
  if (!nome || !cliente) return res.status(400).json({ error: 'Nome e cliente obbligatori' });
  const r = db.prepare('INSERT INTO cantieri (nome, cliente, indirizzo, data_inizio, data_fine, note) VALUES (?,?,?,?,?,?)').run(nome, cliente, indirizzo, data_inizio, data_fine, note);
  res.json({ id: r.lastInsertRowid, message: 'OK' });
});
app.patch('/api/cantieri/:id', auth, isManager, (req, res) => {
  const { nome, cliente, indirizzo, stato, data_inizio, data_fine, note } = req.body;
  db.prepare('UPDATE cantieri SET nome=COALESCE(?,nome), cliente=COALESCE(?,cliente), indirizzo=COALESCE(?,indirizzo), stato=COALESCE(?,stato), data_inizio=COALESCE(?,data_inizio), data_fine=COALESCE(?,data_fine), note=COALESCE(?,note) WHERE id=?').run(nome, cliente, indirizzo, stato, data_inizio, data_fine, note, req.params.id);
  res.json({ message: 'OK' });
});
app.delete('/api/cantieri/:id', auth, isAdmin, (req, res) => { db.prepare('DELETE FROM cantieri WHERE id = ?').run(req.params.id); res.json({ message: 'OK' }); });
app.post('/api/cantieri/:id/assegna', auth, isManager, (req, res) => {
  const { user_id } = req.body;
  try { db.prepare('INSERT INTO cantieri_assegnazioni (cantiere_id, user_id) VALUES (?,?)').run(req.params.id, user_id); res.json({ message: 'OK' }); }
  catch { res.status(400).json({ error: 'Già assegnato' }); }
});
app.delete('/api/cantieri/:id/assegna/:userId', auth, isManager, (req, res) => {
  db.prepare('DELETE FROM cantieri_assegnazioni WHERE cantiere_id = ? AND user_id = ?').run(req.params.id, req.params.userId);
  res.json({ message: 'OK' });
});

// RAPPORTINI
app.get('/api/rapportini', auth, (req, res) => {
  const sql = req.user.role === 'employee'
    ? 'SELECT r.*, c.nome as cantiere_nome, u.name as user_name FROM rapportini r LEFT JOIN cantieri c ON r.cantiere_id = c.id LEFT JOIN users u ON r.user_id = u.id WHERE r.user_id = ? ORDER BY r.data DESC'
    : 'SELECT r.*, c.nome as cantiere_nome, u.name as user_name FROM rapportini r LEFT JOIN cantieri c ON r.cantiere_id = c.id LEFT JOIN users u ON r.user_id = u.id ORDER BY r.data DESC';
  res.json(req.user.role === 'employee' ? db.prepare(sql).all(req.user.id) : db.prepare(sql).all());
});
app.post('/api/rapportini', auth, (req, res) => {
  const { cantiere_id, data, ore, descrizione, materiali, problemi } = req.body;
  if (!cantiere_id || !data || !ore) return res.status(400).json({ error: 'Cantiere, data e ore obbligatori' });
  db.prepare('INSERT INTO rapportini (user_id, cantiere_id, data, ore, descrizione, materiali, problemi) VALUES (?,?,?,?,?,?,?)').run(req.user.id, cantiere_id, data, ore, descrizione, materiali, problemi);
  res.json({ message: 'OK' });
});
app.delete('/api/rapportini/:id', auth, isManager, (req, res) => { db.prepare('DELETE FROM rapportini WHERE id = ?').run(req.params.id); res.json({ message: 'OK' }); });

// TIMBRATURE
app.get('/api/timbrature', auth, (req, res) => {
  const sql = req.user.role === 'employee'
    ? 'SELECT t.*, c.nome as cantiere_nome, u.name as user_name FROM timbrature t LEFT JOIN cantieri c ON t.cantiere_id = c.id LEFT JOIN users u ON t.user_id = u.id WHERE t.user_id = ? ORDER BY t.data DESC, t.ora DESC'
    : 'SELECT t.*, c.nome as cantiere_nome, u.name as user_name FROM timbrature t LEFT JOIN cantieri c ON t.cantiere_id = c.id LEFT JOIN users u ON t.user_id = u.id ORDER BY t.data DESC, t.ora DESC';
  res.json(req.user.role === 'employee' ? db.prepare(sql).all(req.user.id) : db.prepare(sql).all());
});
app.post('/api/timbrature', auth, (req, res) => {
  const { cantiere_id, tipo, note } = req.body;
  const now = new Date();
  const data = now.toISOString().slice(0, 10);
  const ora = now.toTimeString().slice(0, 5);
  db.prepare('INSERT INTO timbrature (user_id, cantiere_id, tipo, data, ora, note) VALUES (?,?,?,?,?,?)').run(req.user.id, cantiere_id, tipo, data, ora, note);
  res.json({ message: 'OK', data, ora });
});
app.get('/api/timbrature/riepilogo', auth, (req, res) => {
  const { mese } = req.query;
  const userId = req.user.role === 'employee' ? req.user.id : null;
  let sql = `SELECT user_id, data, SUM(CASE WHEN tipo='Entrata' THEN 1 ELSE 0 END) as entrate, SUM(CASE WHEN tipo='Uscita' THEN 1 ELSE 0 END) as uscite FROM timbrature WHERE data LIKE ?`;
  if (userId) sql += ` AND user_id = ${userId}`;
  sql += ' GROUP BY user_id, data';
  res.json(db.prepare(sql).all(`${mese}%`));
});

// SCADENZE
app.get('/api/scadenze', auth, (req, res) => {
  const sql = req.user.role === 'employee'
    ? 'SELECT s.*, u.name as user_name FROM scadenze s LEFT JOIN users u ON s.user_id = u.id WHERE s.user_id = ? OR s.user_id IS NULL ORDER BY s.data_scadenza'
    : 'SELECT s.*, u.name as user_name FROM scadenze s LEFT JOIN users u ON s.user_id = u.id ORDER BY s.data_scadenza';
  res.json(req.user.role === 'employee' ? db.prepare(sql).all(req.user.id) : db.prepare(sql).all());
});
app.post('/api/scadenze', auth, isManager, (req, res) => {
  const { user_id, tipo, descrizione, data_scadenza } = req.body;
  if (!tipo || !descrizione || !data_scadenza) return res.status(400).json({ error: 'Campi obbligatori' });
  db.prepare('INSERT INTO scadenze (user_id, tipo, descrizione, data_scadenza) VALUES (?,?,?,?)').run(user_id || null, tipo, descrizione, data_scadenza);
  res.json({ message: 'OK' });
});
app.patch('/api/scadenze/:id', auth, isManager, (req, res) => {
  const { stato, data_scadenza } = req.body;
  db.prepare('UPDATE scadenze SET stato=COALESCE(?,stato), data_scadenza=COALESCE(?,data_scadenza) WHERE id=?').run(stato, data_scadenza, req.params.id);
  res.json({ message: 'OK' });
});
app.delete('/api/scadenze/:id', auth, isAdmin, (req, res) => { db.prepare('DELETE FROM scadenze WHERE id = ?').run(req.params.id); res.json({ message: 'OK' }); });

// ATTREZZATURE
app.get('/api/attrezzature', auth, (req, res) => res.json(db.prepare('SELECT a.*, u.name as assegnato_nome, c.nome as cantiere_nome FROM attrezzature a LEFT JOIN users u ON a.assegnato_a = u.id LEFT JOIN cantieri c ON a.cantiere_id = c.id ORDER BY a.nome').all()));
app.post('/api/attrezzature', auth, isManager, (req, res) => {
  const { nome, codice, categoria, note } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome obbligatorio' });
  try {
    db.prepare('INSERT INTO attrezzature (nome, codice, categoria, note) VALUES (?,?,?,?)').run(nome, codice, categoria, note);
    res.json({ message: 'OK' });
  } catch { res.status(400).json({ error: 'Codice già esistente' }); }
});
app.patch('/api/attrezzature/:id', auth, isManager, (req, res) => {
  const { nome, stato, assegnato_a, cantiere_id, note } = req.body;
  db.prepare('UPDATE attrezzature SET nome=COALESCE(?,nome), stato=COALESCE(?,stato), assegnato_a=?, cantiere_id=?, note=COALESCE(?,note) WHERE id=?').run(nome, stato, assegnato_a || null, cantiere_id || null, note, req.params.id);
  res.json({ message: 'OK' });
});
app.delete('/api/attrezzature/:id', auth, isAdmin, (req, res) => { db.prepare('DELETE FROM attrezzature WHERE id = ?').run(req.params.id); res.json({ message: 'OK' }); });

// VEICOLI
app.get('/api/veicoli', auth, (req, res) => res.json(db.prepare('SELECT v.*, u.name as assegnato_nome FROM veicoli v LEFT JOIN users u ON v.assegnato_a = u.id ORDER BY v.targa').all()));
app.post('/api/veicoli', auth, isAdmin, (req, res) => {
  const { targa, modello, scadenza_bollo, scadenza_assicurazione, scadenza_revisione, note } = req.body;
  if (!targa || !modello) return res.status(400).json({ error: 'Targa e modello obbligatori' });
  try {
    db.prepare('INSERT INTO veicoli (targa, modello, scadenza_bollo, scadenza_assicurazione, scadenza_revisione, note) VALUES (?,?,?,?,?,?)').run(targa, modello, scadenza_bollo, scadenza_assicurazione, scadenza_revisione, note);
    res.json({ message: 'OK' });
  } catch { res.status(400).json({ error: 'Targa già esistente' }); }
});
app.patch('/api/veicoli/:id', auth, isManager, (req, res) => {
  const { assegnato_a, km_attuali, scadenza_bollo, scadenza_assicurazione, scadenza_revisione, note } = req.body;
  db.prepare('UPDATE veicoli SET assegnato_a=?, km_attuali=COALESCE(?,km_attuali), scadenza_bollo=COALESCE(?,scadenza_bollo), scadenza_assicurazione=COALESCE(?,scadenza_assicurazione), scadenza_revisione=COALESCE(?,scadenza_revisione), note=COALESCE(?,note) WHERE id=?').run(assegnato_a || null, km_attuali, scadenza_bollo, scadenza_assicurazione, scadenza_revisione, note, req.params.id);
  res.json({ message: 'OK' });
});
app.delete('/api/veicoli/:id', auth, isAdmin, (req, res) => { db.prepare('DELETE FROM veicoli WHERE id = ?').run(req.params.id); res.json({ message: 'OK' }); });

// RICHIESTE MATERIALE
app.get('/api/materiale', auth, (req, res) => {
  const sql = req.user.role === 'employee'
    ? 'SELECT m.*, c.nome as cantiere_nome, u.name as user_name FROM richieste_materiale m LEFT JOIN cantieri c ON m.cantiere_id = c.id LEFT JOIN users u ON m.user_id = u.id WHERE m.user_id = ? ORDER BY m.created_at DESC'
    : 'SELECT m.*, c.nome as cantiere_nome, u.name as user_name FROM richieste_materiale m LEFT JOIN cantieri c ON m.cantiere_id = c.id LEFT JOIN users u ON m.user_id = u.id ORDER BY m.created_at DESC';
  res.json(req.user.role === 'employee' ? db.prepare(sql).all(req.user.id) : db.prepare(sql).all());
});
app.post('/api/materiale', auth, (req, res) => {
  const { cantiere_id, materiale, quantita, urgenza, note } = req.body;
  if (!materiale) return res.status(400).json({ error: 'Materiale obbligatorio' });
  db.prepare('INSERT INTO richieste_materiale (user_id, cantiere_id, materiale, quantita, urgenza, note) VALUES (?,?,?,?,?,?)').run(req.user.id, cantiere_id || null, materiale, quantita, urgenza, note);
  res.json({ message: 'OK' });
});
app.patch('/api/materiale/:id/status', auth, isManager, (req, res) => {
  const { stato } = req.body;
  db.prepare('UPDATE richieste_materiale SET stato = ? WHERE id = ?').run(stato, req.params.id);
  res.json({ message: 'OK' });
});
app.delete('/api/materiale/:id', auth, isManager, (req, res) => { db.prepare('DELETE FROM richieste_materiale WHERE id = ?').run(req.params.id); res.json({ message: 'OK' }); });

// DOCUMENTI
app.get('/api/documenti', auth, (req, res) => {
  const { cantiere_id } = req.query;
  let sql = 'SELECT d.*, c.nome as cantiere_nome FROM documenti d LEFT JOIN cantieri c ON d.cantiere_id = c.id';
  if (cantiere_id) sql += ` WHERE d.cantiere_id = ${cantiere_id}`;
  sql += ' ORDER BY d.created_at DESC';
  res.json(db.prepare(sql).all());
});
app.post('/api/documenti', auth, isManager, (req, res) => {
  const { nome, tipo, cantiere_id, url, note } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome obbligatorio' });
  db.prepare('INSERT INTO documenti (nome, tipo, cantiere_id, url, note) VALUES (?,?,?,?,?)').run(nome, tipo, cantiere_id || null, url, note);
  res.json({ message: 'OK' });
});
app.delete('/api/documenti/:id', auth, isManager, (req, res) => { db.prepare('DELETE FROM documenti WHERE id = ?').run(req.params.id); res.json({ message: 'OK' }); });

// AVVISI
app.get('/api/avvisi', auth, (req, res) => res.json(db.prepare('SELECT * FROM avvisi WHERE attivo = 1 ORDER BY created_at DESC').all()));
app.post('/api/avvisi', auth, isManager, (req, res) => {
  const { titolo, messaggio, priorita } = req.body;
  if (!titolo || !messaggio) return res.status(400).json({ error: 'Titolo e messaggio obbligatori' });
  db.prepare('INSERT INTO avvisi (titolo, messaggio, priorita) VALUES (?,?,?)').run(titolo, messaggio, priorita || 'Normale');
  res.json({ message: 'OK' });
});
app.delete('/api/avvisi/:id', auth, isManager, (req, res) => { db.prepare('UPDATE avvisi SET attivo = 0 WHERE id = ?').run(req.params.id); res.json({ message: 'OK' }); });

// CALENDAR
app.get('/api/calendar', auth, (req, res) => {
  const { month, year } = req.query;
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = `${year}-${String(month).padStart(2, '0')}-31`;
  // Manager/Admin vedono tutte le ferie, dipendenti solo quelle della loro sede
  if (['admin', 'manager'].includes(req.user.role)) {
    res.json(db.prepare(`SELECT r.id, r.nome, r.inizio, r.fine, r.tipo FROM requests r WHERE r.stato = 'Approvata' AND ((r.inizio BETWEEN ? AND ?) OR (r.fine BETWEEN ? AND ?))`).all(start, end, start, end));
  } else {
    res.json(db.prepare(`SELECT r.id, r.nome, r.inizio, r.fine, r.tipo FROM requests r JOIN users u ON r.user_id = u.id WHERE r.stato = 'Approvata' AND u.sede_id = ? AND ((r.inizio BETWEEN ? AND ?) OR (r.fine BETWEEN ? AND ?))`).all(req.user.sede_id, start, end, start, end));
  }
});

// EXPORT
app.get('/api/export', auth, isManager, (req, res) => {
  const { format, from, to, stato } = req.query;
  let sql = 'SELECT * FROM requests WHERE 1=1';
  const params = [];
  if (from) { sql += ' AND inizio >= ?'; params.push(from); }
  if (to) { sql += ' AND fine <= ?'; params.push(to); }
  if (stato) { sql += ' AND stato = ?'; params.push(stato); }
  const data = db.prepare(sql).all(...params);
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=export.csv');
    res.send('ID,Nome,Email,Inizio,Fine,Giorni,Tipo,Stato\n' + data.map(r => `${r.id},"${r.nome}","${r.email}",${r.inizio},${r.fine},${r.giorni},"${r.tipo}","${r.stato}"`).join('\n'));
  } else res.json(data);
});

// HTML Routes
const pages = ['/', '/index.html', '/register.html', '/request.html', '/dashboard.html', '/admin.html', '/calendar.html', '/cantieri.html'];
pages.forEach(p => app.get(p, (req, res) => res.sendFile(path.join(__dirname, 'public', p === '/' ? 'index.html' : p))));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
