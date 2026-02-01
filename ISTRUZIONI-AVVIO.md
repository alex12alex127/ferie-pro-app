# 🚀 ISTRUZIONI PER AVVIARE L'APP

## ⚠️ IMPORTANTE - Segui questi passaggi nell'ordine

### 1️⃣ Apri il Terminale nella cartella del progetto

```bash
cd ferie-pro-app
```

### 2️⃣ Installa le Dipendenze (PRIMA VOLTA)

```bash
npm install
```

Questo comando:
- Scarica tutte le librerie necessarie
- Crea la cartella `node_modules`
- Può richiedere 1-2 minuti

### 3️⃣ Avvia il Server

```bash
npm start
```

Vedrai questo messaggio:
```
╔════════════════════════════════════════╗
║   🚀 Ferie Pro Server                  ║
║   📍 http://localhost:3000             ║
║   ✓ Database inizializzato            ║
║   ✓ Transazioni abilitate             ║
╚════════════════════════════════════════╝
```

### 4️⃣ Apri il Browser

Vai su: **http://localhost:3000**

### 5️⃣ Accedi con le Credenziali Demo

**Admin:**
- Username: `admin`
- Password: `admin123`

**Dipendente:**
- Username: `mario.rossi`
- Password: `demo123`

---

## 📁 Cosa Succede Automaticamente

Quando avvii il server per la prima volta:

1. ✅ Viene creata la cartella `data/`
2. ✅ Viene creato il database `data/ferie.db`
3. ✅ Vengono create tutte le tabelle
4. ✅ Vengono inseriti gli utenti demo
5. ✅ Vengono caricate le festività 2026

---

## 🔍 Verifica che Funzioni

Dopo aver avviato il server, controlla:

1. **Nel terminale** - Dovresti vedere:
   ```
   ✓ Admin creato: admin / admin123
   ✓ Dipendente demo creato: mario.rossi / demo123
   ✓ Festività 2026 caricate
   ```

2. **Nella cartella del progetto** - Dovresti vedere:
   ```
   ferie-pro-app/
   ├── data/              ← NUOVA CARTELLA
   │   └── ferie.db       ← DATABASE CREATO
   ├── node_modules/      ← DIPENDENZE INSTALLATE
   ├── public/
   ├── server.js
   └── package.json
   ```

---

## ❌ Problemi Comuni

### "npm non è riconosciuto"
**Soluzione**: Installa Node.js da https://nodejs.org/

### "Porta 3000 già in uso"
**Soluzione**: Usa un'altra porta
```bash
set PORT=3001
npm start
```

### "Cannot find module"
**Soluzione**: Reinstalla le dipendenze
```bash
rmdir /s /q node_modules
npm install
```

### Database corrotto
**Soluzione**: Resetta il database
```bash
npm run reset-db
npm start
```

---

## 🛑 Per Fermare il Server

Premi `Ctrl + C` nel terminale

---

## 📞 Hai Bisogno di Aiuto?

1. Controlla i messaggi nel terminale
2. Apri la console del browser (F12)
3. Verifica che la cartella `data/` sia stata creata
