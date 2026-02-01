# 🏖️ Ferie Pro - Sistema Gestione Ferie e Permessi

Sistema completo per la gestione di ferie, permessi e malattie con interfaccia moderna e professionale.

## 🚀 Avvio Rapido

### 1. Installazione Dipendenze
```bash
npm install
```

### 2. Avvio Server
```bash
npm start
```

Il server sarà disponibile su: **http://localhost:3000**

## 👥 Credenziali Demo

### Admin
- **Username**: `admin`
- **Password**: `admin123`

### Dipendente
- **Username**: `mario.rossi`
- **Password**: `demo123`

## 🔧 Comandi Disponibili

```bash
npm start        # Avvia il server
npm run dev      # Avvia in modalità sviluppo
npm run reset-db # Resetta il database (elimina tutti i dati)
```

## 🛠️ Risoluzione Problemi

### Errore "no such column"
Se ricevi errori relativi al database, resetta il database:

```bash
npm run reset-db
npm start
```

### Porta già in uso
Se la porta 3000 è occupata, modifica la variabile PORT:

```bash
# Windows
set PORT=3001 && npm start

# Linux/Mac
PORT=3001 npm start
```

## 📋 Funzionalità

### Per Dipendenti
- ✅ Dashboard con statistiche personali
- ✅ Visualizzazione giorni ferie disponibili
- ✅ Creazione richieste (Ferie, Permessi, Malattia)
- ✅ Storico richieste con stato
- ✅ Profilo personale

### Per Admin
- ✅ Approvazione/Rifiuto richieste
- ✅ Gestione utenti
- ✅ Visualizzazione tutte le richieste
- ✅ Statistiche globali
- ✅ Log modifiche giorni ferie

## 🎨 Caratteristiche Tecniche

- **Backend**: Node.js + Express
- **Database**: SQLite con transazioni ACID
- **Auth**: JWT con bcrypt
- **Frontend**: Vanilla JavaScript + Lucide Icons
- **Design**: Responsive, sidebar collassabile, dark theme

## 📊 Struttura Database

- **users**: Utenti del sistema
- **requests**: Richieste ferie/permessi
- **notifications**: Notifiche utenti
- **holidays**: Festività nazionali
- **days_log**: Log modifiche giorni ferie

## 🔒 Sicurezza

- Password hashate con bcrypt
- Token JWT con scadenza 24h
- Validazione input lato client e server
- Foreign keys e constraints database
- CORS configurato

## 📝 Note

- Il calcolo giorni esclude automaticamente weekend e festività
- Le festività italiane 2026 sono precaricate
- I giorni ferie vengono scalati solo dopo approvazione
- Ogni modifica ai giorni viene tracciata nel log

## 🆘 Supporto

Per problemi o domande, controlla:
1. Console del browser (F12)
2. Log del server nel terminale
3. File `data/ferie.db` esiste e ha permessi corretti

---

**Versione**: 2.0.0  
**Licenza**: MIT
