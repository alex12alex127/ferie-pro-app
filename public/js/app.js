// ============================================
// Ferie Pro - Main Application
// ============================================

// State
let token = localStorage.getItem('token');
let user = JSON.parse(localStorage.getItem('user') || 'null');

// DOM Elements
const loginPage = document.getElementById('login-page');
const registerPage = document.getElementById('register-page');
const dashboardPage = document.getElementById('dashboard-page');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');

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
  registerPage.classList.add('hidden');
  dashboardPage.classList.add('hidden');
}

function showRegister() {
  loginPage.classList.add('hidden');
  registerPage.classList.remove('hidden');
  dashboardPage.classList.add('hidden');
}

function showDashboard() {
  loginPage.classList.add('hidden');
  registerPage.classList.add('hidden');
  dashboardPage.classList.remove('hidden');
  
  // Update sidebar user info
  const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  document.getElementById('sidebar-initials').textContent = initials;
  document.getElementById('sidebar-user-name').textContent = user.name;
  document.getElementById('sidebar-user-role').textContent = getRoleLabel(user.role);
  
  // Show/hide admin elements
  document.querySelectorAll('.admin-only').forEach(el => {
    el.classList.toggle('hidden', user.role !== 'admin');
  });
  
  // Initialize Lucide icons
  setTimeout(() => {
    lucide.createIcons();
  }, 100);
  
  loadDashboard();
}

// ============================================
// Validation Functions
// ============================================
function validateUsername(username) {
  if (username.length < 3) {
    return 'Username deve essere almeno 3 caratteri';
  }
  if (!/^[a-zA-Z0-9._]+$/.test(username)) {
    return 'Username può contenere solo lettere, numeri, punto e underscore';
  }
  return null;
}

function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return 'Email non valida';
  }
  return null;
}

function validatePassword(password) {
  if (password.length < 6) {
    return 'Password deve essere almeno 6 caratteri';
  }
  return null;
}

function getPasswordStrength(password) {
  if (password.length === 0) return 'none';
  if (password.length < 6) return 'weak';
  
  let strength = 0;
  if (password.length >= 8) strength++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
  if (/\d/.test(password)) strength++;
  if (/[^a-zA-Z0-9]/.test(password)) strength++;
  
  if (strength <= 1) return 'weak';
  if (strength <= 2) return 'medium';
  return 'strong';
}

function showError(fieldId, message) {
  const errorEl = document.getElementById(`error-${fieldId}`);
  if (errorEl) {
    errorEl.textContent = message;
  }
}

function clearError(fieldId) {
  const errorEl = document.getElementById(`error-${fieldId}`);
  if (errorEl) {
    errorEl.textContent = '';
  }
}

function clearAllErrors() {
  document.querySelectorAll('.form-error').forEach(el => el.textContent = '');
}

// ============================================
// Navigation
// ============================================
document.querySelectorAll('.sidebar-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const page = btn.dataset.page;
    
    // Update active nav
    document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    // Update page title
    const titles = {
      'home': 'Dashboard',
      'profile': 'Il Mio Profilo',
      'requests': 'Le Mie Richieste',
      'new-request': 'Nuova Richiesta',
      'admin': 'Amministrazione'
    };
    document.getElementById('page-title').textContent = titles[page] || 'Dashboard';
    
    // Show section
    document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
    document.getElementById(`${page}-section`).classList.remove('hidden');
    
    // Close mobile menu
    closeMobileMenu();
    
    // Load data
    if (page === 'home') loadStats();
    if (page === 'profile') loadProfilePage();
    if (page === 'requests') loadRequests();
    if (page === 'admin') loadAdminData();
  });
});

// Sidebar Toggle (Desktop)
document.getElementById('sidebar-toggle').addEventListener('click', () => {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.toggle('collapsed');
  
  // Re-initialize icons after DOM change
  setTimeout(() => {
    lucide.createIcons();
  }, 100);
});

// Mobile Menu
let mobileMenuBtn, sidebar;

document.addEventListener('DOMContentLoaded', () => {
  mobileMenuBtn = document.getElementById('mobile-menu-btn');
  sidebar = document.getElementById('sidebar');
  
  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', openMobileMenu);
  }
});

function openMobileMenu() {
  sidebar.classList.add('mobile-open');
  // Create overlay
  const overlay = document.createElement('div');
  overlay.className = 'sidebar-overlay active';
  overlay.id = 'sidebar-overlay';
  overlay.addEventListener('click', closeMobileMenu);
  document.body.appendChild(overlay);
  
  // Re-initialize icons
  setTimeout(() => {
    lucide.createIcons();
  }, 100);
}

function closeMobileMenu() {
  if (sidebar) {
    sidebar.classList.remove('mobile-open');
  }
  const overlay = document.getElementById('sidebar-overlay');
  if (overlay) {
    overlay.remove();
  }
}

// Close mobile menu on window resize
window.addEventListener('resize', () => {
  if (window.innerWidth > 768) {
    closeMobileMenu();
  }
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
    
    // Update badges
    const requestsBadge = document.getElementById('requests-badge');
    if (requestsBadge) {
      requestsBadge.textContent = stats.total;
      requestsBadge.style.display = stats.total > 0 ? 'block' : 'none';
    }
    
    const adminBadge = document.getElementById('admin-badge');
    if (adminBadge && user.role === 'admin') {
      adminBadge.textContent = stats.pending;
      adminBadge.style.display = stats.pending > 0 ? 'block' : 'none';
    }
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

async function loadProfilePage() {
  try {
    const [profile, stats, requests] = await Promise.all([
      api('/profile'),
      api('/stats'),
      api('/requests')
    ]);
    
    // Profile Info
    const initials = profile.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    document.getElementById('profile-initials').textContent = initials;
    document.getElementById('profile-name').textContent = profile.name;
    document.getElementById('profile-role').textContent = getRoleLabel(profile.role);
    document.getElementById('profile-email').textContent = profile.email;
    
    // Days Info
    const available = profile.total_days - profile.used_days;
    const percent = Math.round((profile.used_days / profile.total_days) * 100);
    
    document.getElementById('profile-total-days').textContent = profile.total_days;
    document.getElementById('profile-used-days').textContent = profile.used_days;
    document.getElementById('profile-available-days').textContent = available;
    document.getElementById('profile-progress').style.width = `${percent}%`;
    document.getElementById('profile-percent').textContent = percent;
    
    // Stats
    document.getElementById('profile-stat-total').textContent = stats.total;
    document.getElementById('profile-stat-pending').textContent = stats.pending;
    document.getElementById('profile-stat-approved').textContent = stats.approved;
    
    // Recent Requests (last 5)
    const recent = requests.slice(0, 5);
    const container = document.getElementById('profile-recent-requests');
    
    if (recent.length === 0) {
      container.innerHTML = '<p style="color: var(--gray-500); text-align: center; padding: 1rem;">Nessuna richiesta</p>';
      return;
    }
    
    container.innerHTML = recent.map(r => `
      <div class="recent-request-item">
        <div class="recent-request-info">
          <div class="recent-request-type ${r.type.toLowerCase()}">
            ${getTypeIcon(r.type)}
          </div>
          <div class="recent-request-details">
            <h4>${r.type} - ${r.days} giorn${r.days === 1 ? 'o' : 'i'}</h4>
            <p>${formatDate(r.start_date)} - ${formatDate(r.end_date)}</p>
          </div>
        </div>
        <span class="status status-${r.status}">${statusLabel(r.status)}</span>
      </div>
    `).join('');
  } catch (e) {
    console.error('Error loading profile page:', e);
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
  if (!confirm(`Sei sicuro di voler ${status === 'approved' ? 'approvare' : 'rifiutare'} questa richiesta?`)) {
    return;
  }
  
  try {
    await api(`/requests/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
    
    alert(`Richiesta ${status === 'approved' ? 'approvata' : 'rifiutata'} con successo!`);
    
    await Promise.all([
      loadAdminRequests(),
      loadStats()
    ]);
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

function getRoleLabel(role) {
  const labels = {
    admin: 'Amministratore',
    manager: 'Responsabile',
    employee: 'Dipendente'
  };
  return labels[role] || role;
}

function getTypeIcon(type) {
  const icons = {
    'Ferie': '🏖️',
    'Permesso': '🕐',
    'Malattia': '🏥'
  };
  return icons[type] || '📋';
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
    
    // Initialize icons before showing dashboard
    setTimeout(() => {
      showDashboard();
    }, 50);
  } catch (e) {
    alert(e.message);
  }
});

// Register Form
registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAllErrors();
  
  // Get form values
  const name = document.getElementById('reg-name').value.trim();
  const username = document.getElementById('reg-username').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const phone = document.getElementById('reg-phone').value.trim();
  const department = document.getElementById('reg-department').value;
  const password = document.getElementById('reg-password').value;
  const passwordConfirm = document.getElementById('reg-password-confirm').value;
  const terms = document.getElementById('reg-terms').checked;
  
  // Validate
  let hasErrors = false;
  
  if (!name || name.length < 2) {
    showError('name', 'Nome deve essere almeno 2 caratteri');
    hasErrors = true;
  }
  
  const usernameError = validateUsername(username);
  if (usernameError) {
    showError('username', usernameError);
    hasErrors = true;
  }
  
  const emailError = validateEmail(email);
  if (emailError) {
    showError('email', emailError);
    hasErrors = true;
  }
  
  const passwordError = validatePassword(password);
  if (passwordError) {
    showError('password', passwordError);
    hasErrors = true;
  }
  
  if (password !== passwordConfirm) {
    showError('password-confirm', 'Le password non corrispondono');
    hasErrors = true;
  }
  
  if (!terms) {
    showError('terms', 'Devi accettare i termini e condizioni');
    hasErrors = true;
  }
  
  if (hasErrors) return;
  
  // Submit
  try {
    const data = await api('/register', {
      method: 'POST',
      body: JSON.stringify({ 
        username, 
        password, 
        name, 
        email,
        phone: phone || undefined,
        department: department || undefined
      })
    });
    
    token = data.token;
    user = data.user;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    
    alert('Registrazione completata con successo!');
    
    // Initialize icons before showing dashboard
    setTimeout(() => {
      showDashboard();
    }, 50);
  } catch (e) {
    alert(e.message);
  }
});

// Show Register Page
document.getElementById('show-register')?.addEventListener('click', (e) => {
  e.preventDefault();
  showRegister();
  registerForm.reset();
  clearAllErrors();
  setTimeout(() => lucide.createIcons(), 50);
});

// Show Login Page
document.getElementById('show-login')?.addEventListener('click', (e) => {
  e.preventDefault();
  showLogin();
  loginForm.reset();
  setTimeout(() => lucide.createIcons(), 50);
});

// Password Strength Indicator
document.getElementById('reg-password').addEventListener('input', (e) => {
  const password = e.target.value;
  const strengthBar = document.querySelector('.strength-bar');
  const strength = getPasswordStrength(password);
  
  strengthBar.className = 'strength-bar';
  if (strength !== 'none') {
    strengthBar.classList.add(strength);
  }
});

// Real-time validation
document.getElementById('reg-username').addEventListener('blur', (e) => {
  const error = validateUsername(e.target.value.trim());
  if (error) {
    showError('username', error);
  } else {
    clearError('username');
  }
});

document.getElementById('reg-email').addEventListener('blur', (e) => {
  const error = validateEmail(e.target.value.trim());
  if (error) {
    showError('email', error);
  } else {
    clearError('email');
  }
});

document.getElementById('reg-password').addEventListener('blur', (e) => {
  const error = validatePassword(e.target.value);
  if (error) {
    showError('password', error);
  } else {
    clearError('password');
  }
});

document.getElementById('reg-password-confirm').addEventListener('blur', (e) => {
  const password = document.getElementById('reg-password').value;
  const confirm = e.target.value;
  
  if (confirm && password !== confirm) {
    showError('password-confirm', 'Le password non corrispondono');
  } else {
    clearError('password-confirm');
  }
});

// Logout
document.addEventListener('DOMContentLoaded', () => {
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
  }
});

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
    
    // Reload stats and go to requests page
    await loadStats();
    document.querySelector('[data-page="requests"]')?.click();
  } catch (e) {
    alert(e.message);
  }
});

// ============================================
// Init
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  if (token && user) {
    showDashboard();
  } else {
    showLogin();
  }
  
  // Initialize Lucide icons
  lucide.createIcons();
});
