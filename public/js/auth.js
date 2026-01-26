const Auth = {
  TOKEN_KEY: 'ferie_token',
  USER_KEY: 'ferie_user',

  getToken() {
    return localStorage.getItem(this.TOKEN_KEY);
  },

  getUser() {
    const raw = localStorage.getItem(this.USER_KEY);
    return raw ? JSON.parse(raw) : null;
  },

  setAuth(token, user) {
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
  },

  clearAuth() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
  },

  isLoggedIn() {
    return !!this.getToken();
  },

  async login(username, password) {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Errore login');
    this.setAuth(data.token, data.user);
    return data.user;
  },

  logout() {
    this.clearAuth();
    window.location.href = '/';
  },

  requireAuth() {
    if (!this.isLoggedIn()) {
      window.location.href = '/';
      return false;
    }
    return true;
  },

  requireRole(roles) {
    const user = this.getUser();
    if (!user || !roles.includes(user.role)) {
      window.location.href = '/request.html';
      return false;
    }
    return true;
  },

  redirectByRole() {
    const user = this.getUser();
    if (!user) return;
    const routes = { admin: '/admin.html', manager: '/dashboard.html', employee: '/request.html' };
    window.location.href = routes[user.role] || '/request.html';
  },

  authHeaders() {
    return { 'Authorization': `Bearer ${this.getToken()}`, 'Content-Type': 'application/json' };
  }
};
