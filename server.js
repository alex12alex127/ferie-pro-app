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
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], index: 'index.html' }));

// Database setup
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
const db = new Database(path.join(dataDir, 'ferie.db'));

// Create tables
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
    ruolo TEXT,
    responsabile TEXT,
    inizio TEXT NOT NULL,
    fine TEXT NOT NULL,
    giorni INTEGER DEFAULT 1,
    tipo TEXT DEFAULT 'Ferie',
    urgenza TEXT DEFAULT 'Normale',
    motivo TEXT,
    telefono TEXT,
    stato TEXT DEFAULT 'In attesa',
    approved_by INTEGER,
    approved_at TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (approved_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// Add columns if not exist (migration)
try { db.exec('ALTER TABLE users ADD COLUMN phone TEXT DEFAULT ""'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN department TEXT DEFAULT ""'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN total_days INTEGER DEFAULT 26'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN used_days INTEGER DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE requests ADD COLUMN giorni INTEGER DEFAULT 1'); } catch {}
try { db.exec('ALTER TABLE requests ADD COLUMN approved_by INTEGER'); } catch {}
try { db.exec('ALTER TABLE requests ADD COLUMN approved_at TEXT'); } catch {}
try { db.exec('ALTER TABLE requests ADD COLUMN notes TEXT'); } catch {}

// Create default users
const defaultUsers = [
  { username: 'admin', password: 'admin123', name: 'Amministratore', email: 'admin@azienda.it', role: 'admin' },
  { username: 'manager', password: 'manager123', name: 'Manager', email: 'manager@azienda.it', role: 'manager' },
  { username: 'dipendente', password: 'dip123', name: 'Mario Rossi', email: 'mario.rossi@azienda.it', role: 'employee' },
];
const insertUser = db.prepare('INSERT OR IGNORE INTO users (username, password, name, email, role) VALUES (?, ?, ?, ?, ?)');
defaultUsers.forEach(u => insertUser.run(u.username, bcrypt.hashSync(u.password, 10), u.name, u.email, u.role));

// Helper: calculate working days
function calcDays(start, end) {
  let count = 0, cur = new Date(start);
  const endDate = new Date(end);
  while (cur <= endDate) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count || 1;
}

// Helper: send notification (in-app + email if configured)
function notify(userId, message, email = null) {
  db.prepare('INSERT INTO notifications (user_id, message) VALUES (?, ?)').run(userId, message);
  if (SMTP_HOST && email) {
    // Email would be sent here with nodemailer if configured
    console.log(`[Email] To: ${email}, Message: ${message}`);
  }
}

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
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Credenziali non valide' });
  const token = jwt.sign({ id: user.id, username: user.username, name: user.name, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, user: { id: user.id, username: user.username, name: user.name, email: user.email, role: user.role, phone: user.phone, department: user.department, total_days: user.total_days, used_days: user.used_days } });
});

app.post('/api/register', (req, res) => {
  const { username, password, name, email } = req.body;
  if (!username || !password || !name || !email) return res.status(400).json({ error: 'Tutti i campi sono obbligatori' });
  if (username.length < 3) return res.status(400).json({ error: 'Username deve avere almeno 3 caratteri' });
  if (password.length < 6) return res.status(400).json({ error: 'Password deve avere almeno 6 caratteri' });
  try {
    const result = db.prepare('INSERT INTO users (username, password, name, email, role) VALUES (?, ?, ?, ?, ?)').run(username, bcrypt.hashSync(password, 10), name, email, 'employee');
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    const token = jwt.sign({ id: user.id, username: user.username, name: user.name, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, user: { id: user.id, username: user.username, name: user.name, email: user.email, role: user.role, phone: user.phone || '', department: user.department || '', total_days: user.total_days, used_days: user.used_days }, message: 'Registrazione completata!' });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Username o email già in uso' });
    res.status(500).json({ error: 'Errore registrazione' });
  }
});

// PROFILE
app.get('/api/profile', auth, (req, res) => {
  const user = db.prepare('SELECT id, username, name, email, role, phone, department, total_days, used_days FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

app.patch('/api/profile', auth, (req, res) => {
  const { name, phone, department } = req.body;
  db.prepare('UPDATE users SET name = COALESCE(?, name), phone = COALESCE(?, phone), department = COALESCE(?, department) WHERE id = ?').run(name, phone, department, req.user.id);
  res.json({ message: 'Profilo aggiornato' });
});

app.post('/api/change-password', auth, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const user = db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(oldPassword, user.password)) return res.status(400).json({ error: 'Password attuale errata' });
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 10), req.user.id);
  res.json({ message: 'Password cambiata' });
});

// NOTIFICATIONS
app.get('/api/notifications', auth, (req, res) => {
  const notifs = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(req.user.id);
  res.json(notifs);
});

app.post('/api/notifications/read', auth, (req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.user.id);
  res.json({ message: 'ok' });
});

// REQUESTS
app.get('/api/requests', auth, (req, res) => {
  const requests = req.user.role === 'employee'
    ? db.prepare('SELECT r.*, u.name as approved_by_name FROM requests r LEFT JOIN users u ON r.approved_by = u.id WHERE r.user_id = ? ORDER BY r.created_at DESC').all(req.user.id)
    : db.prepare('SELECT r.*, u.name as approved_by_name FROM requests r LEFT JOIN users u ON r.approved_by = u.id ORDER BY r.created_at DESC').all();
  res.json(requests);
});

app.post('/api/requests', auth, (req, res) => {
  const { nome, email, reparto, ruolo, responsabile, inizio, fine, tipo, urgenza, motivo, telefono } = req.body;
  if (!nome || !email || !inizio || !fine) return res.status(400).json({ error: 'Campi obbligatori mancanti' });
  const giorni = calcDays(inizio, fine);
  const result = db.prepare('INSERT INTO requests (user_id, nome, email, reparto, ruolo, responsabile, inizio, fine, giorni, tipo, urgenza, motivo, telefono) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(req.user.id, nome, email, reparto, ruolo, responsabile, inizio, fine, giorni, tipo, urgenza, motivo, telefono);
  res.json({ id: result.lastInsertRowid, giorni, message: 'Richiesta creata' });
});

app.patch('/api/requests/:id/status', auth, isManager, (req, res) => {
  const { stato, notes } = req.body;
  if (!['In attesa', 'Approvata', 'Rifiutata'].includes(stato)) return res.status(400).json({ error: 'Stato non valido' });
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);
  if (!request) return res.status(404).json({ error: 'Richiesta non trovata' });
  
  db.prepare('UPDATE requests SET stato = ?, approved_by = ?, approved_at = ?, notes = COALESCE(?, notes) WHERE id = ?').run(stato, req.user.id, new Date().toISOString(), notes, req.params.id);
  
  // Update used days if approved/rejected
  if (stato === 'Approvata' && request.tipo === 'Ferie') {
    db.prepare('UPDATE users SET used_days = used_days + ? WHERE id = ?').run(request.giorni, request.user_id);
  }
  
  // Notify user
  const statusText = stato === 'Approvata' ? 'approvata' : stato === 'Rifiutata' ? 'rifiutata' : 'aggiornata';
  notify(request.user_id, `La tua richiesta dal ${request.inizio} al ${request.fine} è stata ${statusText}`, request.email);
  
  res.json({ message: 'Stato aggiornato' });
});

app.delete('/api/requests/:id', auth, isAdmin, (req, res) => {
  db.prepare('DELETE FROM requests WHERE id = ?').run(req.params.id);
  res.json({ message: 'Richiesta eliminata' });
});

// CALENDAR
app.get('/api/calendar', auth, (req, res) => {
  const { month, year } = req.query;
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = `${year}-${String(month).padStart(2, '0')}-31`;
  const events = db.prepare(`SELECT id, nome, inizio, fine, tipo, stato FROM requests WHERE stato = 'Approvata' AND ((inizio BETWEEN ? AND ?) OR (fine BETWEEN ? AND ?) OR (inizio <= ? AND fine >= ?))`).all(start, end, start, end, start, end);
  res.json(events);
});

// STATS
app.get('/api/stats', auth, isManager, (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as c FROM requests').get().c;
  const pending = db.prepare("SELECT COUNT(*) as c FROM requests WHERE stato = 'In attesa'").get().c;
  const approved = db.prepare("SELECT COUNT(*) as c FROM requests WHERE stato = 'Approvata'").get().c;
  const rejected = db.prepare("SELECT COUNT(*) as c FROM requests WHERE stato = 'Rifiutata'").get().c;
  const thisMonth = db.prepare("SELECT COUNT(*) as c FROM requests WHERE stato = 'Approvata' AND inizio LIKE ?").get(`${new Date().toISOString().slice(0, 7)}%`).c;
  res.json({ total, pending, approved, rejected, thisMonth });
});

// USERS (admin)
app.get('/api/users', auth, isAdmin, (req, res) => {
  res.json(db.prepare('SELECT id, username, name, email, role, phone, department, total_days, used_days, created_at FROM users').all());
});

app.post('/api/users', auth, isAdmin, (req, res) => {
  const { username, password, name, email, role, total_days } = req.body;
  if (!username || !password || !name || !email) return res.status(400).json({ error: 'Campi obbligatori mancanti' });
  try {
    const result = db.prepare('INSERT INTO users (username, password, name, email, role, total_days) VALUES (?, ?, ?, ?, ?, ?)').run(username, bcrypt.hashSync(password, 10), name, email, role || 'employee', total_days || 26);
    res.json({ id: result.lastInsertRowid, message: 'Utente creato' });
  } catch { res.status(400).json({ error: 'Username o email già esistente' }); }
});

app.patch('/api/users/:id', auth, isAdmin, (req, res) => {
  const { name, email, role, total_days, used_days, resetPassword } = req.body;
  if (resetPassword) {
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(bcrypt.hashSync(resetPassword, 10), req.params.id);
  }
  db.prepare('UPDATE users SET name = COALESCE(?, name), email = COALESCE(?, email), role = COALESCE(?, role), total_days = COALESCE(?, total_days), used_days = COALESCE(?, used_days) WHERE id = ?').run(name, email, role, total_days, used_days, req.params.id);
  res.json({ message: 'Utente aggiornato' });
});

app.delete('/api/users/:id', auth, isAdmin, (req, res) => {
  if (req.params.id == req.user.id) return res.status(400).json({ error: 'Non puoi eliminare te stesso' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ message: 'Utente eliminato' });
});

// EXPORT
app.get('/api/export', auth, isManager, (req, res) => {
  const { format, from, to, stato } = req.query;
  let sql = 'SELECT r.*, u.name as approved_by_name FROM requests r LEFT JOIN users u ON r.approved_by = u.id WHERE 1=1';
  const params = [];
  if (from) { sql += ' AND r.inizio >= ?'; params.push(from); }
  if (to) { sql += ' AND r.fine <= ?'; params.push(to); }
  if (stato) { sql += ' AND r.stato = ?'; params.push(stato); }
  sql += ' ORDER BY r.inizio DESC';
  const data = db.prepare(sql).all(...params);
  
  if (format === 'csv') {
    const headers = 'ID,Nome,Email,Reparto,Inizio,Fine,Giorni,Tipo,Stato,Approvato da,Data approvazione\n';
    const rows = data.map(r => `${r.id},"${r.nome}","${r.email}","${r.reparto || ''}",${r.inizio},${r.fine},${r.giorni},"${r.tipo}","${r.stato}","${r.approved_by_name || ''}","${r.approved_at || ''}"`).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=ferie-export.csv');
    res.send(headers + rows);
  } else {
    res.json(data);
  }
});

// HTML Routes
['/', '/index.html', '/register.html', '/request.html', '/dashboard.html', '/admin.html', '/profile.html', '/calendar.html'].forEach(route => {
  app.get(route, (req, res) => res.sendFile(path.join(__dirname, 'public', route === '/' ? 'index.html' : route)));
});
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
