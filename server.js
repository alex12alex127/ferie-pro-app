const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

// ============================================
// CONFIGURAZIONE VPS (Non modificare)
// ============================================
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'ferie-secret-key-change-in-production';

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// DATABASE SETUP
// ============================================
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'ferie.db'));

// Inizializza tabelle
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT DEFAULT 'employee',
    total_days INTEGER DEFAULT 26,
    used_days INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT DEFAULT 'Ferie',
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    days INTEGER DEFAULT 1,
    reason TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// Crea admin di default se non esiste
const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!adminExists) {
  db.prepare('INSERT INTO users (username, password, name, email, role) VALUES (?, ?, ?, ?, ?)')
    .run('admin', bcrypt.hashSync('admin123', 10), 'Amministratore', 'admin@azienda.it', 'admin');
  console.log('Admin creato: admin / admin123');
}

// ============================================
// HELPERS
// ============================================
function calcWorkDays(start, end) {
  let count = 0;
  let current = new Date(start);
  const finish = new Date(end);
  while (current <= finish) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) count++;
    current.setDate(current.getDate() + 1);
  }
  return count || 1;
}

// ============================================
// AUTH MIDDLEWARE
// ============================================
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token mancante' });
  
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token non valido' });
  }
}

function isAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Accesso negato' });
  }
  next();
}

// ============================================
// API ROUTES
// ============================================

// --- AUTH ---
app.post('/api/login', (req, res) => {
  try {
    const { username, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Credenziali non valide' });
    }
    
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (e) {
    res.status(500).json({ error: 'Errore server' });
  }
});

app.post('/api/register', (req, res) => {
  try {
    const { username, password, name, email } = req.body;
    
    if (!username || !password || !name || !email) {
      return res.status(400).json({ error: 'Tutti i campi sono obbligatori' });
    }
    
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO users (username, password, name, email) VALUES (?, ?, ?, ?)')
      .run(username, hash, name, email);
    
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (e) {
    res.status(400).json({ error: 'Username o email già in uso' });
  }
});

// --- PROFILE ---
app.get('/api/profile', auth, (req, res) => {
  const user = db.prepare('SELECT id, username, name, email, role, total_days, used_days FROM users WHERE id = ?')
    .get(req.user.id);
  res.json(user);
});

// --- REQUESTS ---
app.get('/api/requests', auth, (req, res) => {
  let requests;
  if (req.user.role === 'admin') {
    requests = db.prepare(`
      SELECT r.*, u.name as user_name 
      FROM requests r 
      JOIN users u ON r.user_id = u.id 
      ORDER BY r.created_at DESC
    `).all();
  } else {
    requests = db.prepare('SELECT * FROM requests WHERE user_id = ? ORDER BY created_at DESC')
      .all(req.user.id);
  }
  res.json(requests);
});

app.post('/api/requests', auth, (req, res) => {
  try {
    const { type, start_date, end_date, reason } = req.body;
    const days = calcWorkDays(start_date, end_date);
    
    db.prepare('INSERT INTO requests (user_id, type, start_date, end_date, days, reason) VALUES (?, ?, ?, ?, ?, ?)')
      .run(req.user.id, type || 'Ferie', start_date, end_date, days, reason || '');
    
    res.json({ message: 'Richiesta inviata' });
  } catch (e) {
    res.status(500).json({ error: 'Errore creazione richiesta' });
  }
});

app.patch('/api/requests/:id', auth, isAdmin, (req, res) => {
  try {
    const { status } = req.body;
    const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);
    
    if (!request) {
      return res.status(404).json({ error: 'Richiesta non trovata' });
    }
    
    db.prepare('UPDATE requests SET status = ? WHERE id = ?').run(status, req.params.id);
    
    // Aggiorna giorni usati se approvata
    if (status === 'approved' && request.type === 'Ferie') {
      db.prepare('UPDATE users SET used_days = used_days + ? WHERE id = ?')
        .run(request.days, request.user_id);
    }
    
    res.json({ message: 'Stato aggiornato' });
  } catch (e) {
    res.status(500).json({ error: 'Errore aggiornamento' });
  }
});

app.delete('/api/requests/:id', auth, isAdmin, (req, res) => {
  db.prepare('DELETE FROM requests WHERE id = ?').run(req.params.id);
  res.json({ message: 'Richiesta eliminata' });
});

// --- USERS (Admin only) ---
app.get('/api/users', auth, isAdmin, (req, res) => {
  const users = db.prepare('SELECT id, username, name, email, role, total_days, used_days FROM users ORDER BY name')
    .all();
  res.json(users);
});

app.delete('/api/users/:id', auth, isAdmin, (req, res) => {
  if (req.params.id == req.user.id) {
    return res.status(400).json({ error: 'Non puoi eliminare te stesso' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ message: 'Utente eliminato' });
});

// --- STATS ---
app.get('/api/stats', auth, (req, res) => {
  const userId = req.user.role === 'admin' ? null : req.user.id;
  const where = userId ? 'WHERE user_id = ?' : '';
  
  const total = db.prepare(`SELECT COUNT(*) as count FROM requests ${where}`).get(userId)?.count || 0;
  const pending = db.prepare(`SELECT COUNT(*) as count FROM requests ${where} ${where ? 'AND' : 'WHERE'} status = 'pending'`).get(userId)?.count || 0;
  const approved = db.prepare(`SELECT COUNT(*) as count FROM requests ${where} ${where ? 'AND' : 'WHERE'} status = 'approved'`).get(userId)?.count || 0;
  
  res.json({ total, pending, approved });
});

// ============================================
// SERVE FRONTEND
// ============================================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log(`Server avviato su http://localhost:${PORT}`);
});
