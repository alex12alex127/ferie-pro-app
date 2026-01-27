// API Helper
const API = {
  async req(m, u, b) {
    const r = await fetch(u, { method: m, headers: Auth.authHeaders(), body: b ? JSON.stringify(b) : undefined });
    if (r.status === 401) { Auth.logout(); return; }
    return r.headers.get('content-type')?.includes('json') ? r.json() : r.text();
  },
  get: u => API.req('GET', u),
  post: (u, b) => API.req('POST', u, b),
  patch: (u, b) => API.req('PATCH', u, b),
  delete: u => API.req('DELETE', u)
};

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const esc = s => { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; };
const badge = s => s === 'Approvata' || s === 'Consegnato' ? 'badge-approved' : s === 'Rifiutata' ? 'badge-rejected' : 'badge-pending';
const fmtDate = d => d ? new Date(d).toLocaleDateString('it-IT') : '-';
const isExpiring = d => { if (!d) return false; const diff = (new Date(d) - new Date()) / (1000 * 60 * 60 * 24); return diff < 30 && diff > 0; };
const isExpired = d => d && new Date(d) < new Date();

// Toggle mobile menu
function toggleMenu() {
  $('#sidebar')?.classList.toggle('open');
  $('#overlay')?.classList.toggle('open');
}

// NAV
function renderNav(active) {
  const nav = $('#main-nav'), user = Auth.getUser();
  if (!nav || !user) return;
  const isM = ['manager', 'admin'].includes(user.role), isA = user.role === 'admin';
  
  const sections = [
    { title: 'Principale', items: [
      { k: 'request', l: 'Ferie', h: '/request.html', i: '🏖️' },
      { k: 'timbrature', l: 'Presenze', h: '/timbrature.html', i: '⏰' },
      { k: 'rapportini', l: 'Rapportini', h: '/rapportini.html', i: '📝' },
      { k: 'calendar', l: 'Calendario', h: '/calendar.html', i: '📅' },
    ]},
    { title: 'Operativo', items: [
      { k: 'cantieri', l: 'Cantieri', h: '/cantieri.html', i: '🏗️', m: true },
      { k: 'materiale', l: 'Materiale', h: '/materiale.html', i: '📦' },
      { k: 'attrezzature', l: 'Attrezzature', h: '/attrezzature.html', i: '🔧', m: true },
      { k: 'veicoli', l: 'Veicoli', h: '/veicoli.html', i: '🚐', m: true },
    ]},
    { title: 'Gestione', items: [
      { k: 'scadenze', l: 'Scadenze', h: '/scadenze.html', i: '📋', m: true },
      { k: 'avvisi', l: 'Avvisi', h: '/avvisi.html', i: '📢' },
      { k: 'dashboard', l: 'Dashboard', h: '/dashboard.html', i: '📊', m: true },
      { k: 'admin', l: 'Admin', h: '/admin.html', i: '⚙️', a: true },
    ]},
    { title: 'Account', items: [
      { k: 'profile', l: 'Il Mio Profilo', h: '/profile.html', i: '👤' },
    ]}
  ];
  
  let html = '';
  sections.forEach(sec => {
    const visibleItems = sec.items.filter(i => (!i.m && !i.a) || (i.m && isM) || (i.a && isA));
    if (visibleItems.length) {
      html += `<div class="nav-section"><div class="nav-section-title">${sec.title}</div>`;
      visibleItems.forEach(i => {
        html += `<a href="${i.h}" class="${i.k === active ? 'active' : ''}" onclick="toggleMenu()"><span class="icon">${i.i}</span>${i.l}</a>`;
      });
      html += '</div>';
    }
  });
  nav.innerHTML = html;
  
  // User info in sidebar
  const userName = $('#user-name'), userRole = $('#user-role');
  if (userName) userName.textContent = user.name;
  if (userRole) userRole.textContent = user.role === 'admin' ? 'Amministratore' : user.role === 'manager' ? 'Responsabile' : 'Dipendente';
}

// LOGIN
function initLogin() {
  if (Auth.isLoggedIn()) { Auth.redirectByRole(); return; }
  $('#login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const alert = $('#login-alert');
    alert.classList.add('hidden');
    try { await Auth.login($('#username').value.trim(), $('#password').value.trim()); Auth.redirectByRole(); }
    catch (err) { alert.textContent = err.message; alert.classList.remove('hidden'); }
  });
}

// REGISTER
function initRegister() {
  if (Auth.isLoggedIn()) { Auth.redirectByRole(); return; }
  $('#register-form').addEventListener('submit', async e => {
    e.preventDefault();
    const alert = $('#register-alert');
    alert.classList.add('hidden');
    const [u, n, em, p, c] = ['#reg-username', '#reg-name', '#reg-email', '#reg-password', '#reg-confirm'].map(s => $(s).value.trim());
    if (p !== c) { alert.textContent = 'Le password non coincidono'; alert.className = 'alert alert-error'; alert.classList.remove('hidden'); return; }
    try {
      const res = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, name: n, email: em, password: p }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      Auth.setAuth(data.token, data.user);
      alert.textContent = 'Registrazione completata!'; alert.className = 'alert alert-success'; alert.classList.remove('hidden');
      setTimeout(() => Auth.redirectByRole(), 1000);
    } catch (err) { alert.textContent = err.message; alert.className = 'alert alert-error'; alert.classList.remove('hidden'); }
  });
}

// REQUEST (Ferie)
async function initRequest() {
  if (!Auth.requireAuth()) return;
  renderNav('request');
  const user = Auth.getUser(), form = $('#request-form'), alert = $('#request-alert'), list = $('#my-requests');
  form.nome.value = user.name; form.email.value = user.email;
  const updateDays = () => {
    const [s, e] = [form.inizio.value, form.fine.value];
    if (s && e) {
      let c = 0, cur = new Date(s);
      while (cur <= new Date(e)) { if (cur.getDay() % 6 !== 0) c++; cur.setDate(cur.getDate() + 1); }
      $('#giorni-calc').textContent = `${c || 1} giorni lavorativi`;
    }
  };
  form.inizio.addEventListener('change', updateDays);
  form.fine.addEventListener('change', updateDays);
  form.addEventListener('submit', async e => {
    e.preventDefault(); alert.classList.add('hidden');
    const payload = { nome: form.nome.value, email: form.email.value, reparto: form.reparto?.value, responsabile: form.responsabile?.value, inizio: form.inizio.value, fine: form.fine.value, tipo: form.tipo.value, urgenza: form.urgenza.value, motivo: form.motivo?.value };
    if (!payload.inizio || !payload.fine || payload.fine < payload.inizio) { alert.textContent = 'Date non valide'; alert.className = 'alert alert-error'; alert.classList.remove('hidden'); return; }
    try { await API.post('/api/requests', payload); alert.textContent = 'Richiesta inviata!'; alert.className = 'alert alert-success'; alert.classList.remove('hidden'); form.reset(); form.nome.value = user.name; form.email.value = user.email; load(); }
    catch { alert.textContent = 'Errore'; alert.className = 'alert alert-error'; alert.classList.remove('hidden'); }
  });
  async function load() {
    const data = await API.get('/api/requests') || [];
    list.innerHTML = data.length ? data.map(r => `<tr><td><b>${esc(r.inizio)}</b> → ${esc(r.fine)}</td><td>${esc(r.tipo)}</td><td>${r.giorni}g</td><td><span class="badge ${badge(r.stato)}">${esc(r.stato)}</span></td></tr>`).join('') : '<tr><td colspan="4">Nessuna richiesta.</td></tr>';
  }
  load();
}

// DASHBOARD
async function initDashboard() {
  if (!Auth.requireAuth() || !Auth.requireRole(['manager', 'admin'])) return;
  renderNav('dashboard');
  
  // Saluto dinamico
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Buongiorno' : hour < 18 ? 'Buon pomeriggio' : 'Buonasera';
  const user = Auth.getUser();
  $('#greeting').textContent = `${greeting}, ${user.name.split(' ')[0]}`;
  
  const list = $('#requests-list'), ft = $('#filter-text'), fs = $('#filter-status'), ff = $('#filter-from'), fto = $('#filter-to');
  let all = [];
  async function load() {
    const [stats, data] = await Promise.all([API.get('/api/stats'), API.get('/api/requests')]);
    $('#kpi-total').textContent = stats.total;
    $('#kpi-pending').textContent = stats.pending;
    $('#kpi-approved').textContent = stats.approved;
    $('#kpi-month').textContent = stats.thisMonth;
    all = data || []; render();
  }
  function render() {
    const q = (ft.value || '').toLowerCase(), st = fs.value, from = ff.value, to = fto.value;
    const f = all.filter(r => (!q || [r.nome, r.email, r.reparto].join(' ').toLowerCase().includes(q)) && (!st || r.stato === st) && (!from || r.inizio >= from) && (!to || r.fine <= to));
    list.innerHTML = f.length ? f.map(r => `<tr><td><b>${esc(r.nome)}</b><br><small>${esc(r.email)}</small></td><td class="hide-mobile">${esc(r.reparto || '-')}</td><td>${esc(r.inizio)} → ${esc(r.fine)}</td><td>${r.giorni}g</td><td><span class="badge ${badge(r.stato)}">${esc(r.stato)}</span></td><td><button class="btn-sm btn-secondary" onclick="action(${r.id},'Approvata')">✓</button> <button class="btn-sm btn-ghost" onclick="action(${r.id},'Rifiutata')">✗</button></td></tr>`).join('') : '<tr><td colspan="6">Nessuna.</td></tr>';
  }
  window.action = async (id, stato) => { await API.patch(`/api/requests/${id}/status`, { stato }); load(); };
  window.exportData = f => window.open(`/api/export?format=${f}&from=${ff.value}&to=${fto.value}&stato=${fs.value}`);
  [ft, fs, ff, fto].forEach(el => el.addEventListener('input', render));
  $('#btn-refresh').addEventListener('click', load);
  load();
}

// ADMIN
async function initAdmin() {
  if (!Auth.requireAuth() || !Auth.requireRole(['admin'])) return;
  renderNav('admin');
  const list = $('#requests-list'), users = $('#users-list'), ft = $('#filter-text'), fs = $('#filter-status');
  let all = [];
  async function loadReq() { all = await API.get('/api/requests') || []; renderReq(); }
  function renderReq() {
    const q = (ft.value || '').toLowerCase(), st = fs.value;
    const f = all.filter(r => (!q || r.nome.toLowerCase().includes(q)) && (!st || r.stato === st));
    list.innerHTML = f.length ? f.map(r => `<tr><td><b>${esc(r.nome)}</b></td><td>${esc(r.inizio)} → ${esc(r.fine)}</td><td><span class="badge ${badge(r.stato)}">${esc(r.stato)}</span></td><td><button class="btn-sm btn-secondary" onclick="action(${r.id},'Approvata')">✓</button> <button class="btn-sm btn-ghost" onclick="action(${r.id},'Rifiutata')">✗</button> <button class="btn-sm btn-danger" onclick="delReq(${r.id})">🗑</button></td></tr>`).join('') : '<tr><td colspan="4">Nessuna.</td></tr>';
  }
  async function loadUsers() {
    const data = await API.get('/api/users') || [];
    users.innerHTML = data.map(u => `<tr><td><b>${esc(u.username)}</b></td><td>${esc(u.name)}<br><small>${esc(u.email)}</small></td><td>${u.total_days - u.used_days}/${u.total_days}</td><td><span class="badge badge-pending">${esc(u.role)}</span></td><td><button class="btn-sm btn-danger" onclick="delUser(${u.id})">🗑</button></td></tr>`).join('');
  }
  window.action = async (id, stato) => { await API.patch(`/api/requests/${id}/status`, { stato }); loadReq(); };
  window.delReq = async id => { if (confirm('Eliminare?')) { await API.delete(`/api/requests/${id}`); loadReq(); } };
  window.delUser = async id => { if (confirm('Eliminare utente?')) { await API.delete(`/api/users/${id}`); loadUsers(); } };
  $('#user-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target, alert = $('#user-alert');
    alert.classList.add('hidden');
    try { await API.post('/api/users', { username: f.username.value, password: f.password.value, name: f.name.value, email: f.email.value, role: f.role.value, total_days: parseInt(f.total_days?.value) || 26 }); alert.textContent = 'Utente creato!'; alert.className = 'alert alert-success'; alert.classList.remove('hidden'); f.reset(); loadUsers(); }
    catch { alert.textContent = 'Errore'; alert.className = 'alert alert-error'; alert.classList.remove('hidden'); }
  });
  [ft, fs].forEach(el => el.addEventListener('input', renderReq));
  $('#btn-refresh').addEventListener('click', loadReq);
  loadReq(); loadUsers();
}

// PROFILE
async function initProfile() {
  if (!Auth.requireAuth()) return;
  renderNav('profile');
  const profile = await API.get('/api/profile');
  const f = $('#profile-form'), cp = $('#password-form'), alert = $('#profile-alert'), palert = $('#password-alert');
  f.name.value = profile.name; f.email.value = profile.email; f.phone.value = profile.phone || ''; f.department.value = profile.department || '';
  $('#days-info').innerHTML = `<b>${profile.total_days - profile.used_days}</b> giorni rimanenti su ${profile.total_days}`;
  $('#days-bar').style.width = `${((profile.total_days - profile.used_days) / profile.total_days) * 100}%`;
  f.addEventListener('submit', async e => {
    e.preventDefault(); alert.classList.add('hidden');
    try { await API.patch('/api/profile', { name: f.name.value, phone: f.phone.value, department: f.department.value }); alert.textContent = 'Salvato!'; alert.className = 'alert alert-success'; alert.classList.remove('hidden'); const user = Auth.getUser(); user.name = f.name.value; Auth.setAuth(Auth.getToken(), user); }
    catch { alert.textContent = 'Errore'; alert.className = 'alert alert-error'; alert.classList.remove('hidden'); }
  });
  cp.addEventListener('submit', async e => {
    e.preventDefault(); palert.classList.add('hidden');
    if (cp.newPassword.value !== cp.confirmPassword.value) { palert.textContent = 'Password non coincidono'; palert.className = 'alert alert-error'; palert.classList.remove('hidden'); return; }
    try { await API.post('/api/change-password', { oldPassword: cp.oldPassword.value, newPassword: cp.newPassword.value }); palert.textContent = 'Password cambiata!'; palert.className = 'alert alert-success'; palert.classList.remove('hidden'); cp.reset(); }
    catch { palert.textContent = 'Errore'; palert.className = 'alert alert-error'; palert.classList.remove('hidden'); }
  });
}

// CALENDAR
async function initCalendar() {
  if (!Auth.requireAuth()) return;
  renderNav('calendar');
  let currentDate = new Date();
  const calendar = $('#calendar-grid'), monthLabel = $('#month-label');
  const months = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  async function render() {
    const year = currentDate.getFullYear(), month = currentDate.getMonth() + 1;
    monthLabel.textContent = `${months[month - 1]} ${year}`;
    const events = await API.get(`/api/calendar?year=${year}&month=${month}`) || [];
    const firstDay = new Date(year, month - 1, 1).getDay(), daysInMonth = new Date(year, month, 0).getDate();
    let html = '<div class="cal-header">Lun</div><div class="cal-header">Mar</div><div class="cal-header">Mer</div><div class="cal-header">Gio</div><div class="cal-header">Ven</div><div class="cal-header">Sab</div><div class="cal-header">Dom</div>';
    const startDay = firstDay === 0 ? 6 : firstDay - 1;
    for (let i = 0; i < startDay; i++) html += '<div class="cal-day empty"></div>';
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayEvents = events.filter(e => dateStr >= e.inizio && dateStr <= e.fine);
      const isWeekend = new Date(year, month - 1, d).getDay() % 6 === 0, isToday = new Date().toISOString().slice(0, 10) === dateStr;
      html += `<div class="cal-day${isWeekend ? ' weekend' : ''}${isToday ? ' today' : ''}"><span class="day-num">${d}</span>${dayEvents.map(e => `<div class="cal-event">${esc(e.nome.split(' ')[0])}</div>`).join('')}</div>`;
    }
    calendar.innerHTML = html;
  }
  window.prevMonth = () => { currentDate.setMonth(currentDate.getMonth() - 1); render(); };
  window.nextMonth = () => { currentDate.setMonth(currentDate.getMonth() + 1); render(); };
  render();
}

// CANTIERI
async function initCantieri() {
  if (!Auth.requireAuth()) return;
  renderNav('cantieri');
  const list = $('#list'), filter = $('#filter'), form = $('#form'), alert = $('#alert');
  let all = [], editId = null, users = [];
  async function load() {
    [all, users] = await Promise.all([API.get('/api/cantieri'), API.get('/api/users')]);
    users = users || [];
    $('#add-tecnico').innerHTML = '<option value="">Seleziona...</option>' + users.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('');
    render();
  }
  function render() {
    const q = (filter.value || '').toLowerCase();
    const f = (all || []).filter(c => !q || [c.nome, c.cliente, c.indirizzo].join(' ').toLowerCase().includes(q));
    list.innerHTML = f.length ? f.map(c => `<tr><td><b>${esc(c.nome)}</b><br><small>${esc(c.indirizzo || '')}</small></td><td>${esc(c.cliente)}</td><td><span class="badge ${c.stato === 'Attivo' ? 'badge-approved' : 'badge-pending'}">${esc(c.stato)}</span></td><td><button class="btn-sm btn-secondary" onclick="edit(${c.id})">✏️</button></td></tr>`).join('') : '<tr><td colspan="4">Nessun cantiere.</td></tr>';
  }
  window.edit = id => {
    const c = all.find(x => x.id === id);
    if (!c) return;
    editId = id;
    form.id.value = id; form.nome.value = c.nome; form.cliente.value = c.cliente; form.indirizzo.value = c.indirizzo || ''; form.data_inizio.value = c.data_inizio || ''; form.data_fine.value = c.data_fine || ''; form.note.value = c.note || '';
    $('#form-title').textContent = 'Modifica Cantiere';
    $('#tecnici-section').classList.remove('hidden');
    renderTecnici(c.tecnici || []);
  };
  window.resetForm = () => { editId = null; form.reset(); $('#form-title').textContent = 'Nuovo Cantiere'; $('#tecnici-section').classList.add('hidden'); };
  function renderTecnici(tecnici) {
    $('#tecnici-list').innerHTML = tecnici.length ? tecnici.map(t => `<span class="badge badge-pending" style="margin:2px">${esc(t.name)} <button type="button" onclick="removeTecnico(${t.id})" style="background:none;border:none;cursor:pointer">×</button></span>`).join('') : '<small>Nessun tecnico assegnato</small>';
  }
  window.addTecnico = async () => {
    const uid = $('#add-tecnico').value;
    if (!uid || !editId) return;
    await API.post(`/api/cantieri/${editId}/assegna`, { user_id: uid });
    load();
  };
  window.removeTecnico = async uid => { if (editId) { await API.delete(`/api/cantieri/${editId}/assegna/${uid}`); load(); } };
  form.addEventListener('submit', async e => {
    e.preventDefault(); alert.classList.add('hidden');
    const data = { nome: form.nome.value, cliente: form.cliente.value, indirizzo: form.indirizzo.value, data_inizio: form.data_inizio.value, data_fine: form.data_fine.value, note: form.note.value };
    try {
      if (editId) await API.patch(`/api/cantieri/${editId}`, data);
      else await API.post('/api/cantieri', data);
      alert.textContent = 'Salvato!'; alert.className = 'alert alert-success'; alert.classList.remove('hidden');
      resetForm(); load();
    } catch { alert.textContent = 'Errore'; alert.className = 'alert alert-error'; alert.classList.remove('hidden'); }
  });
  filter.addEventListener('input', render);
  load();
}

// RAPPORTINI
async function initRapportini() {
  if (!Auth.requireAuth()) return;
  renderNav('rapportini');
  const list = $('#list'), filter = $('#filter'), form = $('#form'), alert = $('#alert');
  let all = [], cantieri = [];
  async function load() {
    [all, cantieri] = await Promise.all([API.get('/api/rapportini'), API.get('/api/cantieri')]);
    form.cantiere_id.innerHTML = '<option value="">Seleziona...</option>' + (cantieri || []).filter(c => c.stato === 'Attivo').map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('');
    form.data.value = new Date().toISOString().slice(0, 10);
    render();
  }
  function render() {
    const q = (filter.value || '').toLowerCase();
    const f = (all || []).filter(r => !q || [r.cantiere_nome, r.user_name, r.descrizione].join(' ').toLowerCase().includes(q));
    list.innerHTML = f.length ? f.map(r => `<tr><td><b>${fmtDate(r.data)}</b></td><td>${esc(r.cantiere_nome || '-')}</td><td>${r.ore}h</td><td class="hide-mobile">${esc(r.user_name)}</td></tr>`).join('') : '<tr><td colspan="4">Nessun rapportino.</td></tr>';
  }
  form.addEventListener('submit', async e => {
    e.preventDefault(); alert.classList.add('hidden');
    try { await API.post('/api/rapportini', { cantiere_id: form.cantiere_id.value, data: form.data.value, ore: form.ore.value, descrizione: form.descrizione.value, materiali: form.materiali.value, problemi: form.problemi.value }); alert.textContent = 'Rapportino inviato!'; alert.className = 'alert alert-success'; alert.classList.remove('hidden'); form.reset(); form.data.value = new Date().toISOString().slice(0, 10); load(); }
    catch { alert.textContent = 'Errore'; alert.className = 'alert alert-error'; alert.classList.remove('hidden'); }
  });
  filter.addEventListener('input', render);
  load();
}

// TIMBRATURE
async function initTimbrature() {
  if (!Auth.requireAuth()) return;
  renderNav('timbrature');
  const list = $('#list'), filter = $('#filter'), filterMese = $('#filter-mese'), cantiereSel = $('#cantiere-timbra'), timbraAlert = $('#timbra-alert');
  let all = [], cantieri = [];
  filterMese.value = new Date().toISOString().slice(0, 7);
  function updateOra() { $('#ora-attuale').textContent = new Date().toLocaleTimeString('it-IT'); }
  setInterval(updateOra, 1000); updateOra();
  async function load() {
    [all, cantieri] = await Promise.all([API.get('/api/timbrature'), API.get('/api/cantieri')]);
    cantiereSel.innerHTML = '<option value="">Cantiere (opzionale)</option>' + (cantieri || []).filter(c => c.stato === 'Attivo').map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('');
    render();
  }
  function render() {
    const q = (filter.value || '').toLowerCase(), mese = filterMese.value;
    const f = (all || []).filter(t => (!q || [t.user_name, t.cantiere_nome].join(' ').toLowerCase().includes(q)) && (!mese || t.data.startsWith(mese)));
    list.innerHTML = f.length ? f.map(t => `<tr><td><b>${fmtDate(t.data)}</b></td><td>${t.ora}</td><td><span class="badge ${t.tipo === 'Entrata' ? 'badge-approved' : 'badge-rejected'}">${t.tipo}</span></td><td class="hide-mobile">${esc(t.cantiere_nome || '-')}</td><td class="hide-mobile">${esc(t.user_name)}</td></tr>`).join('') : '<tr><td colspan="5">Nessuna timbratura.</td></tr>';
  }
  window.timbra = async tipo => {
    timbraAlert.classList.add('hidden');
    try {
      const res = await API.post('/api/timbrature', { cantiere_id: cantiereSel.value || null, tipo });
      timbraAlert.textContent = `${tipo} registrata alle ${res.ora}`; timbraAlert.className = 'alert alert-success'; timbraAlert.classList.remove('hidden');
      load();
    } catch { timbraAlert.textContent = 'Errore'; timbraAlert.className = 'alert alert-error'; timbraAlert.classList.remove('hidden'); }
  };
  filter.addEventListener('input', render);
  filterMese.addEventListener('change', render);
  load();
}

// SCADENZE
async function initScadenze() {
  if (!Auth.requireAuth()) return;
  renderNav('scadenze');
  const list = $('#list'), filterTipo = $('#filter-tipo'), form = $('#form'), alert = $('#alert');
  let all = [], users = [];
  async function load() {
    [all, users] = await Promise.all([API.get('/api/scadenze'), API.get('/api/users').catch(() => [])]);
    form.user_id.innerHTML = '<option value="">Aziendale</option>' + (users || []).map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('');
    render();
  }
  function render() {
    const tipo = filterTipo.value;
    const f = (all || []).filter(s => !tipo || s.tipo === tipo);
    list.innerHTML = f.length ? f.map(s => {
      const exp = isExpired(s.data_scadenza), expiring = isExpiring(s.data_scadenza);
      return `<tr><td><b>${esc(s.descrizione)}</b><br><small>${esc(s.user_name || 'Aziendale')}</small></td><td>${esc(s.tipo)}</td><td style="color:${exp ? 'var(--danger)' : expiring ? 'var(--warning)' : 'inherit'}">${fmtDate(s.data_scadenza)} ${exp ? '⚠️' : expiring ? '⏰' : ''}</td><td><span class="badge ${s.stato === 'Attiva' ? 'badge-pending' : 'badge-approved'}">${esc(s.stato)}</span></td><td><button class="btn-sm btn-ghost" onclick="completeScad(${s.id})">✓</button></td></tr>`;
    }).join('') : '<tr><td colspan="5">Nessuna scadenza.</td></tr>';
  }
  window.completeScad = async id => { await API.patch(`/api/scadenze/${id}`, { stato: 'Completata' }); load(); };
  form.addEventListener('submit', async e => {
    e.preventDefault(); alert.classList.add('hidden');
    try { await API.post('/api/scadenze', { user_id: form.user_id.value || null, tipo: form.tipo.value, descrizione: form.descrizione.value, data_scadenza: form.data_scadenza.value }); alert.textContent = 'Aggiunta!'; alert.className = 'alert alert-success'; alert.classList.remove('hidden'); form.reset(); load(); }
    catch { alert.textContent = 'Errore'; alert.className = 'alert alert-error'; alert.classList.remove('hidden'); }
  });
  filterTipo.addEventListener('change', render);
  load();
}

// ATTREZZATURE
async function initAttrezzature() {
  if (!Auth.requireAuth()) return;
  renderNav('attrezzature');
  const list = $('#list'), filter = $('#filter'), filterStato = $('#filter-stato'), form = $('#form'), alert = $('#alert');
  let all = [], editId = null, users = [], cantieri = [];
  async function load() {
    [all, users, cantieri] = await Promise.all([API.get('/api/attrezzature'), API.get('/api/users').catch(() => []), API.get('/api/cantieri')]);
    form.assegnato_a.innerHTML = '<option value="">Nessuno</option>' + (users || []).map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('');
    form.cantiere_id.innerHTML = '<option value="">Nessuno</option>' + (cantieri || []).filter(c => c.stato === 'Attivo').map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('');
    render();
  }
  function render() {
    const q = (filter.value || '').toLowerCase(), stato = filterStato.value;
    const f = (all || []).filter(a => (!q || [a.nome, a.codice, a.categoria].join(' ').toLowerCase().includes(q)) && (!stato || a.stato === stato));
    list.innerHTML = f.length ? f.map(a => `<tr><td><b>${esc(a.nome)}</b><br><small>${esc(a.categoria || '')}</small></td><td class="hide-mobile">${esc(a.codice || '-')}</td><td><span class="badge ${a.stato === 'Disponibile' ? 'badge-approved' : a.stato === 'Guasto' ? 'badge-rejected' : 'badge-pending'}">${esc(a.stato)}</span></td><td class="hide-mobile">${esc(a.assegnato_nome || '-')}</td><td><button class="btn-sm btn-secondary" onclick="editAttr(${a.id})">✏️</button></td></tr>`).join('') : '<tr><td colspan="5">Nessuna attrezzatura.</td></tr>';
  }
  window.editAttr = id => {
    const a = all.find(x => x.id === id);
    if (!a) return;
    editId = id;
    form.id.value = id; form.nome.value = a.nome; form.codice.value = a.codice || ''; form.categoria.value = a.categoria || ''; form.assegnato_a.value = a.assegnato_a || ''; form.cantiere_id.value = a.cantiere_id || ''; form.stato.value = a.stato; form.note.value = a.note || '';
    $('#form-title').textContent = 'Modifica Attrezzatura';
  };
  window.resetForm = () => { editId = null; form.reset(); $('#form-title').textContent = 'Nuova Attrezzatura'; };
  form.addEventListener('submit', async e => {
    e.preventDefault(); alert.classList.add('hidden');
    const data = { nome: form.nome.value, codice: form.codice.value, categoria: form.categoria.value, assegnato_a: form.assegnato_a.value || null, cantiere_id: form.cantiere_id.value || null, stato: form.stato.value, note: form.note.value };
    try {
      if (editId) await API.patch(`/api/attrezzature/${editId}`, data);
      else await API.post('/api/attrezzature', data);
      alert.textContent = 'Salvato!'; alert.className = 'alert alert-success'; alert.classList.remove('hidden');
      resetForm(); load();
    } catch { alert.textContent = 'Errore'; alert.className = 'alert alert-error'; alert.classList.remove('hidden'); }
  });
  filter.addEventListener('input', render);
  filterStato.addEventListener('change', render);
  load();
}

// VEICOLI
async function initVeicoli() {
  if (!Auth.requireAuth()) return;
  renderNav('veicoli');
  const list = $('#list'), form = $('#form'), alert = $('#alert');
  let all = [], editId = null, users = [];
  async function load() {
    [all, users] = await Promise.all([API.get('/api/veicoli'), API.get('/api/users').catch(() => [])]);
    form.assegnato_a.innerHTML = '<option value="">Nessuno</option>' + (users || []).map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('');
    render();
  }
  function render() {
    list.innerHTML = (all || []).length ? all.map(v => {
      const scads = [{ l: 'B', d: v.scadenza_bollo }, { l: 'A', d: v.scadenza_assicurazione }, { l: 'R', d: v.scadenza_revisione }].filter(s => s.d);
      const scadHtml = scads.map(s => `<small style="color:${isExpired(s.d) ? 'var(--danger)' : isExpiring(s.d) ? 'var(--warning)' : 'inherit'}">${s.l}: ${fmtDate(s.d)}</small>`).join('<br>');
      return `<tr><td><b>${esc(v.targa)}</b><br><small>${esc(v.modello)}</small></td><td class="hide-mobile">${esc(v.assegnato_nome || '-')}</td><td class="hide-mobile">${v.km_attuali || 0} km</td><td>${scadHtml || '-'}</td><td><button class="btn-sm btn-secondary" onclick="editVeic(${v.id})">✏️</button></td></tr>`;
    }).join('') : '<tr><td colspan="5">Nessun veicolo.</td></tr>';
  }
  window.editVeic = id => {
    const v = all.find(x => x.id === id);
    if (!v) return;
    editId = id;
    form.id.value = id; form.targa.value = v.targa; form.modello.value = v.modello; form.assegnato_a.value = v.assegnato_a || ''; form.km_attuali.value = v.km_attuali || ''; form.scadenza_bollo.value = v.scadenza_bollo || ''; form.scadenza_assicurazione.value = v.scadenza_assicurazione || ''; form.scadenza_revisione.value = v.scadenza_revisione || ''; form.note.value = v.note || '';
    $('#form-title').textContent = 'Modifica Veicolo';
    form.targa.disabled = true;
  };
  window.resetForm = () => { editId = null; form.reset(); form.targa.disabled = false; $('#form-title').textContent = 'Nuovo Veicolo'; };
  form.addEventListener('submit', async e => {
    e.preventDefault(); alert.classList.add('hidden');
    const data = { targa: form.targa.value, modello: form.modello.value, assegnato_a: form.assegnato_a.value || null, km_attuali: parseInt(form.km_attuali.value) || null, scadenza_bollo: form.scadenza_bollo.value, scadenza_assicurazione: form.scadenza_assicurazione.value, scadenza_revisione: form.scadenza_revisione.value, note: form.note.value };
    try {
      if (editId) await API.patch(`/api/veicoli/${editId}`, data);
      else await API.post('/api/veicoli', data);
      alert.textContent = 'Salvato!'; alert.className = 'alert alert-success'; alert.classList.remove('hidden');
      resetForm(); load();
    } catch { alert.textContent = 'Errore'; alert.className = 'alert alert-error'; alert.classList.remove('hidden'); }
  });
  load();
}

// MATERIALE
async function initMateriale() {
  if (!Auth.requireAuth()) return;
  renderNav('materiale');
  const list = $('#list'), filterStato = $('#filter-stato'), form = $('#form'), alert = $('#alert');
  let all = [], cantieri = [];
  const isM = ['manager', 'admin'].includes(Auth.getUser().role);
  async function load() {
    [all, cantieri] = await Promise.all([API.get('/api/materiale'), API.get('/api/cantieri')]);
    form.cantiere_id.innerHTML = '<option value="">Nessuno</option>' + (cantieri || []).filter(c => c.stato === 'Attivo').map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('');
    render();
  }
  function render() {
    const stato = filterStato.value;
    const f = (all || []).filter(m => !stato || m.stato === stato);
    list.innerHTML = f.length ? f.map(m => `<tr><td><b>${esc(m.materiale.slice(0, 50))}${m.materiale.length > 50 ? '...' : ''}</b><br><small>${esc(m.user_name)} - ${m.quantita || '-'}</small></td><td class="hide-mobile">${esc(m.cantiere_nome || '-')}</td><td><span class="badge ${badge(m.stato)}">${esc(m.stato)}</span></td><td>${isM ? `<button class="btn-sm btn-secondary" onclick="approvaMat(${m.id},'Approvata')">✓</button> <button class="btn-sm btn-ghost" onclick="approvaMat(${m.id},'Consegnato')">📦</button>` : ''}</td></tr>`).join('') : '<tr><td colspan="4">Nessuna richiesta.</td></tr>';
  }
  window.approvaMat = async (id, stato) => { await API.patch(`/api/materiale/${id}/status`, { stato }); load(); };
  form.addEventListener('submit', async e => {
    e.preventDefault(); alert.classList.add('hidden');
    try { await API.post('/api/materiale', { cantiere_id: form.cantiere_id.value || null, materiale: form.materiale.value, quantita: form.quantita.value, urgenza: form.urgenza.value, note: form.note.value }); alert.textContent = 'Richiesta inviata!'; alert.className = 'alert alert-success'; alert.classList.remove('hidden'); form.reset(); load(); }
    catch { alert.textContent = 'Errore'; alert.className = 'alert alert-error'; alert.classList.remove('hidden'); }
  });
  filterStato.addEventListener('change', render);
  load();
}

// AVVISI
async function initAvvisi() {
  if (!Auth.requireAuth()) return;
  renderNav('avvisi');
  const avvisiList = $('#avvisi-list'), form = $('#form'), alert = $('#alert'), formCard = $('#form-card');
  const isM = ['manager', 'admin'].includes(Auth.getUser().role);
  if (!isM) formCard.style.display = 'none';
  async function load() {
    const avvisi = await API.get('/api/avvisi') || [];
    avvisiList.innerHTML = avvisi.length ? avvisi.map(a => `<div class="card" style="margin-bottom:12px;border-left:4px solid ${a.priorita === 'Urgente' ? 'var(--danger)' : a.priorita === 'Alta' ? 'var(--warning)' : 'var(--primary)'}"><div style="display:flex;justify-content:space-between;align-items:start"><div><b>${esc(a.titolo)}</b><p style="margin:8px 0;color:var(--text-light)">${esc(a.messaggio)}</p><small style="color:var(--text-muted)">${fmtDate(a.created_at)}</small></div>${isM ? `<button class="btn-sm btn-ghost" onclick="delAvviso(${a.id})">×</button>` : ''}</div></div>`).join('') : '<p style="color:var(--text-muted)">Nessun avviso.</p>';
  }
  window.delAvviso = async id => { if (confirm('Eliminare avviso?')) { await API.delete(`/api/avvisi/${id}`); load(); } };
  form?.addEventListener('submit', async e => {
    e.preventDefault(); alert.classList.add('hidden');
    try { await API.post('/api/avvisi', { titolo: form.titolo.value, messaggio: form.messaggio.value, priorita: form.priorita.value }); alert.textContent = 'Pubblicato!'; alert.className = 'alert alert-success'; alert.classList.remove('hidden'); form.reset(); load(); }
    catch { alert.textContent = 'Errore'; alert.className = 'alert alert-error'; alert.classList.remove('hidden'); }
  });
  load();
}
