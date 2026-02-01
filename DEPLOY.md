# 🚀 Deploy su Dokploy

## Come Applicare le Modifiche

### Metodo 1: Git Push (Consigliato)

```bash
cd ferie-pro-app

# Aggiungi le modifiche
git add .

# Commit
git commit -m "Fix: Risolto errore creazione richieste + miglioramenti UI"

# Push al repository
git push origin main
```

Dokploy rileverà automaticamente le modifiche e farà il redeploy.

---

### Metodo 2: Deploy Manuale da Dokploy

1. Vai su **Dokploy Dashboard**
2. Seleziona il progetto **ferie-pro-app**
3. Clicca su **"Redeploy"** o **"Rebuild"**
4. Attendi il completamento del deploy

---

## 🔍 Verifica Deploy

Dopo il deploy, controlla:

1. **Logs di Dokploy** - Dovresti vedere:
   ```
   ✓ Admin creato: admin / admin123
   ✓ Dipendente demo creato: mario.rossi / demo123
   ✓ Festività 2026 caricate
   ```

2. **App funzionante** - Vai sull'URL del VPS e prova:
   - Login
   - Creazione richiesta ferie
   - Approvazione richieste (come admin)

---

## 📝 Modifiche Applicate

### Bug Fix
- ✅ Risolto errore SQL "no such column: admin"
- ✅ Corretto event listener form richieste
- ✅ Validazione date migliorata

### Miglioramenti
- ✅ Sidebar professionale con Lucide Icons
- ✅ Pagina registrazione completa
- ✅ Validazione real-time
- ✅ Badge notifiche dinamici
- ✅ Mobile responsive
- ✅ Log dettagliati per debug

---

## 🗄️ Database su VPS

Il database è in: `/app/data/ferie.db` (dentro il container Docker)

### Reset Database (se necessario)

Se il database è corrotto, puoi resettarlo:

1. **Via Dokploy Console**:
   ```bash
   cd /app
   node reset-db.js
   # Poi riavvia il container
   ```

2. **Via Dokploy Dashboard**:
   - Vai su "Settings" → "Environment Variables"
   - Aggiungi: `RESET_DB=true`
   - Redeploy
   - Rimuovi la variabile
   - Redeploy di nuovo

---

## 🔐 Variabili d'Ambiente (Opzionali)

Puoi configurare in Dokploy:

```env
PORT=3000
JWT_SECRET=tuo-secret-super-sicuro-qui
NODE_ENV=production
```

---

## 📊 Monitoraggio

Controlla i logs in tempo reale:

1. Vai su Dokploy Dashboard
2. Seleziona il progetto
3. Clicca su "Logs"
4. Cerca messaggi come:
   - `📝 Nuova richiesta:`
   - `✅ Richiesta creata con ID:`
   - `❌ Errore creazione richiesta:`

---

## 🆘 Troubleshooting

### L'app non si aggiorna
```bash
# Forza rebuild
git commit --allow-empty -m "Force rebuild"
git push
```

### Errori persistenti
1. Controlla i logs di Dokploy
2. Verifica che `node_modules` sia installato
3. Controlla che la cartella `data/` abbia permessi corretti
4. Prova a resettare il database

### Performance lente
- Verifica risorse VPS (RAM, CPU)
- Controlla dimensione database
- Ottimizza query se necessario
