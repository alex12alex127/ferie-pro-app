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
      { k: 'dashboard', l: 'Dashboard', h: '/dashboard.html', i: '🏠' },
      { k: 'request', l: 'Richiedi Ferie', h: '/request.html', i: '✈️' },
      { k: 'calendar', l: 'Calendario', h: '/calendar.html', i: '📆' },
    ]},
    { title: 'Operativo', items: [
      { k: 'cantieri', l: 'Cantieri', h: '/cantieri.html', i: '🏗️', m: true },
      { k: 'avvisi', l: 'Avvisi', h: '/avvisi.html', i: '📣' },
    ]},
    { title: 'Gestione', items: [
      { k: 'admin', l: 'Admin', h: '/admin.html', i: '⚙️', a: true },
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

// DASHBOARD (unificata con Profilo)
async function initDashboard() {
  if (!Auth.requireAuth()) return;
  renderNav('dashboard');
  
  const user = Auth.getUser();
  const isM = ['manager', 'admin'].includes(user.role);
  
  // Saluto dinamico
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Buongiorno' : hour < 18 ? 'Buon pomeriggio' : 'Buonasera';
  $('#greeting').textContent = `${greeting}, ${user.name.split(' ')[0]}`;
  
  // Carica profilo e giorni ferie
  const profile = await API.get('/api/profile');
  $('#days-info').innerHTML = `<b>${profile.total_days - profile.used_days}</b> giorni ferie rimanenti su ${profile.total_days}`;
  $('#days-bar').style.width = `${((profile.total_days - profile.used_days) / profile.total_days) * 100}%`;
  
  // Form profilo
  const pf = $('#profile-form'), palert = $('#profile-alert');
  pf.name.value = profile.name; pf.email.value = profile.email; pf.phone.value = profile.phone || ''; pf.department.value = profile.department || '';
  pf.addEventListener('submit', async e => {
    e.preventDefault(); palert.classList.add('hidden');
    try { 
      await API.patch('/api/profile', { name: pf.name.value, phone: pf.phone.value, department: pf.department.value }); 
      palert.textContent = 'Salvato!'; palert.className = 'alert alert-success'; palert.classList.remove('hidden'); 
      user.name = pf.name.value; Auth.setAuth(Auth.getToken(), user);
      $('#user-name').textContent = user.name;
    } catch { palert.textContent = 'Errore'; palert.className = 'alert alert-error'; palert.classList.remove('hidden'); }
  });
  
  // Form password
  const cp = $('#password-form'), cpalert = $('#password-alert');
  cp.addEventListener('submit', async e => {
    e.preventDefault(); cpalert.classList.add('hidden');
    if (cp.newPassword.value !== cp.confirmPassword.value) { cpalert.textContent = 'Password non coincidono'; cpalert.className = 'alert alert-error'; cpalert.classList.remove('hidden'); return; }
    try { await API.post('/api/change-password', { oldPassword: cp.oldPassword.value, newPassword: cp.newPassword.value }); cpalert.textContent = 'Password cambiata!'; cpalert.className = 'alert alert-success'; cpalert.classList.remove('hidden'); cp.reset(); }
    catch { cpalert.textContent = 'Errore'; cpalert.className = 'alert alert-error'; cpalert.classList.remove('hidden'); }
  });
  
  // Sezione Manager/Admin
  if (isM) {
    $('#manager-section').classList.remove('hidden');
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

// AVVISI
async function initAvvisi() {
  if (!Auth.requireAuth()) return;
  renderNav('avvisi');
  const avvisiList = $('#avvisi-list'), form = $('#form'), alert = $('#alert'), formCard = $('#form-card');
  const isM = ['manager', 'admin'].includes(Auth.getUser().role);
  if (!isM) formCard.style.display = 'none';
  async function load() {
    const avvisi = await API.get('/api/avvisi') || [];
    const prioColor = p => p === 'Urgente' ? 'var(--danger)' : p === 'Alta' ? 'var(--warning)' : 'var(--primary)';
    const prioIcon = p => p === 'Urgente' ? '🔴' : p === 'Alta' ? '🟡' : '🔵';
    avvisiList.innerHTML = avvisi.length ? avvisi.map(a => `
      <div class="card" style="margin-bottom:16px;border-left:3px solid ${prioColor(a.priorita)};padding:20px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px">
          <div style="flex:1">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
              <span>${prioIcon(a.priorita)}</span>
              <b style="font-size:15px">${esc(a.titolo)}</b>
            </div>
            <p style="margin:0 0 12px;color:var(--text-secondary);line-height:1.6">${esc(a.messaggio)}</p>
            <small style="color:var(--text-muted)">${fmtDate(a.created_at)}</small>
          </div>
          ${isM ? `<button class="btn-sm btn-ghost" onclick="delAvviso(${a.id})" style="flex-shrink:0">×</button>` : ''}
        </div>
      </div>
    `).join('') : '<div style="text-align:center;padding:40px;color:var(--text-muted)"><p>Nessun avviso pubblicato</p></div>';
  }
  window.delAvviso = async id => { if (confirm('Eliminare avviso?')) { await API.delete(`/api/avvisi/${id}`); load(); } };
  form?.addEventListener('submit', async e => {
    e.preventDefault(); alert.classList.add('hidden');
    try { await API.post('/api/avvisi', { titolo: form.titolo.value, messaggio: form.messaggio.value, priorita: form.priorita.value }); alert.textContent = 'Pubblicato!'; alert.className = 'alert alert-success'; alert.classList.remove('hidden'); form.reset(); load(); }
    catch { alert.textContent = 'Errore'; alert.className = 'alert alert-error'; alert.classList.remove('hidden'); }
  });
  load();
}
