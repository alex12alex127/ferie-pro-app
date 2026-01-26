const API = {
  async get(url) {
    const res = await fetch(url, { headers: Auth.authHeaders() });
    if (res.status === 401) { Auth.logout(); return; }
    return res.json();
  },
  async post(url, body) {
    const res = await fetch(url, { method: 'POST', headers: Auth.authHeaders(), body: JSON.stringify(body) });
    if (res.status === 401) { Auth.logout(); return; }
    return res.json();
  },
  async patch(url, body) {
    const res = await fetch(url, { method: 'PATCH', headers: Auth.authHeaders(), body: JSON.stringify(body) });
    if (res.status === 401) { Auth.logout(); return; }
    return res.json();
  },
  async delete(url) {
    const res = await fetch(url, { method: 'DELETE', headers: Auth.authHeaders() });
    if (res.status === 401) { Auth.logout(); return; }
    return res.json();
  }
};

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function badgeClass(stato) {
  if (stato === 'Approvata') return 'badge-approved';
  if (stato === 'Rifiutata') return 'badge-rejected';
  return 'badge-pending';
}

function renderNav(active) {
  const nav = document.getElementById('main-nav');
  const user = Auth.getUser();
  if (!nav || !user) return;
  
  const items = [
    { key: 'request', label: 'Nuova Richiesta', href: '/request.html', roles: ['employee', 'manager', 'admin'] },
    { key: 'dashboard', label: 'Dashboard', href: '/dashboard.html', roles: ['manager', 'admin'] },
    { key: 'admin', label: 'Admin', href: '/admin.html', roles: ['admin'] },
  ];
  
  nav.innerHTML = items
    .filter(i => i.roles.includes(user.role))
    .map(i => `<a href="${i.href}" class="${i.key === active ? 'active' : ''}">${i.label}</a>`)
    .join('');
}

function renderUserInfo() {
  const el = document.getElementById('user-info');
  const user = Auth.getUser();
  if (el && user) {
    el.innerHTML = `${escapeHtml(user.name)} <span style="color:var(--text-muted)">(${user.role})</span>`;
  }
}

// LOGIN PAGE
function initLogin() {
  if (Auth.isLoggedIn()) {
    Auth.redirectByRole();
    return;
  }
  const form = document.getElementById('login-form');
  const alert = document.getElementById('login-alert');
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    alert.classList.add('hidden');
    const username = form.username.value.trim();
    const password = form.password.value.trim();
    
    try {
      await Auth.login(username, password);
      Auth.redirectByRole();
    } catch (err) {
      alert.textContent = err.message;
      alert.classList.remove('hidden');
    }
  });
}

// REQUEST PAGE
async function initRequest() {
  if (!Auth.requireAuth()) return;
  renderNav('request');
  renderUserInfo();
  
  const user = Auth.getUser();
  const form = document.getElementById('request-form');
  const alert = document.getElementById('request-alert');
  const listEl = document.getElementById('my-requests');
  
  form.nome.value = user.name;
  form.email.value = user.email;
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    alert.classList.add('hidden');
    
    const payload = {
      nome: form.nome.value.trim(),
      email: form.email.value.trim(),
      reparto: form.reparto.value.trim(),
      ruolo: form.ruolo.value.trim(),
      responsabile: form.responsabile.value.trim(),
      inizio: form.inizio.value,
      fine: form.fine.value,
      tipo: form.tipo.value,
      urgenza: form.urgenza.value,
      motivo: form.motivo.value.trim(),
      telefono: form.telefono.value.trim(),
    };
    
    if (!payload.inizio || !payload.fine) {
      alert.textContent = 'Inserisci le date di inizio e fine.';
      alert.className = 'alert alert-error';
      alert.classList.remove('hidden');
      return;
    }
    
    try {
      await API.post('/api/requests', payload);
      alert.textContent = 'Richiesta inviata con successo!';
      alert.className = 'alert alert-success';
      alert.classList.remove('hidden');
      form.reset();
      form.nome.value = user.name;
      form.email.value = user.email;
      loadMyRequests();
    } catch (err) {
      alert.textContent = err.message || 'Errore invio richiesta';
      alert.className = 'alert alert-error';
      alert.classList.remove('hidden');
    }
  });
  
  async function loadMyRequests() {
    const data = await API.get('/api/requests');
    if (!data || data.length === 0) {
      listEl.innerHTML = '<tr><td colspan="5">Nessuna richiesta.</td></tr>';
      return;
    }
    listEl.innerHTML = data.map(r => `
      <tr>
        <td>${escapeHtml(r.inizio)} → ${escapeHtml(r.fine)}</td>
        <td>${escapeHtml(r.tipo)}</td>
        <td>${escapeHtml(r.urgenza)}</td>
        <td><span class="badge ${badgeClass(r.stato)}">${escapeHtml(r.stato)}</span></td>
        <td>${escapeHtml(r.created_at?.split('T')[0] || '')}</td>
      </tr>
    `).join('');
  }
  
  loadMyRequests();
}

// DASHBOARD PAGE
async function initDashboard() {
  if (!Auth.requireAuth() || !Auth.requireRole(['manager', 'admin'])) return;
  renderNav('dashboard');
  renderUserInfo();
  
  const listEl = document.getElementById('requests-list');
  const filterText = document.getElementById('filter-text');
  const filterStatus = document.getElementById('filter-status');
  const filterFrom = document.getElementById('filter-from');
  const filterTo = document.getElementById('filter-to');
  
  let allData = [];
  
  async function loadStats() {
    const stats = await API.get('/api/stats');
    document.getElementById('kpi-total').textContent = stats.total;
    document.getElementById('kpi-pending').textContent = stats.pending;
    document.getElementById('kpi-approved').textContent = stats.approved;
    document.getElementById('kpi-rejected').textContent = stats.rejected;
  }
  
  async function loadRequests() {
    allData = await API.get('/api/requests') || [];
    renderList();
  }
  
  function renderList() {
    const q = (filterText.value || '').toLowerCase();
    const status = filterStatus.value;
    const from = filterFrom.value;
    const to = filterTo.value;
    
    const filtered = allData.filter(r => {
      const text = [r.nome, r.email, r.reparto, r.tipo].join(' ').toLowerCase();
      if (q && !text.includes(q)) return false;
      if (status && r.stato !== status) return false;
      if (from && r.inizio < from) return false;
      if (to && r.fine > to) return false;
      return true;
    });
    
    if (filtered.length === 0) {
      listEl.innerHTML = '<tr><td colspan="6">Nessuna richiesta trovata.</td></tr>';
      return;
    }
    
    listEl.innerHTML = filtered.map(r => `
      <tr>
        <td><strong>${escapeHtml(r.nome)}</strong><br><small style="color:var(--text-muted)">${escapeHtml(r.email)}</small></td>
        <td>${escapeHtml(r.reparto || '-')}</td>
        <td>${escapeHtml(r.inizio)} → ${escapeHtml(r.fine)}</td>
        <td>${escapeHtml(r.tipo)}</td>
        <td><span class="badge ${badgeClass(r.stato)}">${escapeHtml(r.stato)}</span></td>
        <td style="white-space:nowrap">
          <button class="btn-sm btn-secondary" onclick="updateStatus(${r.id}, 'Approvata')">✓ Approva</button>
          <button class="btn-sm btn-ghost" onclick="updateStatus(${r.id}, 'Rifiutata')">✗ Rifiuta</button>
        </td>
      </tr>
    `).join('');
  }
  
  window.updateStatus = async function(id, stato) {
    await API.patch(`/api/requests/${id}/status`, { stato });
    loadRequests();
    loadStats();
  };
  
  [filterText, filterStatus, filterFrom, filterTo].forEach(el => el.addEventListener('input', renderList));
  document.getElementById('btn-refresh').addEventListener('click', () => { loadRequests(); loadStats(); });
  
  loadStats();
  loadRequests();
}

// ADMIN PAGE
async function initAdmin() {
  if (!Auth.requireAuth() || !Auth.requireRole(['admin'])) return;
  renderNav('admin');
  renderUserInfo();
  
  const listEl = document.getElementById('requests-list');
  const usersEl = document.getElementById('users-list');
  const filterText = document.getElementById('filter-text');
  const filterStatus = document.getElementById('filter-status');
  
  let allData = [];
  
  async function loadRequests() {
    allData = await API.get('/api/requests') || [];
    renderList();
  }
  
  function renderList() {
    const q = (filterText.value || '').toLowerCase();
    const status = filterStatus.value;
    
    const filtered = allData.filter(r => {
      const text = [r.nome, r.email, r.reparto].join(' ').toLowerCase();
      if (q && !text.includes(q)) return false;
      if (status && r.stato !== status) return false;
      return true;
    });
    
    if (filtered.length === 0) {
      listEl.innerHTML = '<tr><td colspan="5">Nessuna richiesta.</td></tr>';
      return;
    }
    
    listEl.innerHTML = filtered.map(r => `
      <tr>
        <td><strong>${escapeHtml(r.nome)}</strong><br><small style="color:var(--text-muted)">${escapeHtml(r.email)}</small></td>
        <td>${escapeHtml(r.inizio)} → ${escapeHtml(r.fine)}</td>
        <td>${escapeHtml(r.tipo)}</td>
        <td><span class="badge ${badgeClass(r.stato)}">${escapeHtml(r.stato)}</span></td>
        <td style="white-space:nowrap">
          <button class="btn-sm btn-secondary" onclick="updateStatus(${r.id}, 'Approvata')">✓</button>
          <button class="btn-sm btn-ghost" onclick="updateStatus(${r.id}, 'Rifiutata')">✗</button>
          <button class="btn-sm btn-danger" onclick="deleteRequest(${r.id})">🗑</button>
        </td>
      </tr>
    `).join('');
  }
  
  async function loadUsers() {
    const users = await API.get('/api/users') || [];
    usersEl.innerHTML = users.map(u => `
      <tr>
        <td><strong>${escapeHtml(u.username)}</strong></td>
        <td>${escapeHtml(u.name)}<br><small style="color:var(--text-muted)">${escapeHtml(u.email)}</small></td>
        <td><span class="badge badge-pending">${escapeHtml(u.role)}</span></td>
        <td><button class="btn-sm btn-danger" onclick="deleteUser(${u.id})">🗑</button></td>
      </tr>
    `).join('');
  }
  
  window.updateStatus = async function(id, stato) {
    await API.patch(`/api/requests/${id}/status`, { stato });
    loadRequests();
  };
  
  window.deleteRequest = async function(id) {
    if (!confirm('Eliminare questa richiesta?')) return;
    await API.delete(`/api/requests/${id}`);
    loadRequests();
  };
  
  window.deleteUser = async function(id) {
    if (!confirm('Eliminare questo utente?')) return;
    await API.delete(`/api/users/${id}`);
    loadUsers();
  };
  
  // New user form
  const userForm = document.getElementById('user-form');
  const userAlert = document.getElementById('user-alert');
  userForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    userAlert.classList.add('hidden');
    try {
      await API.post('/api/users', {
        username: userForm.username.value.trim(),
        password: userForm.password.value,
        name: userForm.name.value.trim(),
        email: userForm.email.value.trim(),
        role: userForm.role.value,
      });
      userAlert.textContent = 'Utente creato!';
      userAlert.className = 'alert alert-success';
      userAlert.classList.remove('hidden');
      userForm.reset();
      loadUsers();
    } catch (err) {
      userAlert.textContent = err.message || 'Errore creazione utente';
      userAlert.className = 'alert alert-error';
      userAlert.classList.remove('hidden');
    }
  });
  
  [filterText, filterStatus].forEach(el => el.addEventListener('input', renderList));
  document.getElementById('btn-refresh').addEventListener('click', loadRequests);
  
  loadRequests();
  loadUsers();
}
