// ============================================
// Ferie Pro - Main Application
// ============================================

// State
let token = localStorage.getItem('token');
let user = JSON.parse(localStorage.getItem('user') || 'null');

// DOM Elements
const loginPage = document.getElementById('login-page');
const dashboardPage = document.getElementById('dashboard-page');
const loginForm = document.getElementById('login-form');
const logoutBtn = document.getElementById('logout-btn');
const userName = document.getElementById('user-name');

// ============================================
// API Helper
// ============================================
async function api(endpoint, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(`/api${endpoint}`, {
    ...options,
    headers: { ...headers, ...options.headers }
  });
  
  if (res.status === 401) {
    logout();
    throw new Error('Sessione scaduta');
  }
  
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Errore');
  return data;
}

// ============================================
// Auth Functions
// ============================================
function logout() {
  token = null;
  user = null;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  showLogin();
}

function showLogin() {
  loginPage.classList.remove('hidden');
  dashboardPage.classList.add('hidden');
}

function showDashboard() {
  loginPage.classList.add('hidden');
  dashboardPage.classList.remove('hidden');
  userName.textContent = user.name;
  
  // Show/hide admin elements
  document.querySelectorAll('.admin-only').forEach(el => {
    el.classList.toggle('hidden', user.role !== 'admin');
  });
  
  loadDashboard();
}

// ============================================
// Navigation
// ============================================
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const page = btn.dataset.page;
    
    // Update active nav
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    // Show section
    document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
    document.getElementById(`${page}-section`).classList.remove('hidden');
    
    // Load data
    if (page === 'home') loadStats();
    if (page === 'requests') loadRequests();
    if (page === 'admin') loadAdminData();
  });
});

// ============================================
// Tabs (Admin)
// ============================================
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    document.getElementById(`${tab}-tab`).classList.remove('hidden');
  });
});

// ============================================
// Load Functions
// ============================================
async function loadDashboard() {
  await Promise.all([loadStats(), loadProfile()]);
}

async function loadStats() {
  try {
    const stats = await api('/stats');
    document.getElementById('stat-total').textContent = stats.total;
    document.getElementById('stat-pending').textContent = stats.pending;
    document.getElementById('stat-approved').textContent = stats.approved;
  } catch (e) {
    console.error('Error loading stats:', e);
  }
}

async function loadProfile() {
  try {
    const profile = await api('/profile');
    const available = profile.total_days - profile.used_days;
    const percent = (profile.used_days / profile.total_days) * 100;
    
    document.getElementById('days-available').textContent = available;
    document.getElementById('days-progress').style.width = `${percent}%`;
  } catch (e) {
    console.error('Error loading profile:', e);
  }
}

async function loadRequests() {
  try {
    const requests = await api('/requests');
    const container = document.getElementById('requests-list');
    
    if (requests.length === 0) {
      container.innerHTML = '<p class="card">Nessuna richiesta trovata</p>';
      return;
    }
    
    container.innerHTML = requests.map(r => `
      <div class="request-card">
        <div class="request-info">
          <h3>${r.type} - ${r.days} giorn${r.days === 1 ? 'o' : 'i'}</h3>
          <p>${formatDate(r.start_date)} - ${formatDate(r.end_date)}</p>
        </div>
        <span class="status status-${r.status}">${statusLabel(r.status)}</span>
      </div>
    `).join('');
  } catch (e) {
    console.error('Error loading requests:', e);
  }
}

async function loadAdminData() {
  await Promise.all([loadAdminRequests(), loadUsers()]);
}

async function loadAdminRequests() {
  try {
    const requests = await api('/requests');
    const pending = requests.filter(r => r.status === 'pending');
    const container = document.getElementById('admin-requests-list');
    
    if (pending.length === 0) {
      container.innerHTML = '<p class="card">Nessuna richiesta in attesa</p>';
      return;
    }
    
    container.innerHTML = pending.map(r => `
      <div class="request-card">
        <div class="request-info">
          <h3>${r.user_name || 'Utente'} - ${r.type}</h3>
          <p>${formatDate(r.start_date)} - ${formatDate(r.end_date)} (${r.days} giorni)</p>
        </div>
        <div class="request-actions">
          <button class="btn btn-success btn-sm" onclick="updateRequest(${r.id}, 'approved')">Approva</button>
          <button class="btn btn-danger btn-sm" onclick="updateRequest(${r.id}, 'rejected')">Rifiuta</button>
        </div>
      </div>
    `).join('');
  } catch (e) {
    console.error('Error loading admin requests:', e);
  }
}

async function loadUsers() {
  try {
    const users = await api('/users');
    const container = document.getElementById('users-list');
    
    container.innerHTML = users.map(u => `
      <div class="user-card">
        <div class="user-info">
          <h3>${u.name}</h3>
          <p>${u.email} - Giorni: ${u.total_days - u.used_days}/${u.total_days}</p>
        </div>
        <span class="role-badge ${u.role}">${u.role}</span>
      </div>
    `).join('');
  } catch (e) {
    console.error('Error loading users:', e);
  }
}

// ============================================
// Actions
// ============================================
async function updateRequest(id, status) {
  try {
    await api(`/requests/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
    loadAdminRequests();
    loadStats();
  } catch (e) {
    alert(e.message);
  }
}

// ============================================
// Helpers
// ============================================
function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function statusLabel(status) {
  const labels = {
    pending: 'In Attesa',
    approved: 'Approvata',
    rejected: 'Rifiutata'
  };
  return labels[status] || status;
}

// ============================================
// Event Listeners
// ============================================

// Login Form
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  
  try {
    const data = await api('/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    
    token = data.token;
    user = data.user;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    
    showDashboard();
  } catch (e) {
    alert(e.message);
  }
});

// Logout
logoutBtn.addEventListener('click', logout);

// New Request Form
document.getElementById('request-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const type = document.getElementById('req-type').value;
  const start_date = document.getElementById('req-start').value;
  const end_date = document.getElementById('req-end').value;
  const reason = document.getElementById('req-reason').value;
  
  try {
    await api('/requests', {
      method: 'POST',
      body: JSON.stringify({ type, start_date, end_date, reason })
    });
    
    alert('Richiesta inviata con successo!');
    e.target.reset();
    
    // Go to requests page
    document.querySelector('[data-page="requests"]').click();
  } catch (e) {
    alert(e.message);
  }
});

// ============================================
// Init
// ============================================
if (token && user) {
  showDashboard();
} else {
  showLogin();
}
