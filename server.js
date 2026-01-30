const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

// CONFIGURAZIONE CRITICA PER VPS (Non modificare)
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'ferie-secret-key-change-in-production';

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Aumentato limite per upload immagini
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], index: 'index.html' }));

// Inizializzazione Database
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'ferie.db')); // Rimosso verbose per alleggerire i log in produzione

// Funzione Helper per inizializzare le tabelle
function initDb() {
  const schema = `
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
      sede_id INTEGER DEFAULT NULL,
      avatar TEXT DEFAULT NULL,
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
      codice_malattia TEXT DEFAULT NULL,
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
    CREATE TABLE IF NOT EXISTS dpi_catalogo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      categoria TEXT NOT NULL,
      descrizione TEXT,
      taglia_disponibili TEXT,
      codice_barre TEXT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS dpi_assegnazioni (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      dpi_id INTEGER NOT NULL,
      taglia TEXT,
      quantita INTEGER DEFAULT 1,
      data_consegna DATE NOT NULL,
      data_scadenza DATE,
      note TEXT,
      stato TEXT DEFAULT 'attivo',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (dpi_id) REFERENCES dpi_catalogo(id)
    );
  `;
  db.exec(schema);

  // Dati di default
  try {
    const dpiCount = db.prepare('SELECT COUNT(*) as c FROM dpi_catalogo').get();
    if (dpiCount.c === 0) {
      const defaultDpi = [
        ['Casco protettivo', 'Protezione testa', 'Casco di sicurezza EN 397', 'Unica'],
        ['Guanti da lavoro', 'Protezione mani', 'Guanti antitaglio', 'S,M,L,XL'],
        ['Scarpe antinfortunistiche', 'Protezione piedi', 'Scarpe S3', '38-46']
      ];
      const insertDpi = db.prepare('INSERT INTO dpi_catalogo (nome, categoria, descrizione, taglia_disponibili) VALUES (?, ?, ?, ?)');
      defaultDpi.forEach(d => insertDpi.run(...d));
    }

    const sediCount = db.prepare('SELECT COUNT(*) as c FROM sedi').get();
    if (sediCount.c === 0) {
      ['Ferrara', 'Ravenna'].forEach(s => db.prepare('INSERT INTO sedi (nome) VALUES (?)').run(s));
    }

    const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get();
    if (userCount.c === 0) {
      const defaultUsers = [
        { u: 'admin', p: 'admin123', n: 'Amministratore', e: 'admin@azienda.it', r: 'admin' },
        { u: 'manager', p: 'manager123', n: 'Responsabile', e: 'manager@azienda.it', r: 'manager' },
        { u: 'tecnico', p: 'tec123', n: 'Mario Rossi', e: 'mario@azienda.it', r: 'employee' },
      ];
      const insertUser = db.prepare('INSERT INTO users (username, password, name, email, role) VALUES (?, ?, ?, ?, ?)');
      defaultUsers.forEach(user => insertUser.run(user.u, bcrypt.hashSync(user.p, 10), user.n, user.e, user.r));
      console.log('Database inizializzato con utenti di default.');
    }
  } catch (err) {
    console.error("Errore inizializzazione dati:", err.message);
  }
}

// Avvio Inizializzazione DB
initDb();

// --- Helpers ---
const notify = (userId, message) => {
  try { db.prepare('INSERT INTO notifications (user_id, message) VALUES (?, ?)').run(userId, message); } 
  catch (e) { console.error('Notify Error:', e); }
};

const calcDays = (start, end) => {
  let count = 0, cur = new Date(start);
  const finish = new Date(end);
  while (cur <= finish) { if (cur.getDay() % 6 !== 0) count++; cur.setDate(cur.getDate() + 1); }
  return count || 1;
};

// --- Auth Middleware ---
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token mancante' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Token non valido o scaduto' }); }
};
const isAdmin = (req, res, next) => req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Accesso negato' });
const isManager = (req, res, next) => ['admin', 'manager'].includes(req.user.role) ? next() : res.status(403).json({ error: 'Accesso negato' });

// --- ROUTES ---

// Auth
app.post('/api/login', (req, res) => {
  try {
    const { username, password } = req.body;
    const user = db.prepare('SELECT u.*, s.nome as sede_nome FROM users u LEFT JOIN sedi s ON u.sede_id = s.id WHERE u.username = ?').get(username);
    if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Credenziali non valide' });
    
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role, sede_id: user.sede_id }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, sede_nome: user.sede_nome, avatar: user.avatar } });
  } catch (e) { res.status(500).json({ error: 'Errore server' }); }
});

app.post('/api/register', (req, res) => {
  try {
    const { username, password, name, email, sede_id } = req.body;
    if (!username || !password || !name || !sede_id) return res.status(400).json({ error: 'Dati incompleti' });
    
    const result = db.prepare('INSERT INTO users (username, password, name, email, role, sede_id) VALUES (?, ?, ?, ?, ?, ?)').run(username, bcrypt.hashSync(password, 10), name, email, 'employee', sede_id);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role, sede_id: user.sede_id }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ token, user: { id: user.id, name: user.name, role: user.role } });
  } catch (e) { res.status(400).json({ error: 'Username o email già in uso' }); }
});

// Profile
app.get('/api/profile', auth, (req, res) => {
  const user = db.prepare('SELECT u.id, u.username, u.name, u.email, u.role, u.phone, u.department, u.total_days, u.used_days, u.sede_id, u.avatar, s.nome as sede_nome FROM users u LEFT JOIN sedi s ON u.sede_id = s.id WHERE u.id = ?').get(req.user.id);
  res.json(user);
});

app.patch('/api/profile', auth, (req, res) => {
  const { name, phone, department, avatar } = req.body;
  if (avatar) db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(avatar, req.user.id);
  db.prepare('UPDATE users SET name=COALESCE(?,name), phone=COALESCE(?,phone), department=COALESCE(?,department) WHERE id=?').run(name, phone, department, req.user.id);
  res.json({ message: 'Profilo aggiornato' });
});

app.post('/api/change-password', auth, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const user = db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(oldPassword, user.password)) return res.status(400).json({ error: 'Password attuale errata' });
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 10), req.user.id);
  res.json({ message: 'Password modificata' });
});

// Requests
app.get('/api/requests', auth, (req, res) => {
  const sql = req.user.role === 'employee' 
    ? 'SELECT * FROM requests WHERE user_id = ? ORDER BY created_at DESC' 
    : 'SELECT * FROM requests ORDER BY created_at DESC';
  res.json(db.prepare(sql).all(req.user.role === 'employee' ? req.user.id : undefined));
});

app.post('/api/requests', auth, (req, res) => {
  const { nome, email, inizio, fine, tipo, urgenza, motivo, codice_malattia } = req.body;
  const giorni = calcDays(inizio, fine);
  db.prepare('INSERT INTO requests (user_id, nome, email, inizio, fine, giorni, tipo, urgenza, motivo, codice_malattia) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(req.user.id, nome, email, inizio, fine, giorni, tipo, urgenza, motivo, codice_malattia || null);
  res.json({ message: 'Richiesta inviata' });
});

app.patch('/api/requests/:id/status', auth, isManager, (req, res) => {
  const { stato } = req.body;
  const r = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Richiesta non trovata' });
  
  db.prepare('UPDATE requests SET stato=?, approved_by=?, approved_at=? WHERE id=?').run(stato, req.user.id, new Date().toISOString(), req.params.id);
  if (stato === 'Approvata' && r.tipo === 'Ferie') {
    db.prepare('UPDATE users SET used_days = used_days + ? WHERE id = ?').run(r.giorni, r.user_id);
  }
  notify(r.user_id, `La tua richiesta per ${r.inizio} è stata: ${stato}`);
  res.json({ message: 'Stato aggiornato' });
});

app.delete('/api/requests/:id', auth, isAdmin, (req, res) => {
  db.prepare('DELETE FROM requests WHERE id = ?').run(req.params.id);
  res.json({ message: 'Eliminata' });
});

// Stats & Dashboard Data
app.get('/api/stats', auth, isManager, (req, res) => {
  res.json({
    total: db.prepare('SELECT COUNT(*) as c FROM requests').get().c,
    pending: db.prepare("SELECT COUNT(*) as c FROM requests WHERE stato = 'In attesa'").get().c,
    approved: db.prepare("SELECT COUNT(*) as c FROM requests WHERE stato = 'Approvata'").get().c,
    rejected: db.prepare("SELECT COUNT(*) as c FROM requests WHERE stato = 'Rifiutata'").get().c,
    thisMonth: db.prepare("SELECT COUNT(*) as c FROM requests WHERE stato = 'Approvata' AND inizio LIKE ?").get(`${new Date().toISOString().slice(0, 7)}%`).c
  });
});

app.get('/api/avvisi', auth, (req, res) => res.json(db.prepare('SELECT * FROM avvisi WHERE attivo = 1 ORDER BY created_at DESC').all()));
app.post('/api/avvisi', auth, isManager, (req, res) => {
  const { titolo, messaggio, priorita } = req.body;
  db.prepare('INSERT INTO avvisi (titolo, messaggio, priorita) VALUES (?,?,?)').run(titolo, messaggio, priorita || 'Normale');
  res.json({ message: 'Avviso pubblicato' });
});
app.delete('/api/avvisi/:id', auth, isManager, (req, res) => {
  db.prepare('UPDATE avvisi SET attivo = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Avviso rimosso' });
});

// Users & Sedi
app.get('/api/sedi', (req, res) => res.json(db.prepare('SELECT * FROM sedi WHERE attiva = 1 ORDER BY nome').all()));
app.post('/api/sedi', auth, isAdmin, (req, res) => {
  try { db.prepare('INSERT INTO sedi (nome, indirizzo) VALUES (?,?)').run(req.body.nome, req.body.indirizzo || ''); res.json({ message: 'Sede creata' }); }
  catch { res.status(400).json({ error: 'Sede già esistente' }); }
});
app.delete('/api/sedi/:id', auth, isAdmin, (req, res) => {
  if (db.prepare('SELECT COUNT(*) as c FROM users WHERE sede_id = ?').get(req.params.id).c > 0) return res.status(400).json({ error: 'Sede in uso' });
  db.prepare('UPDATE sedi SET attiva = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Sede eliminata' });
});

app.get('/api/users', auth, (req, res) => {
  const sql = ['admin', 'manager'].includes(req.user.role) 
    ? 'SELECT u.id, u.username, u.name, u.email, u.role, u.total_days, u.used_days, u.sede_id, s.nome as sede_nome FROM users u LEFT JOIN sedi s ON u.sede_id = s.id ORDER BY s.nome, u.name'
    : 'SELECT u.id, u.username, u.name, u.email, u.role, u.total_days, u.used_days, u.sede_id, s.nome as sede_nome FROM users u LEFT JOIN sedi s ON u.sede_id = s.id WHERE u.sede_id = ? ORDER BY u.name';
  res.json(db.prepare(sql).all(req.user.role === 'employee' ? req.user.sede_id : undefined));
});

app.post('/api/users', auth, isAdmin, (req, res) => {
  try {
    const { username, password, name, email, role, total_days, sede_id } = req.body;
    db.prepare('INSERT INTO users (username, password, name, email, role, total_days, sede_id) VALUES (?,?,?,?,?,?,?)')
      .run(username, bcrypt.hashSync(password, 10), name, email, role || 'employee', total_days || 26, sede_id);
    res.json({ message: 'Utente creato' });
  } catch { res.status(400).json({ error: 'Errore creazione utente' }); }
});

app.delete('/api/users/:id', auth, isAdmin, (req, res) => {
  if (req.params.id == req.user.id) return res.status(400).json({ error: 'Non eliminare te stesso' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ message: 'Utente eliminato' });
});

// Cantieri
app.get('/api/cantieri', auth, (req, res) => {
  const cantieri = db.prepare('SELECT * FROM cantieri ORDER BY created_at DESC').all();
  cantieri.forEach(c => c.tecnici = db.prepare('SELECT u.id, u.name FROM cantieri_assegnazioni ca JOIN users u ON ca.user_id = u.id WHERE ca.cantiere_id = ?').all(c.id));
  res.json(cantieri);
});
app.post('/api/cantieri', auth, isManager, (req, res) => {
  const { nome, cliente, indirizzo, data_inizio, data_fine, note } = req.body;
  const r = db.prepare('INSERT INTO cantieri (nome, cliente, indirizzo, data_inizio, data_fine, note) VALUES (?,?,?,?,?,?)').run(nome, cliente, indirizzo, data_inizio, data_fine, note);
  res.json({ id: r.lastInsertRowid, message: 'Cantiere creato' });
});
app.patch('/api/cantieri/:id', auth, isManager, (req, res) => {
  const { nome, cliente, indirizzo, stato, data_inizio, data_fine, note } = req.body;
  db.prepare('UPDATE cantieri SET nome=COALESCE(?,nome), cliente=COALESCE(?,cliente), indirizzo=COALESCE(?,indirizzo), stato=COALESCE(?,stato), data_inizio=COALESCE(?,data_inizio), data_fine=COALESCE(?,data_fine), note=COALESCE(?,note) WHERE id=?').run(nome, cliente, indirizzo, stato, data_inizio, data_fine, note, req.params.id);
  res.json({ message: 'Cantiere aggiornato' });
});
app.post('/api/cantieri/:id/assegna', auth, isManager, (req, res) => {
  try { db.prepare('INSERT INTO cantieri_assegnazioni (cantiere_id, user_id) VALUES (?,?)').run(req.params.id, req.body.user_id); res.json({ message: 'Tecnico assegnato' }); } 
  catch { res.status(400).json({ error: 'Già assegnato' }); }
});
app.delete('/api/cantieri/:id/assegna/:userId', auth, isManager, (req, res) => {
  db.prepare('DELETE FROM cantieri_assegnazioni WHERE cantiere_id = ? AND user_id = ?').run(req.params.id, req.params.userId);
  res.json({ message: 'Assegnazione rimossa' });
});

// DPI
app.get('/api/dpi/catalogo', auth, (req, res) => res.json(db.prepare('SELECT * FROM dpi_catalogo ORDER BY categoria, nome').all()));
app.get('/api/dpi/assegnazioni', auth, (req, res) => {
  const sql = req.user.role === 'employee' 
    ? `SELECT a.*, d.nome as dpi_nome, d.categoria, u.name as dipendente_nome FROM dpi_assegnazioni a JOIN dpi_catalogo d ON a.dpi_id = d.id JOIN users u ON a.user_id = u.id WHERE a.user_id = ? ORDER BY a.data_consegna DESC`
    : `SELECT a.*, d.nome as dpi_nome, d.categoria, u.name as dipendente_nome FROM dpi_assegnazioni a JOIN dpi_catalogo d ON a.dpi_id = d.id JOIN users u ON a.user_id = u.id ORDER BY a.data_consegna DESC`;
  res.json(db.prepare(sql).all(req.user.role === 'employee' ? req.user.id : undefined));
});

// Calendar
app.get('/api/calendar', auth, (req, res) => {
  const { month, year } = req.query;
  const start = `${year}-${String(month).padStart(2, '0')}-01`, end = `${year}-${String(month).padStart(2, '0')}-31`;
  const sql = ['admin', 'manager'].includes(req.user.role)
    ? `SELECT r.id, r.nome, r.inizio, r.fine, r.tipo FROM requests r WHERE r.stato = 'Approvata' AND ((r.inizio BETWEEN ? AND ?) OR (r.fine BETWEEN ? AND ?))`
    : `SELECT r.id, r.nome, r.inizio, r.fine, r.tipo FROM requests r JOIN users u ON r.user_id = u.id WHERE r.stato = 'Approvata' AND u.sede_id = ? AND ((r.inizio BETWEEN ? AND ?) OR (r.fine BETWEEN ? AND ?))`;
  res.json(db.prepare(sql).all(req.user.role === 'employee' ? req.user.sede_id : start, start, end, start, end));
});

app.get('/api/calendar/day', auth, (req, res) => {
  const { date } = req.query;
  const sql = ['admin', 'manager'].includes(req.user.role)
    ? `SELECT r.*, u.name as dipendente_nome FROM requests r JOIN users u ON r.user_id = u.id WHERE r.stato = 'Approvata' AND ? BETWEEN r.inizio AND r.fine`
    : `SELECT r.*, u.name as dipendente_nome FROM requests r JOIN users u ON r.user_id = u.id WHERE r.stato = 'Approvata' AND ? BETWEEN r.inizio AND r.fine AND u.sede_id = ?`;
  res.json(db.prepare(sql).all(date, req.user.role === 'employee' ? req.user.sede_id : undefined));
});

// Settings & Logo
app.post('/api/settings/logo', auth, isAdmin, (req, res) => {
  try {
    const { imageData } = req.body;
    if (!imageData) return res.status(400).json({ error: 'Nessuna immagine' });
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(path.join(__dirname, 'public', 'logo.png'), Buffer.from(base64Data, 'base64'));
    res.json({ message: 'Logo aggiornato', logoUrl: '/logo.png?t=' + Date.now() });
  } catch { res.status(500).json({ error: 'Errore salvataggio logo' }); }
});
app.get('/api/settings/logo', (req, res) => {
  const exists = fs.existsSync(path.join(__dirname, 'public', 'logo.png'));
  res.json({ hasLogo: exists, logoUrl: exists ? '/logo.png?t=' + Date.now() : '' });
});

// Backup
app.get('/api/backup', auth, isAdmin, (req, res) => {
  try {
    const backup = {
      version: '1.0',
      date: new Date().toISOString(),
      data: {
        users: db.prepare('SELECT * FROM users').all(),
        requests: db.prepare('SELECT * FROM requests').all(),
        sedi: db.prepare('SELECT * FROM sedi').all(),
        cantieri: db.prepare('SELECT * FROM cantieri').all(),
        avvisi: db.prepare('SELECT * FROM avvisi').all()
      }
    };
    res.json(backup);
  } catch { res.status(500).json({ error: 'Backup fallito' }); }
});

// Serve Frontend
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Start Server
app.listen(PORT, () => console.log(`Server avviato su porta ${PORT}`));