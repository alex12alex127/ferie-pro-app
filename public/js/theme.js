// Theme Management System
class ThemeManager {
  constructor() {
    this.theme = localStorage.getItem('theme') || 'dark';
    this.init();
  }

  init() {
    this.applyTheme();
    this.setupEventListeners();
    this.setupSystemThemeDetection();
  }

  applyTheme() {
    document.documentElement.setAttribute('data-theme', this.theme);
    localStorage.setItem('theme', this.theme);
    
    // Update theme toggle icon
    const themeToggle = document.querySelector('.theme-toggle');
    if (themeToggle) {
      const icon = themeToggle.querySelector('svg');
      if (icon) {
        icon.innerHTML = this.theme === 'dark' ? 
          '<path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/>' :
          '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>';
      }
    }
  }

  toggleTheme() {
    this.theme = this.theme === 'dark' ? 'light' : 'dark';
    this.applyTheme();
    this.animateThemeToggle();
  }

  animateThemeToggle() {
    const themeToggle = document.querySelector('.theme-toggle');
    if (themeToggle) {
      themeToggle.style.transform = 'translateX(-50%) scale(0.9)';
      setTimeout(() => {
        themeToggle.style.transform = 'translateX(-50%) scale(1.05)';
        setTimeout(() => {
          themeToggle.style.transform = 'translateX(-50%) scale(1)';
        }, 150);
      }, 100);
    }
  }

  setupEventListeners() {
    // Theme toggle button
    const themeToggle = document.querySelector('.theme-toggle');
    if (themeToggle) {
      themeToggle.addEventListener('click', () => this.toggleTheme());
    }

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (e.key === 't' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.toggleTheme();
      }
    });
  }

  setupSystemThemeDetection() {
    // Check for system preference
    if (!localStorage.getItem('theme')) {
      const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.theme = systemPrefersDark ? 'dark' : 'light';
      this.applyTheme();
    }

    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem('theme')) {
        this.theme = e.matches ? 'dark' : 'light';
        this.applyTheme();
      }
    });
  }

  // Utility methods
  isDarkTheme() {
    return this.theme === 'dark';
  }

  getTheme() {
    return this.theme;
  }

  setTheme(theme) {
    if (theme === 'dark' || theme === 'light') {
      this.theme = theme;
      this.applyTheme();
    }
  }
}

// Initialize theme manager when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.themeManager = new ThemeManager();
});

// Export for module support
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ThemeManager;
}
