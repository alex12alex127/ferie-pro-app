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

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
    tipo TEXT DEFAULT 'Ferie',
    urgenza TEXT DEFAULT 'Normale',
    motivo TEXT,
    telefono TEXT,
    stato TEXT DEFAULT 'In attesa',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// Create default users if not exist
const defaultUsers = [
  { username: 'admin', password: 'admin123', name: 'Amministratore', email: 'admin@azienda.it', role: 'admin' },
  { username: 'manager', password: 'manager123', name: 'Manager', email: 'manager@azienda.it', role: 'manager' },
  { username: 'dipendente', password: 'dip123', name: 'Mario Rossi', email: 'mario.rossi@azienda.it', role: 'employee' },
];

const insertUser = db.prepare('INSERT OR IGNORE INTO users (username, password, name, email, role) VALUES (?, ?, ?, ?, ?)');
defaultUsers.forEach(u => {
  const hash = bcrypt.hashSync(u.password, 10);
  insertUser.run(u.username, hash, u.name, u.email, u.role);
});

// Auth middleware
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token mancante' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token non valido' });
  }
}

function adminMiddleware(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accesso negato' });
  next();
}

function managerMiddleware(req, res, next) {
  if (!['admin', 'manager'].includes(req.user.role)) return res.status(403).json({ error: 'Accesso negato' });
  next();
}

// AUTH ROUTES
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Credenziali non valide' });
  }
  const token = jwt.sign({ id: user.id, username: user.username, name: user.name, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, user: { id: user.id, username: user.username, name: user.name, email: user.email, role: user.role } });
});

app.get('/api/me', authMiddleware, (req, res) => {
  res.json(req.user);
});

// REQUESTS ROUTES
app.get('/api/requests', authMiddleware, (req, res) => {
  let requests;
  if (req.user.role === 'employee') {
    requests = db.prepare('SELECT * FROM requests WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  } else {
    requests = db.prepare('SELECT * FROM requests ORDER BY created_at DESC').all();
  }
  res.json(requests);
});

app.post('/api/requests', authMiddleware, (req, res) => {
  const { nome, email, reparto, ruolo, responsabile, inizio, fine, tipo, urgenza, motivo, telefono } = req.body;
  if (!nome || !email || !inizio || !fine) {
    return res.status(400).json({ error: 'Campi obbligatori mancanti' });
  }
  const stmt = db.prepare('INSERT INTO requests (user_id, nome, email, reparto, ruolo, responsabile, inizio, fine, tipo, urgenza, motivo, telefono) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const result = stmt.run(req.user.id, nome, email, reparto, ruolo, responsabile, inizio, fine, tipo, urgenza, motivo, telefono);
  res.json({ id: result.lastInsertRowid, message: 'Richiesta creata' });
});

app.patch('/api/requests/:id/status', authMiddleware, managerMiddleware, (req, res) => {
  const { stato } = req.body;
  if (!['In attesa', 'Approvata', 'Rifiutata'].includes(stato)) {
    return res.status(400).json({ error: 'Stato non valido' });
  }
  db.prepare('UPDATE requests SET stato = ? WHERE id = ?').run(stato, req.params.id);
  res.json({ message: 'Stato aggiornato' });
});

app.delete('/api/requests/:id', authMiddleware, adminMiddleware, (req, res) => {
  db.prepare('DELETE FROM requests WHERE id = ?').run(req.params.id);
  res.json({ message: 'Richiesta eliminata' });
});

// USERS ROUTES (admin only)
app.get('/api/users', authMiddleware, adminMiddleware, (req, res) => {
  const users = db.prepare('SELECT id, username, name, email, role, created_at FROM users').all();
  res.json(users);
});

app.post('/api/users', authMiddleware, adminMiddleware, (req, res) => {
  const { username, password, name, email, role } = req.body;
  if (!username || !password || !name || !email) {
    return res.status(400).json({ error: 'Campi obbligatori mancanti' });
  }
  try {
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO users (username, password, name, email, role) VALUES (?, ?, ?, ?, ?)').run(username, hash, name, email, role || 'employee');
    res.json({ id: result.lastInsertRowid, message: 'Utente creato' });
  } catch (e) {
    res.status(400).json({ error: 'Username o email già esistente' });
  }
});

app.delete('/api/users/:id', authMiddleware, adminMiddleware, (req, res) => {
  if (req.params.id == req.user.id) {
    return res.status(400).json({ error: 'Non puoi eliminare te stesso' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ message: 'Utente eliminato' });
});

// STATS
app.get('/api/stats', authMiddleware, managerMiddleware, (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as count FROM requests').get().count;
  const pending = db.prepare("SELECT COUNT(*) as count FROM requests WHERE stato = 'In attesa'").get().count;
  const approved = db.prepare("SELECT COUNT(*) as count FROM requests WHERE stato = 'Approvata'").get().count;
  const rejected = db.prepare("SELECT COUNT(*) as count FROM requests WHERE stato = 'Rifiutata'").get().count;
  res.json({ total, pending, approved, rejected });
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
