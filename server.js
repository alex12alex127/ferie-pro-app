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
// DATABASE SETUP COMPLETO
// ============================================
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'ferie.db'));

// Abilita foreign keys e WAL mode per performance
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// ============================================
// SCHEMA DATABASE COMPLETO
// ============================================
db.exec(`
  -- Tabella Utenti
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT DEFAULT 'employee' CHECK(role IN ('admin', 'manager', 'employee')),
    phone TEXT,
    department TEXT,
    total_days INTEGER DEFAULT 26,
    used_days INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Tabella Richieste
  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT DEFAULT 'Ferie' CHECK(type IN ('Ferie', 'Permesso', 'Malattia')),
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    days INTEGER NOT NULL,
    reason TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
    approved_by INTEGER,
    approved_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (approved_by) REFERENCES users(id)
  );

  -- Tabella Log Giorni (per tracciare modifiche ai giorni ferie)
  CREATE TABLE IF NOT EXISTS days_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    request_id INTEGER,
    action TEXT NOT NULL CHECK(action IN ('add', 'subtract', 'reset', 'adjust')),
    days_changed INTEGER NOT NULL,
    old_value INTEGER NOT NULL,
    new_value INTEGER NOT NULL,
    reason TEXT,
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  -- Tabella Notifiche
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info' CHECK(type IN ('info', 'success', 'warning', 'error')),
    read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Tabella Festività
  CREATE TABLE IF NOT EXISTS holidays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    date TEXT NOT NULL UNIQUE,
    type TEXT DEFAULT 'national' CHECK(type IN ('national', 'company')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Indici per performance
  CREATE INDEX IF NOT EXISTS idx_requests_user_id ON requests(user_id);
  CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
  CREATE INDEX IF NOT EXISTS idx_requests_dates ON requests(start_date, end_date);
  CREATE INDEX IF NOT EXISTS idx_days_log_user_id ON days_log(user_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
`);

// ============================================
// INIZIALIZZAZIONE DATI
// ============================================
function initializeData() {
  // Crea admin di default
  const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!adminExists) {
    db.prepare('INSERT INTO users (username, password, name, email, role, total_days) VALUES (?, ?, ?, ?, ?, ?)')
      .run('admin', bcrypt.hashSync('admin123', 10), 'Amministratore', 'admin@azienda.it', 'admin', 26);
    console.log('✓ Admin creato: admin / admin123');
  }

  // Crea dipendente demo
  const employeeExists = db.prepare('SELECT id FROM users WHERE username = ?').get('mario.rossi');
  if (!employeeExists) {
    db.prepare('INSERT INTO users (username, password, name, email, role, department, total_days, used_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run('mario.rossi', bcrypt.hashSync('demo123', 10), 'Mario Rossi', 'mario.rossi@azienda.it', 'employee', 'IT', 26, 5);
    console.log('✓ Dipendente demo creato: mario.rossi / demo123');
  }

  // Aggiungi festività italiane 2026
  const holidaysCount = db.prepare('SELECT COUNT(*) as count FROM holidays').get().count;
  if (holidaysCount === 0) {
    const holidays = [
      ['Capodanno', '2026-01-01', 'national'],
      ['Epifania', '2026-01-06', 'national'],
      ['Pasqua', '2026-04-05', 'national'],
      ['Lunedì dell\'Angelo', '2026-04-06', 'national'],
      ['Festa della Liberazione', '2026-04-25', 'national'],
      ['Festa del Lavoro', '2026-05-01', 'national'],
      ['Festa della Repubblica', '2026-06-02', 'national'],
      ['Ferragosto', '2026-08-15', 'national'],
      ['Tutti i Santi', '2026-11-01', 'national'],
      ['Immacolata Concezione', '2026-12-08', 'national'],
      ['Natale', '2026-12-25', 'national'],
      ['Santo Stefano', '2026-12-26', 'national']
    ];
    
    const insertHoliday = db.prepare('INSERT INTO holidays (name, date, type) VALUES (?, ?, ?)');
    holidays.forEach(h => insertHoliday.run(...h));
    console.log('✓ Festività 2026 caricate');
  }
}

initializeData();

// ============================================
// HELPERS
// ============================================

// Calcola giorni lavorativi escludendo weekend e festività
function calcWorkDays(start, end) {
  let count = 0;
  let current = new Date(start);
  const finish = new Date(end);
  
  // Ottieni tutte le festività
  const holidays = db.prepare('SELECT date FROM holidays').all().map(h => h.date);
  
  while (current <= finish) {
    const day = current.getDay();
    const dateStr = current.toISOString().split('T')[0];
    
    // Escludi weekend (0=domenica, 6=sabato) e festività
    if (day !== 0 && day !== 6 && !holidays.includes(dateStr)) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  
  return count || 1;
}

// Crea notifica
function createNotification(userId, title, message, type = 'info') {
  try {
    db.prepare('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)')
      .run(userId, title, message, type);
  } catch (e) {
    console.error('Errore creazione notifica:', e);
  }
}

// Log modifica giorni
function logDaysChange(userId, action, daysChanged, oldValue, newValue, reason, createdBy, requestId = null) {
  try {
    db.prepare('INSERT INTO days_log (user_id, request_id, action, days_changed, old_value, new_value, reason, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(userId, requestId, action, daysChanged, oldValue, newValue, reason, createdBy);
  } catch (e) {
    console.error('Errore log giorni:', e);
  }
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

function isManagerOrAdmin(req, res, next) {
  if (!['admin', 'manager'].includes(req.user.role)) {
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
    const { username, password, name, email, phone, department } = req.body;
    
    if (!username || !password || !name || !email) {
      return res.status(400).json({ error: 'Tutti i campi obbligatori devono essere compilati' });
    }
    
    // Validate username
    if (username.length < 3) {
      return res.status(400).json({ error: 'Username deve essere almeno 3 caratteri' });
    }
    
    if (!/^[a-zA-Z0-9._]+$/.test(username)) {
      return res.status(400).json({ error: 'Username può contenere solo lettere, numeri, punto e underscore' });
    }
    
    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Email non valida' });
    }
    
    // Validate password
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password deve essere almeno 6 caratteri' });
    }
    
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO users (username, password, name, email, phone, department) VALUES (?, ?, ?, ?, ?, ?)')
      .run(username, hash, name, email, phone || null, department || null);
    
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    // Crea notifica di benvenuto
    createNotification(
      user.id,
      'Benvenuto in Ferie Pro!',
      'Il tuo account è stato creato con successo. Hai 26 giorni di ferie disponibili.',
      'success'
    );
    
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (e) {
    if (e.message.includes('UNIQUE constraint failed: users.username')) {
      return res.status(400).json({ error: 'Username già in uso' });
    }
    if (e.message.includes('UNIQUE constraint failed: users.email')) {
      return res.status(400).json({ error: 'Email già in uso' });
    }
    res.status(400).json({ error: 'Errore durante la registrazione' });
  }
});

// --- PROFILE ---
app.get('/api/profile', auth, (req, res) => {
  const user = db.prepare('SELECT id, username, name, email, role, phone, department, total_days, used_days, created_at FROM users WHERE id = ?')
    .get(req.user.id);
  res.json(user);
});

app.patch('/api/profile', auth, (req, res) => {
  try {
    const { name, email, phone, department } = req.body;
    
    db.prepare('UPDATE users SET name = COALESCE(?, name), email = COALESCE(?, email), phone = COALESCE(?, phone), department = COALESCE(?, department), updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(name, email, phone, department, req.user.id);
    
    res.json({ message: 'Profilo aggiornato' });
  } catch (e) {
    res.status(400).json({ error: 'Errore aggiornamento profilo' });
  }
});

// --- REQUESTS ---
app.get('/api/requests', auth, (req, res) => {
  let requests;
  if (req.user.role === 'admin') {
    requests = db.prepare(`
      SELECT r.*, u.name as user_name, a.name as approved_by_name
      FROM requests r 
      JOIN users u ON r.user_id = u.id 
      LEFT JOIN users a ON r.approved_by = a.id
      ORDER BY r.created_at DESC
    `).all();
  } else {
    requests = db.prepare(`
      SELECT r.*, a.name as approved_by_name
      FROM requests r
      LEFT JOIN users a ON r.approved_by = a.id
      WHERE r.user_id = ? 
      ORDER BY r.created_at DESC
    `).all(req.user.id);
  }
  res.json(requests);
});

app.post('/api/requests', auth, (req, res) => {
  try {
    const { type, start_date, end_date, reason } = req.body;
    
    console.log('📝 Nuova richiesta:', { type, start_date, end_date, user: req.user.username });
    
    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'Date mancanti' });
    }
    
    // Validate date format
    const startDate = new Date(start_date);
    const endDate = new Date(end_date);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ error: 'Formato date non valido' });
    }
    
    if (endDate < startDate) {
      return res.status(400).json({ error: 'La data di fine non può essere precedente alla data di inizio' });
    }
    
    const days = calcWorkDays(start_date, end_date);
    
    console.log('📊 Giorni calcolati:', days);
    
    // Verifica disponibilità giorni per ferie
    if (type === 'Ferie') {
      const user = db.prepare('SELECT total_days, used_days FROM users WHERE id = ?').get(req.user.id);
      const available = user.total_days - user.used_days;
      
      console.log('💼 Giorni disponibili:', available, 'Richiesti:', days);
      
      if (days > available) {
        return res.status(400).json({ error: `Giorni insufficienti. Disponibili: ${available}, Richiesti: ${days}` });
      }
    }
    
    const result = db.prepare('INSERT INTO requests (user_id, type, start_date, end_date, days, reason) VALUES (?, ?, ?, ?, ?, ?)')
      .run(req.user.id, type || 'Ferie', start_date, end_date, days, reason || '');
    
    console.log('✅ Richiesta creata con ID:', result.lastInsertRowid);
    
    // Notifica admin
    try {
      const admins = db.prepare('SELECT id FROM users WHERE role = ?').all('admin');
      admins.forEach(admin => {
        createNotification(admin.id, 'Nuova Richiesta', `Nuova richiesta di ${type || 'Ferie'} da approvare`, 'info');
      });
    } catch (notifError) {
      console.error('⚠️ Errore invio notifiche admin:', notifError);
      // Non bloccare la richiesta se le notifiche falliscono
    }
    
    res.json({ message: 'Richiesta inviata', days });
  } catch (e) {
    console.error('❌ Errore creazione richiesta:', e);
    res.status(500).json({ error: 'Errore creazione richiesta: ' + e.message });
  }
});

app.patch('/api/requests/:id', auth, isManagerOrAdmin, (req, res) => {
  const transaction = db.transaction((requestId, newStatus, adminId) => {
    const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId);
    
    if (!request) {
      throw new Error('Richiesta non trovata');
    }

    const oldStatus = request.status;
    
    // Aggiorna stato richiesta
    db.prepare('UPDATE requests SET status = ?, approved_by = ?, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(newStatus, adminId, requestId);
    
    // Gestione giorni ferie
    if (request.type === 'Ferie') {
      const user = db.prepare('SELECT total_days, used_days FROM users WHERE id = ?').get(request.user_id);
      
      // Se passa da pending ad approved: scala giorni
      if (oldStatus === 'pending' && newStatus === 'approved') {
        const newUsedDays = user.used_days + request.days;
        db.prepare('UPDATE users SET used_days = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(newUsedDays, request.user_id);
        
        logDaysChange(
          request.user_id,
          'subtract',
          request.days,
          user.used_days,
          newUsedDays,
          `Richiesta #${requestId} approvata`,
          adminId,
          requestId
        );
        
        createNotification(request.user_id, 'Richiesta Approvata', `La tua richiesta di ${request.type} è stata approvata`, 'success');
      }
      
      // Se passa da approved a rejected/pending: restituisci giorni
      if (oldStatus === 'approved' && newStatus !== 'approved') {
        const newUsedDays = Math.max(0, user.used_days - request.days);
        db.prepare('UPDATE users SET used_days = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(newUsedDays, request.user_id);
        
        logDaysChange(
          request.user_id,
          'add',
          request.days,
          user.used_days,
          newUsedDays,
          `Richiesta #${requestId} modificata da approved a ${newStatus}`,
          adminId,
          requestId
        );
      }
    }
    
    // Notifica utente
    if (newStatus === 'rejected') {
      createNotification(request.user_id, 'Richiesta Rifiutata', `La tua richiesta di ${request.type} è stata rifiutata`, 'error');
    }
  });
  
  try {
    const { status } = req.body;
    transaction(req.params.id, status, req.user.id);
    res.json({ message: 'Stato aggiornato con successo' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Errore aggiornamento' });
  }
});

app.delete('/api/requests/:id', auth, isAdmin, (req, res) => {
  const transaction = db.transaction((requestId) => {
    const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId);
    
    if (!request) {
      throw new Error('Richiesta non trovata');
    }
    
    // Se era approvata, restituisci i giorni
    if (request.status === 'approved' && request.type === 'Ferie') {
      const user = db.prepare('SELECT used_days FROM users WHERE id = ?').get(request.user_id);
      const newUsedDays = Math.max(0, user.used_days - request.days);
      
      db.prepare('UPDATE users SET used_days = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(newUsedDays, request.user_id);
      
      logDaysChange(
        request.user_id,
        'add',
        request.days,
        user.used_days,
        newUsedDays,
        `Richiesta #${requestId} eliminata`,
        req.user.id,
        null
      );
    }
    
    db.prepare('DELETE FROM requests WHERE id = ?').run(requestId);
  });
  
  try {
    transaction(req.params.id);
    res.json({ message: 'Richiesta eliminata' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- USERS (Admin only) ---
app.get('/api/users', auth, isAdmin, (req, res) => {
  const users = db.prepare('SELECT id, username, name, email, role, phone, department, total_days, used_days, created_at FROM users ORDER BY name')
    .all();
  res.json(users);
});

app.post('/api/users', auth, isAdmin, (req, res) => {
  try {
    const { username, password, name, email, role, total_days } = req.body;
    
    const hash = bcrypt.hashSync(password || 'password123', 10);
    db.prepare('INSERT INTO users (username, password, name, email, role, total_days) VALUES (?, ?, ?, ?, ?, ?)')
      .run(username, hash, name, email, role || 'employee', total_days || 26);
    
    res.json({ message: 'Utente creato' });
  } catch (e) {
    res.status(400).json({ error: 'Errore creazione utente' });
  }
});

app.patch('/api/users/:id', auth, isAdmin, (req, res) => {
  try {
    const { total_days, used_days } = req.body;
    const user = db.prepare('SELECT total_days, used_days FROM users WHERE id = ?').get(req.params.id);
    
    if (!user) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }
    
    db.prepare('UPDATE users SET total_days = COALESCE(?, total_days), used_days = COALESCE(?, used_days), updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(total_days, used_days, req.params.id);
    
    // Log modifica
    if (total_days !== undefined && total_days !== user.total_days) {
      logDaysChange(req.params.id, 'adjust', total_days - user.total_days, user.total_days, total_days, 'Modifica manuale admin', req.user.id);
    }
    
    res.json({ message: 'Utente aggiornato' });
  } catch (e) {
    res.status(400).json({ error: 'Errore aggiornamento utente' });
  }
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

// --- NOTIFICATIONS ---
app.get('/api/notifications', auth, (req, res) => {
  const notifications = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
    .all(req.user.id);
  res.json(notifications);
});

app.patch('/api/notifications/:id/read', auth, (req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  res.json({ message: 'Notifica letta' });
});

// --- DAYS LOG (Admin) ---
app.get('/api/days-log/:userId', auth, isAdmin, (req, res) => {
  const logs = db.prepare(`
    SELECT dl.*, u.name as created_by_name 
    FROM days_log dl
    JOIN users u ON dl.created_by = u.id
    WHERE dl.user_id = ?
    ORDER BY dl.created_at DESC
    LIMIT 100
  `).all(req.params.userId);
  res.json(logs);
});

// --- HOLIDAYS ---
app.get('/api/holidays', (req, res) => {
  const holidays = db.prepare('SELECT * FROM holidays ORDER BY date').all();
  res.json(holidays);
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
  console.log(`
╔════════════════════════════════════════╗
║   🚀 Ferie Pro Server                  ║
║   📍 http://localhost:${PORT}            ║
║   ✓ Database inizializzato            ║
║   ✓ Transazioni abilitate             ║
╚════════════════════════════════════════╝
  `);
});
