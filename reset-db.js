// Script per resettare il database
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'ferie.db');

if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
  console.log('✅ Database eliminato');
}

// Elimina anche i file WAL e SHM se esistono
const walPath = dbPath + '-wal';
const shmPath = dbPath + '-shm';

if (fs.existsSync(walPath)) {
  fs.unlinkSync(walPath);
  console.log('✅ File WAL eliminato');
}

if (fs.existsSync(shmPath)) {
  fs.unlinkSync(shmPath);
  console.log('✅ File SHM eliminato');
}

console.log('\n🔄 Riavvia il server per ricreare il database\n');
