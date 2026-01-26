const API = {
  async req(method, url, body) {
    const res = await fetch(url, { method, headers: Auth.authHeaders(), body: body ? JSON.stringify(body) : undefined });
    if (res.status === 401) { Auth.logout(); return; }
    const ct = res.headers.get('content-type');
    return ct?.includes('json') ? res.json() : res.text();
  },
  get: (url) => API.req('GET', url),
  post: (url, body) => API.req('POST', url, body),
  patch: (url, body) => API.req('PATCH', url, body),
  delete: (url) => API.req('DELETE', url)
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const esc = (s) => { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; };
const badge = (s) => s === 'Approvata' ? 'badge-approved' : s === 'Rifiutata' ? 'badge-rejected' : 'badge-pending';

function renderNav(active) {
  const nav = $('#main-nav'), user = Auth.getUser();
  if (!nav || !user) return;
  const items = [
    { k: 'request', l: 'Richiesta', h: '/request.html', r: ['employee', 'manager', 'admin'] },
    { k: 'calendar', l: 'Calendario', h: '/calendar.html', r: ['employee', 'manager', 'admin'] },
    { k: 'dashboard', l: 'Dashboard', h: '/dashboard.html', r: ['manager', 'admin'] },
    { k: 'admin', l: 'Admin', h: '/admin.html', r: ['admin'] },
    { k: 'profile', l: 'Profilo', h: '/profile.html', r: ['employee', 'manager', 'admin'] }
  ];
  nav.innerHTML = items.filter(i => i.r.includes(user.role)).map(i => `<a href="${i.h}" class="${i.k === active ? 'active' : ''}">${i.l}</a>`).join('');
  const ui = $('#user-info');
  if (ui) ui.innerHTML = `${esc(user.name)} <small>(${user.role})</small>`;
  loadNotifications();
}

async function loadNotifications() {
  const notifs = await API.get('/api/notifications');
  const unread = notifs?.filter(n => !n.read).length || 0;
  const bell = $('#notif-bell');
  if (bell) bell.innerHTML = unread > 0 ? `🔔<span class="notif-badge">${unread}</span>` : '🔔';
}

// LOGIN
function initLogin() {
  if (Auth.isLoggedIn()) { Auth.redirectByRole(); return; }
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const alert = $('#login-alert');
    alert.classList.add('hidden');
    try {
      await Auth.login($('#username').value.trim(), $('#password').value.trim());
      Auth.redirectByRole();
    } catch (err) { alert.textContent = err.message; alert.classList.remove('hidden'); }
  });
}

// REGISTER
function initRegister() {
  if (Auth.isLoggedIn()) { Auth.redirectByRole(); return; }
  $('#register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const alert = $('#register-alert');
    alert.classList.add('hidden');
    const username = $('#reg-username').value.trim();
    const name = $('#reg-name').value.trim();
    const email = $('#reg-email').value.trim();
    const password = $('#reg-password').value;
    const confirm = $('#reg-confirm').value;
    
    if (password !== confirm) {
      alert.textContent = 'Le password non coincidono';
      alert.className = 'alert alert-error';
      alert.classList.remove('hidden');
      return;
    }
    
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, name, email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      Auth.setAuth(data.token, data.user);
      alert.textContent = 'Registrazione completata! Reindirizzamento...';
      alert.className = 'alert alert-success';
      alert.classList.remove('hidden');
      setTimeout(() => Auth.redirectByRole(), 1500);
    } catch (err) {
      alert.textContent = err.message;
      alert.className = 'alert alert-error';
      alert.classList.remove('hidden');
    }
  });
}

// REQUEST
async function initRequest() {
  if (!Auth.requireAuth()) return;
  renderNav('request');
  const user = Auth.getUser(), form = $('#request-form'), alert = $('#request-alert'), list = $('#my-requests');
  form.nome.value = user.name;
  form.email.value = user.email;
  
  const updateDays = () => {
    const start = form.inizio.value, end = form.fine.value;
    if (start && end) {
      let count = 0, cur = new Date(start);
      const endD = new Date(end);
      while (cur <= endD) { if (cur.getDay() !== 0 && cur.getDay() !== 6) count++; cur.setDate(cur.getDate() + 1); }
      $('#giorni-calc').textContent = `${count || 1} giorni lavorativi`;
    }
  };
  form.inizio.addEventListener('change', updateDays);
  form.fine.addEventListener('change', updateDays);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    alert.classList.add('hidden');
    const payload = { nome: form.nome.value.trim(), email: form.email.value.trim(), reparto: form.reparto.value.trim(), ruolo: form.ruolo?.value?.trim() || '', responsabile: form.responsabile.value.trim(), inizio: form.inizio.value, fine: form.fine.value, tipo: form.tipo.value, urgenza: form.urgenza.value, motivo: form.motivo.value.trim(), telefono: form.telefono.value.trim() };
    if (!payload.inizio || !payload.fine) { alert.textContent = 'Inserisci le date.'; alert.className = 'alert alert-error'; alert.classList.remove('hidden'); return; }
    if (payload.fine < payload.inizio) { alert.textContent = 'Data fine deve essere dopo inizio.'; alert.className = 'alert alert-error'; alert.classList.remove('hidden'); return; }
    try {
      await API.post('/api/requests', payload);
      alert.textContent = 'Richiesta inviata!'; alert.className = 'alert alert-success'; alert.classList.remove('hidden');
      form.reset(); form.nome.value = user.name; form.email.value = user.email;
      loadMyRequests();
    } catch (err) { alert.textContent = err.message || 'Errore'; alert.className = 'alert alert-error'; alert.classList.remove('hidden'); }
  });

  async function loadMyRequests() {
    const data = await API.get('/api/requests') || [];
    list.innerHTML = data.length ? data.map(r => `<tr><td><b>${esc(r.inizio)}</b><br><small>→ ${esc(r.fine)}</small></td><td>${esc(r.tipo)}</td><td>${r.giorni}g</td><td><span class="badge ${badge(r.stato)}">${esc(r.stato)}</span></td></tr>`).join('') : '<tr><td colspan="4">Nessuna richiesta.</td></tr>';
  }
  loadMyRequests();
}

// DASHBOARD
async function initDashboard() {
  if (!Auth.requireAuth() || !Auth.requireRole(['manager', 'admin'])) return;
  renderNav('dashboard');
  const list = $('#requests-list'), ft = $('#filter-text'), fs = $('#filter-status'), ff = $('#filter-from'), fto = $('#filter-to');
  let all = [];

  async function load() {
    const [stats, data] = await Promise.all([API.get('/api/stats'), API.get('/api/requests')]);
    $('#kpi-total').textContent = stats.total; $('#kpi-pending').textContent = stats.pending;
    $('#kpi-approved').textContent = stats.approved; $('#kpi-rejected').textContent = stats.rejected;
    $('#kpi-month').textContent = stats.thisMonth;
    all = data || []; render();
  }

  function render() {
    const q = (ft.value || '').toLowerCase(), st = fs.value, from = ff.value, to = fto.value;
    const filtered = all.filter(r => {
      if (q && ![r.nome, r.email, r.reparto, r.tipo].join(' ').toLowerCase().includes(q)) return false;
      if (st && r.stato !== st) return false;
      if (from && r.inizio < from) return false;
      if (to && r.fine > to) return false;
      return true;
    });
    list.innerHTML = filtered.length ? filtered.map(r => `<tr><td><b>${esc(r.nome)}</b><br><small>${esc(r.email)}</small></td><td class="hide-mobile">${esc(r.reparto || '-')}</td><td>${esc(r.inizio)}<br><small>→ ${esc(r.fine)}</small></td><td>${r.giorni}g</td><td><span class="badge ${badge(r.stato)}">${esc(r.stato)}</span></td><td><button class="btn-sm btn-secondary" onclick="action(${r.id},'Approvata')">✓</button> <button class="btn-sm btn-ghost" onclick="action(${r.id},'Rifiutata')">✗</button></td></tr>`).join('') : '<tr><td colspan="6">Nessuna richiesta.</td></tr>';
  }

  window.action = async (id, stato) => { await API.patch(`/api/requests/${id}/status`, { stato }); load(); };
  window.exportData = (format) => { window.open(`/api/export?format=${format}&from=${ff.value}&to=${fto.value}&stato=${fs.value}`); };

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
    const f = all.filter(r => (!q || [r.nome, r.email].join(' ').toLowerCase().includes(q)) && (!st || r.stato === st));
    list.innerHTML = f.length ? f.map(r => `<tr><td><b>${esc(r.nome)}</b><br><small>${esc(r.email)}</small></td><td>${esc(r.inizio)} → ${esc(r.fine)}</td><td><span class="badge ${badge(r.stato)}">${esc(r.stato)}</span></td><td><button class="btn-sm btn-secondary" onclick="action(${r.id},'Approvata')">✓</button> <button class="btn-sm btn-ghost" onclick="action(${r.id},'Rifiutata')">✗</button> <button class="btn-sm btn-danger" onclick="delReq(${r.id})">🗑</button></td></tr>`).join('') : '<tr><td colspan="4">Nessuna.</td></tr>';
  }

  async function loadUsers() {
    const data = await API.get('/api/users') || [];
    users.innerHTML = data.map(u => `<tr><td><b>${esc(u.username)}</b></td><td>${esc(u.name)}<br><small>${esc(u.email)}</small></td><td>${u.total_days - u.used_days}/${u.total_days}</td><td><span class="badge badge-pending">${esc(u.role)}</span></td><td><button class="btn-sm btn-danger" onclick="delUser(${u.id})">🗑</button></td></tr>`).join('');
  }

  window.action = async (id, stato) => { await API.patch(`/api/requests/${id}/status`, { stato }); loadReq(); };
  window.delReq = async (id) => { if (confirm('Eliminare?')) { await API.delete(`/api/requests/${id}`); loadReq(); } };
  window.delUser = async (id) => { if (confirm('Eliminare utente?')) { await API.delete(`/api/users/${id}`); loadUsers(); } };

  $('#user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, alert = $('#user-alert');
    alert.classList.add('hidden');
    try {
      await API.post('/api/users', { username: f.username.value.trim(), password: f.password.value, name: f.name.value.trim(), email: f.email.value.trim(), role: f.role.value, total_days: parseInt(f.total_days?.value) || 26 });
      alert.textContent = 'Utente creato!'; alert.className = 'alert alert-success'; alert.classList.remove('hidden');
      f.reset(); loadUsers();
    } catch (err) { alert.textContent = err.message || 'Errore'; alert.className = 'alert alert-error'; alert.classList.remove('hidden'); }
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

  f.addEventListener('submit', async (e) => {
    e.preventDefault(); alert.classList.add('hidden');
    try {
      await API.patch('/api/profile', { name: f.name.value.trim(), phone: f.phone.value.trim(), department: f.department.value.trim() });
      alert.textContent = 'Profilo aggiornato!'; alert.className = 'alert alert-success'; alert.classList.remove('hidden');
      const user = Auth.getUser(); user.name = f.name.value.trim(); Auth.setAuth(Auth.getToken(), user);
    } catch (err) { alert.textContent = err.message || 'Errore'; alert.className = 'alert alert-error'; alert.classList.remove('hidden'); }
  });

  cp.addEventListener('submit', async (e) => {
    e.preventDefault(); palert.classList.add('hidden');
    if (cp.newPassword.value !== cp.confirmPassword.value) { palert.textContent = 'Le password non coincidono'; palert.className = 'alert alert-error'; palert.classList.remove('hidden'); return; }
    try {
      await API.post('/api/change-password', { oldPassword: cp.oldPassword.value, newPassword: cp.newPassword.value });
      palert.textContent = 'Password cambiata!'; palert.className = 'alert alert-success'; palert.classList.remove('hidden');
      cp.reset();
    } catch (err) { palert.textContent = err.message || 'Errore'; palert.className = 'alert alert-error'; palert.classList.remove('hidden'); }
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
    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    
    let html = '<div class="cal-header">Lun</div><div class="cal-header">Mar</div><div class="cal-header">Mer</div><div class="cal-header">Gio</div><div class="cal-header">Ven</div><div class="cal-header">Sab</div><div class="cal-header">Dom</div>';
    const startDay = firstDay === 0 ? 6 : firstDay - 1;
    for (let i = 0; i < startDay; i++) html += '<div class="cal-day empty"></div>';
    
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayEvents = events.filter(e => dateStr >= e.inizio && dateStr <= e.fine);
      const isWeekend = new Date(year, month - 1, d).getDay() % 6 === 0;
      const isToday = new Date().toISOString().slice(0, 10) === dateStr;
      html += `<div class="cal-day${isWeekend ? ' weekend' : ''}${isToday ? ' today' : ''}"><span class="day-num">${d}</span>${dayEvents.map(e => `<div class="cal-event" title="${esc(e.nome)}">${esc(e.nome.split(' ')[0])}</div>`).join('')}</div>`;
    }
    calendar.innerHTML = html;
  }

  window.prevMonth = () => { currentDate.setMonth(currentDate.getMonth() - 1); render(); };
  window.nextMonth = () => { currentDate.setMonth(currentDate.getMonth() + 1); render(); };
  render();
}
