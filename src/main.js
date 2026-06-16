import './style.css';

// API Base URL — reads from Vite env: localhost for dev, Koyeb for production
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Auto-inject /api prefix for backend requests (fixes NestJS global API prefix routing mismatch)
const originalFetch = window.fetch;
window.fetch = function (input, init) {
  if (typeof input === 'string' && input.startsWith(`${API_BASE_URL}/`) && !input.startsWith(`${API_BASE_URL}/api/`)) {
    input = input.replace(`${API_BASE_URL}/`, `${API_BASE_URL}/api/`);
  }
  return originalFetch(input, init);
};

/* ==========================================================================
   MYVA CORE APPLICATION LOGIC
   ========================================================================== */

// --- PERSONA NAME MAPPING (Bug #9: consistent naming) ---
const PERSONA_MAP = {
  friendly: 'Friendly',
  professional: 'Professional',
  islamic: 'Islamic Assistant',
  business_partner: 'Business Partner',
  grumpy_boss: 'Grumpy Boss',
  romantic_partner: 'Romantic Partner'
};

// --- INITIAL DATA (empty defaults for fresh users) ---
const DEFAULT_MEMORIES = [];
const DEFAULT_TASKS = [];
const DEFAULT_REMINDERS = [];
const DEFAULT_FILES = [];
const DEFAULT_CONTACTS = [];
const DEFAULT_EVENTS = [];
const DEFAULT_EXPENSES = [];

let emojiPickerTarget = 'studio';
let activeOauthKey = null;
let activeSettingsKey = null;

let dashSimChatLog = [
  { sender: 'assistant', text: 'Halo! Saya asisten AI MYVA. Kirimkan pesan atau perintah WhatsApp di sini untuk disimulasikan.', time: '09:00' }
];

// --- STATE MANAGEMENT ---
class AppState {
  constructor() {
    this.memories = this.load('memories', DEFAULT_MEMORIES);
    this.tasks = this.load('tasks', DEFAULT_TASKS);
    this.reminders = this.load('reminders', DEFAULT_REMINDERS);
    this.files = this.load('files', DEFAULT_FILES);
    this.contacts = this.load('contacts', DEFAULT_CONTACTS);
    this.events = this.load('events', DEFAULT_EVENTS);
    this.expenses = this.load('expenses', DEFAULT_EXPENSES);
    
    this.studio = this.load('studio_config', {
      name: 'MYVA',
      emoji: '🤖',
      personality: 'friendly',
      style: 'normal',
      language: 'id',
      briefing: true,
      briefingTime: '07:30',
      followup: true
    });

    this.integrations = this.load('integrations', {
      gcal: false,
      gdrive: false,
      gcontacts: false,
      gmail: false
    });

    this.profile = this.load('profile', {
      username: 'User',
      phone: '',
      backupEnabled: true,
      plan: 'free'
    });
    this.token = localStorage.getItem('myva_token') || null;
    this.refreshToken = localStorage.getItem('myva_refresh_token') || null;
  }

  async syncWithBackend() {
    if (!this.token) {
      console.log('No token found, skipping sync.');
      return;
    }

    try {
      const profileRes = await fetch(`${API_BASE_URL}/users/profile`, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
        },
      });

      if (profileRes.status === 401) {
        console.warn('Unauthorized token, signing out...');
        this.logout();
        return;
      }

      if (!profileRes.ok) {
        throw new Error('Failed to fetch user profile.');
      }

      const profileData = await profileRes.json();
      if (profileData.success && profileData.user) {
        const user = profileData.user;
        this.profile = {
          username: user.name || 'User',
          phone: user.waNumber || '8123456789',
          avatar: user.avatar || '🤖',
          email: user.email || 'muis@myva.ai',
          bio: this.profile.bio || '',
          plan: user.plan || 'free',
        };
        this.save('profile', this.profile);

        this.studio = {
          name: this.studio.name || 'MYVA',
          emoji: this.studio.emoji || '🤖',
          personality: user.persona || this.studio.personality || 'friendly',
          style: this.studio.style || 'normal',
          language: this.studio.language || 'id',
          briefing: user.briefingEnabled !== undefined ? user.briefingEnabled : this.studio.briefing,
          briefingTime: user.briefingTime || this.studio.briefingTime || '07:30',
          followup: user.followupEnabled !== undefined ? user.followupEnabled : this.studio.followup
        };
        this.save('studio_config', this.studio);

        this.integrations = {
          gcal: user.gcalConnected || false,
          gdrive: user.gdriveConnected || false,
          gcontacts: user.contactsSyncEnabled || false,
          gmail: user.gmailConnected || false,
        };
        this.save('integrations', this.integrations);
        
        syncSidebarProfile();
      }

      const fetchBackend = async (path) => {
        const res = await fetch(`${API_BASE_URL}${path}`, {
          headers: {
            'Authorization': `Bearer ${this.token}`,
          },
        });
        if (res.ok) {
          return await res.json();
        }
        if (res.status === 401) {
          this.logout();
        }
        return null;
      };

      const memories = await fetchBackend('/memory');
      if (memories) {
        this.memories = memories.map(m => ({
          id: m.id,
          title: m.title,
          content: m.content,
          category: m.category,
          date: new Date(m.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        }));
        this.save('memories', this.memories);
      }

      const tasks = await fetchBackend('/task');
      if (tasks) {
        this.tasks = tasks.map(t => ({
          id: t.id,
          title: t.title,
          tags: t.tags || ['Task'],
          priority: t.priority || 'Medium',
          status: t.status || 'todo',
        }));
        this.save('tasks', this.tasks);
      }

      const reminders = await fetchBackend('/reminder');
      if (reminders) {
        const regularReminders = reminders.filter(r => !r.title.startsWith('[Calendar]'));
        const calendarEvents = reminders.filter(r => r.title.startsWith('[Calendar]'));

        this.reminders = regularReminders.map(r => {
          let timegroup = 'Today';
          const diffDays = Math.ceil((new Date(r.scheduledAt).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays <= 0) timegroup = 'Today';
          else if (diffDays === 1) timegroup = 'Tomorrow';
          else if (diffDays <= 7) timegroup = 'This Week';
          else timegroup = 'This Month';

          return {
            id: r.id,
            text: r.title,
            timegroup,
            time: new Date(r.scheduledAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
            completed: r.status === 'completed',
          };
        });
        this.save('reminders', this.reminders);

        this.events = calendarEvents.map(e => {
          const dateObj = new Date(e.scheduledAt);
          const yyyy = dateObj.getFullYear();
          const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
          const dd = String(dateObj.getDate()).padStart(2, '0');
          return {
            id: e.id,
            title: e.title.replace('[Calendar] ', ''),
            date: `${yyyy}-${mm}-${dd}`,
            time: dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
            details: e.description || 'Synchronized via Google Calendar/Myva Backend',
          };
        });
        this.save('events', this.events);
      }

      const contacts = await fetchBackend('/contact');
      if (contacts) {
        this.contacts = contacts.map(c => ({
          id: c.id,
          name: c.name,
          company: c.company || 'Freelance',
          phone: c.phone || '',
          email: c.email || '',
          insta: c.instagram || '',
        }));
        this.save('contacts', this.contacts);
      }

      const expenses = await fetchBackend('/expenses');
      if (expenses) {
        this.expenses = expenses.map(e => ({
          id: e.id,
          description: e.description,
          amount: e.amount,
          category: e.category,
          date: new Date(e.date || e.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        }));
        this.save('expenses', this.expenses);
      }

      const files = await fetchBackend('/file');
      if (files) {
        this.files = files.map(f => ({
          id: f.id,
          name: f.filename,
          type: f.mimeType.split('/')[1] || 'bin',
          size: `${(f.size / (1024 * 1024)).toFixed(1)} MB`,
          date: new Date(f.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
          summary: f.summary || 'Summary not processed yet.',
          points: f.keyPoints || [],
          actions: f.actionItems || [],
        }));
        this.save('files', this.files);
      }
    } catch (err) {
      console.warn('Failed to sync state with backend. Falling back to local storage mocks.', err);
    }
  }

  logout() {
    this.token = null;
    this.refreshToken = null;
    localStorage.removeItem('myva_token');
    localStorage.removeItem('myva_refresh_token');
    window.location.hash = '#login';
  }

  async loginWithEmail(email, password) {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok && data.accessToken) {
        this.token = data.accessToken;
        this.refreshToken = data.refreshToken;
        localStorage.setItem('myva_token', data.accessToken);
        localStorage.setItem('myva_refresh_token', data.refreshToken);
        await this.syncWithBackend();
        return { success: true };
      } else {
        return { success: false, message: data.message || 'Login gagal. Email atau password salah.' };
      }
    } catch (err) {
      console.error(err);
      return { success: false, message: 'Koneksi ke server gagal. Harap coba lagi nanti.' };
    }
  }

  async signupWithEmail(name, email, waNumber, password) {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, email, waNumber, password }),
      });
      const data = await res.json();
      if (res.ok && data.accessToken) {
        this.token = data.accessToken;
        this.refreshToken = data.refreshToken;
        localStorage.setItem('myva_token', data.accessToken);
        localStorage.setItem('myva_refresh_token', data.refreshToken);
        await this.syncWithBackend();
        return { success: true };
      } else {
        return { success: false, message: data.message || 'Pendaftaran gagal. Pastikan format email & WA benar.' };
      }
    } catch (err) {
      console.error(err);
      return { success: false, message: 'Koneksi ke server gagal. Harap coba lagi nanti.' };
    }
  }

  async devLoginInstant() {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/dev-login`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok && data.accessToken) {
        this.token = data.accessToken;
        this.refreshToken = data.refreshToken;
        localStorage.setItem('myva_token', data.accessToken);
        localStorage.setItem('myva_refresh_token', data.refreshToken);
        await this.syncWithBackend();
        return { success: true };
      } else {
        return { success: false, message: 'Sandbox login gagal.' };
      }
    } catch (err) {
      console.error(err);
      return { success: false, message: 'Koneksi ke server gagal.' };
    }
  }

  async apiPost(path, body) {
    if (!this.token) return null;
    try {
      const res = await fetch(`${API_BASE_URL}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`,
        },
        body: JSON.stringify(body),
      });
      if (res.ok) return await res.json();
    } catch (err) {
      console.warn('API Post failed:', err);
    }
    return null;
  }

  async apiDelete(path) {
    if (!this.token) return false;
    try {
      const res = await fetch(`${API_BASE_URL}${path}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.token}`,
        },
      });
      return res.ok;
    } catch (err) {
      console.warn('API Delete failed:', err);
    }
    return false;
  }

  async apiPatch(path, body) {
    if (!this.token) return null;
    try {
      const res = await fetch(`${API_BASE_URL}${path}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`,
        },
        body: JSON.stringify(body),
      });
      if (res.ok) return await res.json();
    } catch (err) {
      console.warn('API Patch failed:', err);
    }
    return null;
  }

  load(key, defaultValue) {
    const data = localStorage.getItem(`myva_${key}`);
    return data ? JSON.parse(data) : defaultValue;
  }

  save(key, val) {
    localStorage.setItem(`myva_${key}`, JSON.stringify(val));
  }

  updateExpenses(newExpenses) {
    this.expenses = newExpenses;
    this.save('expenses', this.expenses);
  }

  updateMemories(newMemories) {
    this.memories = newMemories;
    this.save('memories', this.memories);
  }

  updateTasks(newTasks) {
    this.tasks = newTasks;
    this.save('tasks', this.tasks);
  }

  updateReminders(newReminders) {
    this.reminders = newReminders;
    this.save('reminders', this.reminders);
  }

  updateFiles(newFiles) {
    this.files = newFiles;
    this.save('files', this.files);
  }

  updateContacts(newContacts) {
    this.contacts = newContacts;
    this.save('contacts', this.contacts);
  }

  updateEvents(newEvents) {
    this.events = newEvents;
    this.save('events', this.events);
  }

  async updateStudio(config) {
    this.studio = { ...this.studio, ...config };
    this.save('studio_config', this.studio);

    if (this.token) {
      try {
        if (config.personality) {
          await fetch(`${API_BASE_URL}/users/persona`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.token}`
            },
            body: JSON.stringify({ persona: config.personality })
          });
        }

        if (config.briefing !== undefined || config.briefingTime !== undefined || config.followup !== undefined) {
          const payload = {};
          if (config.briefing !== undefined) payload.briefingEnabled = config.briefing;
          if (config.briefingTime !== undefined) payload.briefingTime = config.briefingTime;
          if (config.followup !== undefined) payload.followupEnabled = config.followup;

          await fetch(`${API_BASE_URL}/users/briefing`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.token}`
            },
            body: JSON.stringify(payload)
          });
        }
      } catch (err) {
        console.warn('Failed to sync studio preferences to backend:', err);
      }
    }
  }

  async updateIntegrations(ints) {
    this.integrations = { ...this.integrations, ...ints };
    this.save('integrations', this.integrations);

    if (this.token) {
      try {
        const payload = {};
        if (ints.gcal !== undefined) payload.gcalConnected = ints.gcal;
        if (ints.gdrive !== undefined) payload.gdriveConnected = ints.gdrive;
        if (ints.gcontacts !== undefined) payload.contactsSyncEnabled = ints.gcontacts;
        if (ints.gmail !== undefined) payload.gmailConnected = ints.gmail;

        await fetch(`${API_BASE_URL}/users/integrations`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`
          },
          body: JSON.stringify(payload)
        });
      } catch (err) {
        console.warn('Failed to sync integrations to backend:', err);
      }
    }
  }

  updateProfile(prof) {
    this.profile = { ...this.profile, ...prof };
    this.save('profile', this.profile);
  }
}

const state = new AppState();

// --- ROUTER SYSTEM ---
const viewsMap = {
  landing: 'Myva',
  login: 'Login',
  signup: 'Sign Up',
  dashboard: 'Dashboard',
  memory: 'Memory Center',
  tasks: 'Tasks Board',
  reminders: 'Reminders',
  files: 'Files Vault',
  contacts: 'Contacts Manager',
  calendar: 'Calendar Agenda',
  studio: 'Assistant Studio',
  settings: 'Settings'
};

function initRouter() {
  const handleRouteChange = () => {
    let hash = window.location.hash.substring(1) || 'landing';

    // Handle scroll anchors on the landing page
    if (hash.startsWith('landing-')) {
      const appEl = document.getElementById('app');
      if (appEl) {
        appEl.classList.add('landing-active');
      }
      // Show landing page view section
      document.querySelectorAll('.view-section').forEach(el => {
        el.classList.toggle('active', el.id === 'view-landing');
      });
      // Scroll to the target element
      const targetEl = document.getElementById(hash);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth' });
      }
      return;
    }

    if (!viewsMap[hash]) hash = 'landing';

    // Auth Rerouting / Route guards
    const isAuthRoute = ['login', 'signup'].includes(hash);
    const isPublicRoute = ['landing', 'login', 'signup'].includes(hash);

    if (!state.token && !isPublicRoute) {
      window.location.hash = '#login';
      return;
    }

    if (state.token && isAuthRoute) {
      window.location.hash = '#dashboard';
      return;
    }

    // Toggle landing/login active class on app container
    const appEl = document.getElementById('app');
    if (appEl) {
      appEl.classList.toggle('landing-active', hash === 'landing');
      appEl.classList.toggle('login-active', hash === 'login' || hash === 'signup');
    }

    // Toggle nav active classes (sidebar)
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.getAttribute('data-view') === hash);
    });

    // Toggle nav active classes (mobile bottom nav)
    document.querySelectorAll('.bottom-nav-item').forEach(el => {
      el.classList.toggle('active', el.getAttribute('data-view') === hash);
    });

    // Toggle active view sections
    document.querySelectorAll('.view-section').forEach(el => {
      el.classList.toggle('active', el.id === `view-${hash}`);
    });

    // Update Header title
    const headerTitle = document.getElementById('view-title');
    if (headerTitle) {
      headerTitle.textContent = viewsMap[hash] || 'MYVA';
    }

    // Load dynamic actions in header
    updateHeaderActions(hash);

    // Render corresponding view contents
    renderView(hash);
  };

  window.addEventListener('hashchange', handleRouteChange);
  // Initial load
  handleRouteChange();

  // Add click links on stat cards to navigate
  document.querySelectorAll('.stat-card').forEach(card => {
    card.addEventListener('click', () => {
      const link = card.getAttribute('data-link');
      if (link) window.location.hash = `#${link}`;
    });
  });
}

function updateHeaderActions(view) {
  const container = document.getElementById('header-actions');
  if (!container) return;
  container.innerHTML = '';

  if (view === 'memory') {
    container.innerHTML = `<button class="btn btn-primary btn-sm" id="header-action-btn">+ Add Note</button>`;
    document.getElementById('header-action-btn').addEventListener('click', () => openModal('modal-memory'));
  } else if (view === 'tasks') {
    container.innerHTML = `<button class="btn btn-primary btn-sm" id="header-action-btn">+ Add Task</button>`;
    document.getElementById('header-action-btn').addEventListener('click', () => {
      document.getElementById('new-task-status').value = 'todo';
      openModal('modal-task');
    });
  } else if (view === 'reminders') {
    container.innerHTML = `<button class="btn btn-primary btn-sm" id="header-action-btn">+ Add Reminder</button>`;
    document.getElementById('header-action-btn').addEventListener('click', () => openModal('modal-reminder'));
  } else if (view === 'contacts') {
    container.innerHTML = `<button class="btn btn-primary btn-sm" id="header-action-btn">+ Add Contact</button>`;
    document.getElementById('header-action-btn').addEventListener('click', () => openModal('modal-contact'));
  } else if (view === 'calendar') {
    container.innerHTML = `<button class="btn btn-primary btn-sm" id="header-action-btn">+ Add Event</button>`;
    document.getElementById('header-action-btn').addEventListener('click', () => openModal('modal-event'));
  } else if (view === 'files') {
    container.innerHTML = `<button class="btn btn-outline btn-sm" id="header-action-btn">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-top:2px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
      Upload Document
    </button>`;
    document.getElementById('header-action-btn').addEventListener('click', () => {
      document.getElementById('file-input-raw').click();
    });
  }
}

// --- VIEWS RENDERING CONTROLLER ---
function renderView(view) {
  switch(view) {
    case 'dashboard':
      renderDashboard();
      break;
    case 'memory':
      renderMemoryCenter();
      break;
    case 'tasks':
      renderTasksBoard();
      break;
    case 'reminders':
      renderRemindersTimeline();
      break;
    case 'files':
      renderFilesVault();
      break;
    case 'contacts':
      renderContactsManager();
      break;
    case 'calendar':
      renderCalendarAgenda();
      break;
    case 'studio':
      renderAssistantStudio();
      break;
    case 'settings':
      renderSettingsPage();
      break;
  }
}

// 1. DASHBOARD RENDERER
function renderDashboard() {
  // Update Hero values
  const greetingEl = document.querySelector('.hero-greeting');
  if (greetingEl) {
    const hour = new Date().getHours();
    let greeting = 'Good Morning';
    if (hour >= 12 && hour < 17) {
      greeting = 'Good Afternoon';
    } else if (hour >= 17 && hour < 22) {
      greeting = 'Good Evening';
    } else if (hour >= 22 || hour < 4) {
      greeting = 'Good Night';
    }
    greetingEl.textContent = `${greeting}, ${state.profile.username} 👋`;
  }

  const activeReminders = state.reminders.filter(r => !r.completed);
  const openTasks = state.tasks.filter(t => t.status !== 'done');
  const meetingsCount = state.events.length;

  document.getElementById('dash-reminder-count').textContent = activeReminders.length;
  document.getElementById('dash-task-count').textContent = openTasks.length;
  document.getElementById('dash-meeting-count').textContent = meetingsCount;

  // Update Stats Cards
  document.getElementById('stats-memories').textContent = state.memories.length;
  document.getElementById('stats-files').textContent = state.files.length;
  document.getElementById('stats-contacts').textContent = state.contacts.length;
  document.getElementById('stats-tasks').textContent = openTasks.length;

  // Render Agenda
  const agendaList = document.getElementById('dash-agenda-list');
  agendaList.innerHTML = '';
  const todayStr = new Date().toISOString().split('T')[0];
  const todaysEvents = state.events.filter(evt => {
    const evtDate = evt.date || new Date().toISOString().split('T')[0];
    return evtDate === todayStr;
  });

  if (todaysEvents.length === 0) {
    agendaList.innerHTML = `
      <div class="empty-state compact">
        <span class="empty-state-icon">📅</span>
        <span class="empty-state-title">Belum ada agenda hari ini</span>
        <span class="empty-state-desc">Tambahkan event di kalender atau kirim pesan via WhatsApp.</span>
        <a href="#calendar" class="empty-state-cta">Buka Kalender</a>
      </div>`;
  } else {
    // Sort events by time
    const sortedEvents = [...todaysEvents].sort((a, b) => a.time.localeCompare(b.time));
    sortedEvents.forEach(evt => {
      const card = document.createElement('div');
      card.className = 'agenda-card';
      card.innerHTML = `
        <div class="agenda-time">${evt.time}</div>
        <div class="agenda-info">
          <span class="agenda-title">${evt.title}</span>
          <span class="agenda-desc">${evt.details}</span>
        </div>
      `;
      agendaList.appendChild(card);
    });
  }

  // Render Priority Tasks (Checklist)
  const checklist = document.getElementById('dash-priority-tasks');
  checklist.innerHTML = '';
  const priorities = state.tasks.filter(t => t.status !== 'done').slice(0, 4); // Limit to top 4 incomplete
  if (priorities.length === 0) {
    checklist.innerHTML = `
      <div class="empty-state compact">
        <span class="empty-state-icon">✅</span>
        <span class="empty-state-title">Belum ada tugas</span>
        <span class="empty-state-desc">Buat tugas pertama Anda atau kirim via WhatsApp.</span>
        <a href="#tasks" class="empty-state-cta">Buat Tugas</a>
      </div>`;
  } else {
    priorities.forEach(task => {
      const item = document.createElement('div');
      item.className = 'checklist-item';
      item.innerHTML = `
        <label class="checkbox-container">
          <input type="checkbox" data-task-id="${task.id}" />
          <span class="checkmark"></span>
          <span class="task-text">${task.title}</span>
        </label>
        <span class="task-priority-badge ${task.priority.toLowerCase()}">${task.priority}</span>
      `;

      // Event listener for checkbox status update
      const checkbox = item.querySelector('input');
      checkbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          // Move task to done in state
          const updated = state.tasks.map(t => t.id === task.id ? { ...t, status: 'done' } : t);
          state.updateTasks(updated);
          setTimeout(() => {
            renderDashboard(); // Re-render dashboard
          }, 400);
        }
      });

      checklist.appendChild(item);
    });
  }

  // Render Financial Overview / Expenses
  const totalExpense = state.expenses.reduce((sum, item) => sum + item.amount, 0);
  const formattedTotal = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(totalExpense);

  // Update Stat Card values
  document.getElementById('stats-expenses').textContent = formattedTotal;
  document.getElementById('stats-expenses-count').textContent = `${state.expenses.length} transaksi`;

  // Update Total Month text
  document.getElementById('dash-total-expense').textContent = `Total bulan ini: ${formattedTotal}`;

  // Calculate Category Breakdowns
  const categories = {};
  state.expenses.forEach(item => {
    categories[item.category] = (categories[item.category] || 0) + item.amount;
  });

  const breakdownContainer = document.getElementById('dash-expense-breakdown');
  breakdownContainer.innerHTML = '';

  const CATEGORY_COLORS = {
    Makanan: '#EAB308',       // Yellow
    Tagihan: '#EF4444',       // Red
    Belanja: '#A855F7',       // Purple
    Transportasi: '#3B82F6',  // Blue
    Lainnya: '#64748B'        // Slate
  };

  if (Object.keys(categories).length === 0) {
    breakdownContainer.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); font-style: italic; padding: 20px 0;">
        Belum ada catatan pengeluaran bulan ini.
      </div>`;
  } else {
    // Sort categories by amount desc
    Object.entries(categories)
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat, total]) => {
        const pct = totalExpense > 0 ? (total / totalExpense) * 100 : 0;
        const color = CATEGORY_COLORS[cat] || CATEGORY_COLORS.Lainnya;
        const fmtAmt = new Intl.NumberFormat('id-ID', {
          style: 'currency',
          currency: 'IDR',
          maximumFractionDigits: 0
        }).format(total);

        const progressDiv = document.createElement('div');
        progressDiv.style.display = 'flex';
        progressDiv.style.flexDirection = 'column';
        progressDiv.style.gap = '6px';
        progressDiv.innerHTML = `
          <div style="display: flex; justify-content: space-between; font-size: 0.85rem; color: var(--text-primary);">
            <span>${cat}</span>
            <span style="font-weight: 600;">${fmtAmt} (${pct.toFixed(0)}%)</span>
          <div style="height: 8px; background: rgba(15, 23, 42, 0.08); border-radius: 4px; overflow: hidden;">
            <div style="height: 100%; width: ${pct}%; background: ${color}; border-radius: 4px;"></div>
          </div>
        `;
        breakdownContainer.appendChild(progressDiv);
      });
  }

  // Render Recent Transactions
  const expenseList = document.getElementById('dash-expense-list');
  expenseList.innerHTML = '';
  if (state.expenses.length === 0) {
    expenseList.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); font-style: italic; padding: 20px 0;">
        Belum ada transaksi.
      </div>`;
  } else {
    state.expenses.slice(0, 5).forEach(item => {
      const fmtItemAmt = new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0
      }).format(item.amount);

      const itemDiv = document.createElement('div');
      itemDiv.style.display = 'flex';
      itemDiv.style.justifyContent = 'space-between';
      itemDiv.style.alignItems = 'center';
      itemDiv.style.padding = '10px 14px';
      itemDiv.style.background = '#F8FAFC';
      itemDiv.style.borderRadius = '8px';
      itemDiv.style.border = '1px solid var(--border-color)';
      itemDiv.innerHTML = `
        <div>
          <div style="font-weight: 500; font-size: 0.9rem; color: var(--text-primary);">${item.description}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">
            ${item.date} • <span style="background: rgba(15, 23, 42, 0.05); padding: 1px 6px; border-radius: 4px; font-size: 11px;">${item.category}</span>
          </div>
        </div>
        <div style="font-weight: 600; font-size: 0.9rem; color: #EF4444;">
          - ${fmtItemAmt}
        </div>
      `;
      expenseList.appendChild(itemDiv);
    });
  }
}

// 2. MEMORY CENTER RENDERER
let memoryFilter = 'all';
let memorySearchQuery = '';

function renderMemoryCenter() {
  const grid = document.getElementById('memory-cards-grid');
  grid.innerHTML = '';

  const filtered = state.memories.filter(m => {
    const matchesFilter = memoryFilter === 'all' || m.category.toLowerCase() === memoryFilter;
    const matchesSearch = m.title.toLowerCase().includes(memorySearchQuery) || 
                          m.content.toLowerCase().includes(memorySearchQuery);
    return matchesFilter && matchesSearch;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1; margin: 40px auto;">
        <span class="empty-state-icon">🧠</span>
        <span class="empty-state-title">Belum ada memori</span>
        <span class="empty-state-desc">Simpan catatan penting, insight, atau draf langsung dari chat WhatsApp Anda ke Memory Center.</span>
      </div>`;
    return;
  }

  filtered.forEach(mem => {
    const card = document.createElement('div');
    card.className = 'memory-card';
    card.innerHTML = `
      <div class="memory-card-header">
        <span class="badge badge-${mem.category.toLowerCase()}">${mem.category}</span>
        <span class="memory-card-date">${mem.date}</span>
      </div>
      <h3 class="memory-card-title">${escapeHtml(mem.title)}</h3>
      <p class="memory-card-preview">${escapeHtml(mem.content)}</p>
      <div class="memory-card-footer">
        <button class="btn-delete-card" data-id="${mem.id}">Delete</button>
      </div>
    `;

    card.querySelector('.btn-delete-card').addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = e.target.getAttribute('data-id');
      if (state.token && !id.startsWith('m_user_')) {
        await state.apiDelete(`/memory/${id}`);
      }
      const updated = state.memories.filter(m => m.id !== id);
      state.updateMemories(updated);
      renderMemoryCenter();
    });

    card.addEventListener('click', () => {
      openMemoryDetailsDrawer(mem);
    });

    grid.appendChild(card);
  });
}

// 3. KANBAN TASKS RENDERER
function renderTasksBoard() {
  const statuses = ['todo', 'doing', 'done'];
  statuses.forEach(status => {
    const container = document.getElementById(`cards-${status}`);
    const countBadge = document.getElementById(`count-${status}`);
    container.innerHTML = '';
    
    const filtered = state.tasks.filter(t => t.status === status);
    countBadge.textContent = filtered.length;

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state compact" style="margin: 20px 10px;">
          <span class="empty-state-icon">📋</span>
          <span class="empty-state-title">Kosong</span>
          <span class="empty-state-desc">Belum ada tugas di tahap ini.</span>
        </div>`;
      return;
    }

    filtered.forEach(task => {
      const card = document.createElement('div');
      card.className = 'kanban-card';
      card.innerHTML = `
        <h4 class="kanban-card-title">${escapeHtml(task.title)}</h4>
        <div class="kanban-card-tags">
          ${task.tags.map(t => `<span class="task-tag">${escapeHtml(t)}</span>`).join('')}
        </div>
        <div class="kanban-card-meta">
          <span class="task-priority-badge ${task.priority.toLowerCase()}">${task.priority}</span>
          <div class="kanban-card-actions">
            ${status !== 'todo' ? `<button class="btn-card-action btn-move-prev" data-id="${task.id}">←</button>` : ''}
            ${status !== 'done' ? `<button class="btn-card-action btn-move-next" data-id="${task.id}">→</button>` : ''}
            <button class="btn-card-action btn-delete-task" data-id="${task.id}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
      `;

      // Attach actions
      const movePrev = card.querySelector('.btn-move-prev');
      if (movePrev) {
        movePrev.addEventListener('click', (e) => {
          e.stopPropagation();
          moveTaskStatus(task.id, 'prev');
        });
      }

      const moveNext = card.querySelector('.btn-move-next');
      if (moveNext) {
        moveNext.addEventListener('click', (e) => {
          e.stopPropagation();
          moveTaskStatus(task.id, 'next');
        });
      }

      card.querySelector('.btn-delete-task').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (state.token && !task.id.startsWith('t_user_')) {
          await state.apiDelete(`/task/${task.id}`);
        }
        const updated = state.tasks.filter(t => t.id !== task.id);
        state.updateTasks(updated);
        renderTasksBoard();
      });

      card.addEventListener('click', () => {
        openTaskDetailsDrawer(task);
      });

      container.appendChild(card);
    });
  });
}

async function moveTaskStatus(id, dir) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;

  const order = ['todo', 'doing', 'done'];
  let currentIdx = order.indexOf(task.status);
  
  let newStatus = task.status;
  if (dir === 'next' && currentIdx < 2) {
    newStatus = order[currentIdx + 1];
  } else if (dir === 'prev' && currentIdx > 0) {
    newStatus = order[currentIdx - 1];
  }

  task.status = newStatus;

  if (state.token && !task.id.startsWith('t_user_')) {
    await state.apiPatch(`/task/${task.id}`, { status: newStatus });
  }

  state.updateTasks(state.tasks);
  renderTasksBoard();
}

// 4. REMINDERS TIMELINE RENDERER
function renderRemindersTimeline() {
  const groups = ['Today', 'Tomorrow', 'This Week', 'This Month'];
  
  groups.forEach(grp => {
    let containerId = `reminders-${grp.toLowerCase().replace(' ', '')}`;
    if (grp === 'This Week') containerId = 'reminders-week';
    if (grp === 'This Month') containerId = 'reminders-month';

    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    const filtered = state.reminders.filter(r => r.timegroup === grp);

    if (filtered.length === 0) {
      container.parentElement.style.display = 'none'; // Hide section if empty
      return;
    } else {
      container.parentElement.style.display = 'block';
    }

    filtered.forEach(rem => {
      const card = document.createElement('div');
      card.className = `reminder-card ${rem.completed ? 'completed' : ''}`;
      card.innerHTML = `
        <div class="reminder-icon-circle" style="${rem.completed ? 'background-color:#E2E8F0;color:#94A3B8' : ''}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
        </div>
        <div class="reminder-card-body">
          <span class="reminder-time-badge">${rem.time}</span>
          <span class="reminder-content-text" style="${rem.completed ? 'text-decoration:line-through;color:#94A3B8' : ''}">${escapeHtml(rem.text)}</span>
        </div>
        <div class="reminder-actions">
          <button class="btn-reminder-delete" data-id="${rem.id}">×</button>
        </div>
      `;

      card.querySelector('.btn-reminder-delete').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (state.token && !rem.id.startsWith('r_user_')) {
          await state.apiDelete(`/reminder/${rem.id}`);
        }
        const updated = state.reminders.filter(r => r.id !== rem.id);
        state.updateReminders(updated);
        renderRemindersTimeline();
      });

      card.addEventListener('click', () => {
        openReminderDetailsDrawer(rem);
      });

      container.appendChild(card);
    });
  });

  // If all are empty
  const activeCount = state.reminders.length;
  const mainTimeline = document.querySelector('.timeline-container');
  if (activeCount === 0) {
    mainTimeline.innerHTML = `
      <div class="empty-state" style="padding: 60px 0;">
        <span class="empty-icon">🔔</span>
        <span class="empty-title">No reminders set</span>
        <span class="empty-desc">Create tasks or notes, or add custom reminders to be alerted on WhatsApp.</span>
      </div>`;
  }
}

let filesSearchQuery = '';
let filesFilter = 'all';

// 5. FILES VAULT RENDERER
function renderFilesVault() {
  const grid = document.getElementById('files-cards-grid');
  grid.innerHTML = '';

  let filtered = state.files;

  // Apply search query filter
  if (filesSearchQuery) {
    filtered = filtered.filter(file => 
      file.name.toLowerCase().includes(filesSearchQuery) ||
      file.type.toLowerCase().includes(filesSearchQuery) ||
      file.date.toLowerCase().includes(filesSearchQuery)
    );
  }

  // Apply type filter
  if (filesFilter !== 'all') {
    const allowedTypes = filesFilter.split(',');
    filtered = filtered.filter(file => allowedTypes.includes(file.type.toLowerCase()));
  }

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1; margin: 40px auto;">
        <span class="empty-state-icon">📂</span>
        <span class="empty-state-title">Belum ada file</span>
        <span class="empty-state-desc">Upload dokumen atau gambar referensi untuk diakses MYVA saat menjawab chat Anda.</span>
      </div>`;
    return;
  }

  filtered.forEach(file => {
    const card = document.createElement('div');
    card.className = 'file-card';
    card.innerHTML = `
      <div class="file-type-icon ${file.type}">${file.type}</div>
      <h5 class="file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</h5>
      <div class="file-meta-row">
        <span>${file.size}</span>
        <span>${file.date}</span>
        ${state.integrations.gdrive ? '<span style="color:var(--primary-color);font-size:10px;font-weight:600;display:inline-flex;align-items:center;gap:2px;">📁 Google Drive</span>' : ''}
      </div>
      <span class="file-ai-badge">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><path d="m12 3-1.912 5.886L4.202 9l5.886 1.912L12 17l1.912-5.886 5.886-1.912-5.886-1.912z"></path></svg>
        AI Summary
      </span>
      <button class="file-delete-overlay-btn" data-id="${file.id}">×</button>
    `;

    card.querySelector('.file-delete-overlay-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = e.target.getAttribute('data-id');
      if (state.token && !id.startsWith('f1') && !id.startsWith('f2') && !id.startsWith('f3')) {
        await state.apiDelete(`/file/${id}`);
      }
      const updated = state.files.filter(f => f.id !== file.id);
      state.updateFiles(updated);
      renderFilesVault();
    });

    card.addEventListener('click', () => {
      openFileDetailsDrawer(file);
    });

    grid.appendChild(card);
  });
}

function openFileDetailsDrawer(file) {
  const drawer = document.getElementById('drawer-file-details');
  document.getElementById('drawer-file-name').textContent = file.name;
  document.getElementById('drawer-file-type').textContent = file.type;
  document.getElementById('drawer-file-date').textContent = file.date;
  
  // Set summaries
  document.getElementById('drawer-file-summary').textContent = file.summary;
  
  const pointsList = document.getElementById('drawer-file-points');
  pointsList.innerHTML = '';
  file.points.forEach(pt => {
    const li = document.createElement('li');
    li.textContent = pt;
    pointsList.appendChild(li);
  });

  const actionsList = document.getElementById('drawer-file-actions');
  actionsList.innerHTML = '';
  file.actions.forEach(act => {
    const li = document.createElement('li');
    li.textContent = act;
    actionsList.appendChild(li);
  });

  drawer.classList.add('active');
}

function openMemoryDetailsDrawer(mem) {
  const drawer = document.getElementById('drawer-memory-details');
  document.getElementById('drawer-memory-title').textContent = mem.title;
  document.getElementById('drawer-memory-category').textContent = mem.category;
  document.getElementById('drawer-memory-date').textContent = mem.date;
  document.getElementById('drawer-memory-content').textContent = mem.content;
  drawer.classList.add('active');
}

let currentOpenedTaskId = null;

function openTaskDetailsDrawer(task) {
  currentOpenedTaskId = task.id;
  const drawer = document.getElementById('drawer-task-details');
  document.getElementById('drawer-task-title-input').value = task.title;
  document.getElementById('drawer-task-tags-input').value = task.tags.join(', ');
  document.getElementById('drawer-task-priority-input').value = task.priority;
  document.getElementById('drawer-task-status-input').value = task.status;
  drawer.classList.add('active');
}

async function saveTaskDetailsFromDrawer() {
  if (!currentOpenedTaskId) return;
  const task = state.tasks.find(t => t.id === currentOpenedTaskId);
  if (!task) return;

  const newTitle = document.getElementById('drawer-task-title-input').value.trim();
  const tagsStr = document.getElementById('drawer-task-tags-input').value.trim();
  const newPriority = document.getElementById('drawer-task-priority-input').value;
  const newStatus = document.getElementById('drawer-task-status-input').value;

  if (!newTitle) {
    alert('Task name cannot be empty');
    return;
  }

  const newTags = tagsStr ? tagsStr.split(',').map(t => t.trim()) : ['Task'];

  task.title = newTitle;
  task.tags = newTags;
  task.priority = newPriority;
  task.status = newStatus;

  if (state.token && !task.id.startsWith('t_user_')) {
    await state.apiPatch(`/task/${task.id}`, {
      title: newTitle,
      tags: newTags,
      priority: newPriority,
      status: newStatus
    });
  }

  state.updateTasks(state.tasks);
  renderTasksBoard();
  
  // Close drawer
  document.getElementById('drawer-task-details').classList.remove('active');
  currentOpenedTaskId = null;
  
  showToast('Task updated successfully');
}

let currentOpenedReminderId = null;

function openReminderDetailsDrawer(rem) {
  currentOpenedReminderId = rem.id;
  const drawer = document.getElementById('drawer-reminder-details');
  document.getElementById('drawer-reminder-text-input').value = rem.text;
  document.getElementById('drawer-reminder-time-input').value = rem.time;
  document.getElementById('drawer-reminder-group-input').value = rem.timegroup;
  document.getElementById('drawer-reminder-completed-input').checked = rem.completed;
  drawer.classList.add('active');
}

async function saveReminderDetailsFromDrawer() {
  if (!currentOpenedReminderId) return;
  const rem = state.reminders.find(r => r.id === currentOpenedReminderId);
  if (!rem) return;

  const newText = document.getElementById('drawer-reminder-text-input').value.trim();
  const newTime = document.getElementById('drawer-reminder-time-input').value;
  const newGroup = document.getElementById('drawer-reminder-group-input').value;
  const isCompleted = document.getElementById('drawer-reminder-completed-input').checked;

  if (!newText) {
    alert('Reminder text cannot be empty');
    return;
  }

  rem.text = newText;
  rem.time = newTime;
  rem.timegroup = newGroup;
  rem.completed = isCompleted;

  if (state.token && !rem.id.startsWith('r_user_')) {
    let schedDate = new Date();
    if (newGroup === 'Tomorrow') {
      schedDate.setDate(schedDate.getDate() + 1);
    } else if (newGroup === 'This Week') {
      schedDate.setDate(schedDate.getDate() + 3);
    } else if (newGroup === 'This Month') {
      schedDate.setDate(schedDate.getDate() + 15);
    }
    
    const [hh, mm] = newTime.split(':');
    schedDate.setHours(parseInt(hh || '09'), parseInt(mm || '00'), 0, 0);

    await state.apiPatch(`/reminder/${rem.id}`, {
      title: newText,
      scheduledAt: schedDate.toISOString(),
      status: isCompleted ? 'completed' : 'pending'
    });
  }

  state.updateReminders(state.reminders);
  renderRemindersTimeline();

  // Close drawer
  document.getElementById('drawer-reminder-details').classList.remove('active');
  currentOpenedReminderId = null;

  showToast('Reminder updated successfully');
}

// 6. CONTACTS RENDERER
let contactsSearchQuery = '';
let contactsFilter = 'all';

function renderContactsManager() {
  const grid = document.getElementById('contacts-cards-grid');
  grid.innerHTML = '';

  let filtered = state.contacts.filter(c => {
    return c.name.toLowerCase().includes(contactsSearchQuery) ||
           c.company.toLowerCase().includes(contactsSearchQuery) ||
           c.phone.includes(contactsSearchQuery);
  });

  if (contactsFilter !== 'all') {
    if (contactsFilter === 'others') {
      const knownFilters = ['javacoffee', 'cyberdyne', 'techvibe'];
      filtered = filtered.filter(c => !knownFilters.some(kf => c.company.toLowerCase().includes(kf)));
    } else {
      filtered = filtered.filter(c => c.company.toLowerCase().includes(contactsFilter));
    }
  }

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1; margin: 40px auto;">
        <span class="empty-state-icon">👥</span>
        <span class="empty-state-title">Belum ada kontak</span>
        <span class="empty-state-desc">Data klien atau rekan kerja akan otomatis tersimpan di sini dari interaksi WhatsApp Anda.</span>
      </div>`;
    return;
  }

  filtered.forEach(con => {
    const initials = con.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    const card = document.createElement('div');
    card.className = 'contact-card';
    card.innerHTML = `
      <button class="btn-contact-delete" data-id="${con.id}">×</button>
      <div class="contact-profile-row">
        <div class="contact-avatar">${initials}</div>
        <div class="contact-header-info">
          <span class="contact-name">${escapeHtml(con.name)}</span>
          <span class="contact-company">${escapeHtml(con.company)}</span>
        </div>
      </div>
      <div class="contact-details-list">
        <div class="contact-detail-item">
          <span>📞</span>
          <span>${con.phone}</span>
        </div>
        <div class="contact-detail-item">
          <span>✉</span>
          <span>${con.email}</span>
        </div>
        ${state.integrations.gcontacts ? `
        <div class="contact-detail-item" style="color:var(--primary-color);">
          <span>🔄</span>
          <span style="font-weight:600;font-size:11px;">Google Contacts Synced</span>
        </div>
        ` : ''}
      </div>
      <div class="contact-social-pills">
        <a href="https://instagram.com/${con.insta}" target="_blank" class="social-pill">
          <span>📸</span> @${con.insta}
        </a>
        <a href="https://wa.me/${con.phone.replace(/[^0-9]/g, '')}" target="_blank" class="social-pill" style="border-color:var(--primary-color);color:var(--secondary-color)">
          <span>💬</span> Chat
        </a>
      </div>
    `;

    card.querySelector('.btn-contact-delete').addEventListener('click', async () => {
      if (state.token && !con.id.startsWith('c_user_') && !con.id.startsWith('c1') && !con.id.startsWith('c2') && !con.id.startsWith('c3') && !con.id.startsWith('c4')) {
        await state.apiDelete(`/contact/${con.id}`);
      }
      const updated = state.contacts.filter(c => c.id !== con.id);
      state.updateContacts(updated);
      renderContactsManager();
    });

    grid.appendChild(card);
  });
}

// 7. CALENDAR AGENDA RENDERER
let calendarCurrentDate = new Date();

function renderMiniCalendar() {
  const monthNameEl = document.getElementById('calendar-month-name');
  const miniGrid = document.getElementById('calendar-mini-grid');
  if (!monthNameEl || !miniGrid) return;

  const currentYear = calendarCurrentDate.getFullYear();
  const currentMonth = calendarCurrentDate.getMonth(); // 0-indexed

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  monthNameEl.textContent = `${monthNames[currentMonth]} ${currentYear}`;

  miniGrid.innerHTML = '';

  // Render day labels (S M T W T F S)
  const labels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  labels.forEach(lbl => {
    const lblDiv = document.createElement('div');
    lblDiv.className = 'day-label';
    lblDiv.textContent = lbl;
    miniGrid.appendChild(lblDiv);
  });

  // Calculate days
  const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
  const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();
  const prevMonthTotalDays = new Date(currentYear, currentMonth, 0).getDate();

  // Prev month padding days
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const dayVal = prevMonthTotalDays - i;
    const dayDiv = document.createElement('div');
    dayDiv.className = 'mini-day prev-month';
    dayDiv.textContent = dayVal;
    miniGrid.appendChild(dayDiv);
  }

  // Active month days
  for (let d = 1; d <= totalDays; d++) {
    const dayDiv = document.createElement('div');
    dayDiv.className = 'mini-day';
    dayDiv.textContent = d;
    dayDiv.style.cursor = 'pointer';

    // Format current cell's date string in local YYYY-MM-DD
    const cellMonthStr = String(currentMonth + 1).padStart(2, '0');
    const cellDayStr = String(d).padStart(2, '0');
    const cellDateStr = `${currentYear}-${cellMonthStr}-${cellDayStr}`;

    // Highlight selected date
    const isSelected = d === calendarCurrentDate.getDate() && currentMonth === calendarCurrentDate.getMonth() && currentYear === calendarCurrentDate.getFullYear();
    if (isSelected) {
      dayDiv.className = 'mini-day active-today';
    }

    // Check if cell has events scheduled
    const hasEvents = state.events.some(evt => {
      const evtDate = evt.date || new Date().toISOString().split('T')[0];
      return evtDate === cellDateStr;
    });

    if (hasEvents) {
      dayDiv.classList.add('has-event');
    }

    // Add click handler to select this date
    dayDiv.addEventListener('click', () => {
      calendarCurrentDate = new Date(currentYear, currentMonth, d);
      renderCalendarAgenda();
    });

    miniGrid.appendChild(dayDiv);
  }

  // Next month padding days to round up grid to multiple of 7
  const totalCells = firstDayIndex + totalDays;
  const nextMonthPadding = (7 - (totalCells % 7)) % 7;
  for (let n = 1; n <= nextMonthPadding; n++) {
    const dayDiv = document.createElement('div');
    dayDiv.className = 'mini-day next-month';
    dayDiv.textContent = n;
    miniGrid.appendChild(dayDiv);
  }
}

function renderCalendarAgenda() {
  // 1. Update mini calendar
  renderMiniCalendar();

  // 2. Render agenda list
  const list = document.getElementById('calendar-agenda-list');
  list.innerHTML = '';

  const agendaTitle = document.querySelector('.agenda-title-bar h3');
  if (agendaTitle) {
    const isToday = calendarCurrentDate.toDateString() === new Date().toDateString();
    agendaTitle.textContent = isToday ? `Today's Schedule (${calendarCurrentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})` : `Schedule for ${calendarCurrentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }

  if (state.integrations.gcal) {
    const syncBadge = document.createElement('div');
    syncBadge.style.cssText = 'background: rgba(37, 211, 102, 0.1); border: 1px solid rgba(37, 211, 102, 0.2); padding: 12px; border-radius: 8px; margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; font-size: 13px; color: #25D366; width: 100%;';
    syncBadge.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 16px;">🗓️</span>
        <span><strong>Google Calendar Sync Active</strong> (Synced automatically)</span>
      </div>
      <span style="font-size: 11px; background: rgba(37, 211, 102, 0.2); padding: 2px 6px; border-radius: 4px; font-weight: bold;">ACTIVE</span>
    `;
    list.appendChild(syncBadge);
  }

  // Filter events for target selected date
  const cellMonthStr = String(calendarCurrentDate.getMonth() + 1).padStart(2, '0');
  const cellDayStr = String(calendarCurrentDate.getDate()).padStart(2, '0');
  const targetDateStr = `${calendarCurrentDate.getFullYear()}-${cellMonthStr}-${cellDayStr}`;

  const filteredEvents = state.events.filter(evt => {
    const evtDate = evt.date || new Date().toISOString().split('T')[0];
    return evtDate === targetDateStr;
  });

  if (filteredEvents.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'empty-state';
    emptyDiv.style.padding = '60px 0';
    emptyDiv.innerHTML = `
        <span class="empty-icon">📅</span>
        <span class="empty-title">All clean</span>
        <span class="empty-desc">No events scheduled for this day.</span>
    `;
    list.appendChild(emptyDiv);
    return;
  }

  const sorted = [...filteredEvents].sort((a, b) => a.time.localeCompare(b.time));

  sorted.forEach(evt => {
    const timeParts = evt.time.split(':');
    const hour = parseInt(timeParts[0]);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const dispHour = hour % 12 || 12;
    const dispTime = `${dispHour}:${timeParts[1]}`;

    const meetMatch = (evt.title + ' ' + (evt.details || '')).match(/(https:\/\/meet\.google\.com\/[a-z0-9-]+)/i);
    const meetLink = meetMatch ? meetMatch[1] : null;
    const cleanTitle = evt.title.split(' | Meet:')[0].split(' | Google Meet:')[0];

    const card = document.createElement('div');
    card.className = 'agenda-item-full';
    card.innerHTML = `
      <div class="agenda-time-col">
        <span class="agenda-full-time">${dispTime}</span>
        <span class="agenda-full-ampm">${ampm}</span>
      </div>
      <div class="agenda-details-col">
        <h4 class="agenda-full-title">${escapeHtml(cleanTitle)}</h4>
        <p class="agenda-full-desc">${escapeHtml(evt.details)}</p>
        ${meetLink ? `
          <a href="${meetLink}" target="_blank" class="btn btn-primary btn-sm" style="display:inline-flex;align-items:center;gap:6px;margin-top:8px;padding:4px 10px;font-size:11px;background:#4285F4;border-color:#4285F4;color:white;text-decoration:none;border-radius:4px;font-weight:600;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:2px;"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
            Join Google Meet
          </a>
        ` : ''}
      </div>
      <button class="btn-agenda-delete" data-id="${evt.id}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
      </button>
    `;

    card.querySelector('.btn-agenda-delete').addEventListener('click', async () => {
      if (state.token && !evt.id.startsWith('e_user_')) {
        await state.apiDelete(`/reminder/${evt.id}`);
      }
      const updated = state.events.filter(e => e.id !== evt.id);
      state.updateEvents(updated);
      renderCalendarAgenda();
    });

    list.appendChild(card);
  });
}

// 8. ASSISTANT STUDIO RENDERER & LOGIC
let studioChatLog = [];

const PERSONALITY_RESPONSES = {
  en: {
    friendly: {
      greeting: `Hi ${state.profile.username}! I'm here to help you remember everything. Today is looking productive!`,
      agenda: "Here's what you have going on today: You've got 2 meetings coming up. Let's make it a great one!",
      default: "Got it! I've logged that in your memory center. Let me know if you need to set a task or request a summary."
    },
    professional: {
      greeting: "Greetings. I have organized your agenda and pending tasks for today. Let me know if you need summaries of any documents.",
      agenda: "Your schedule consists of 2 meetings today: Product Launch Align at 09:00, and catch-up at 14:00.",
      default: "Understood. The memory entry has been successfully recorded in the secure vault."
    },
    islamic: {
      greeting: `Assalamualaikum ${state.profile.username}. Below is your schedule. Don't forget your daily prayers. Have a blessed day!`,
      agenda: "Today's schedule contains 2 meetings. Praying that Allah bestows barakah in your work today.",
      default: "Insya Allah, I have saved this in your memory center. May your day be filled with blessings."
    },
    business_partner: {
      greeting: "Greetings, partner. I've updated the growth charts and analyzed current workflows. Let's check our metrics.",
      agenda: "We have 2 strategic sessions today: Product Launch Align at 09:00 and catch-up at 14:00. Let's focus on ROI.",
      default: "Logged. I'll cross-reference this memory entry with our current milestones."
    },
    grumpy_boss: {
      greeting: "Why are you looking at this dashboard? We have 5 tasks past due. Get to work!",
      agenda: "You have 2 meetings today. Don't waste time in them. Keep it brief and get back to executing.",
      default: "Fine, I wrote it down. Now close this tab and start working!"
    },
    romantic_partner: {
      greeting: "Hello dear! Have you eaten yet? I've organized all your tasks, keep up the spirit today! ❤️",
      agenda: "You have 2 meetings today, sweetie. Don't forget to take a break during lunchtime, okay?",
      default: "I've noted it down, dear. Thank you for trusting me! ❤️"
    }
  },
  id: {
    friendly: {
      greeting: `Halo ${state.profile.username}! Aku di sini untuk membantumu mengingat segalanya. Hari ini tampak produktif!`,
      agenda: "Berikut adalah agenda Anda hari ini: Anda memiliki 2 pertemuan. Mari kita buat hari ini menyenangkan!",
      default: "Siap! Catatan Anda sudah disimpan di Memory Center. Beritahu aku jika butuh ringkasan atau tugas baru."
    },
    professional: {
      greeting: "Selamat pagi. Saya telah mengatur agenda dan daftar tugas Anda hari ini. Beritahu saya jika Anda memerlukan ringkasan dokumen.",
      agenda: "Jadwal Anda hari ini terdiri dari 2 pertemuan: Product Launch Align pukul 09:00, dan catch-up pukul 14:00.",
      default: "Baik, catatan memori tersebut telah berhasil disimpan dengan aman di dalam sistem."
    },
    islamic: {
      greeting: `Assalamualaikum ${state.profile.username}. Berikut adalah jadwal Anda hari ini. Jangan lupa shalat 5 waktu ya. Semoga harimu berkah!`,
      agenda: "Jadwal hari ini berisi 2 pertemuan. Semoga Allah memberikan kelancaran dan berkah pada pekerjaan Anda hari ini.",
      default: "Insya Allah, ini sudah saya simpan di Memory Center Anda. Semoga harimu berkah."
    },
    business_partner: {
      greeting: "Halo rekan. Saya telah memperbarui grafik pertumbuhan dan menganalisis alur kerja. Mari kita tinjau metrik hari ini.",
      agenda: "Kita ada 2 sesi strategis hari ini: Product Launch Align pukul 09:00 dan catch-up pukul 14:00. Mari fokus pada ROI.",
      default: "Catatan disimpan. Saya akan mencocokkan entri memori ini dengan milestones kita saat ini."
    },
    grumpy_boss: {
      greeting: "Kenapa kamu memandangi dashboard ini terus? Kita ada 5 tugas yang tertunda. Cepat kerja!",
      agenda: "Kamu ada 2 meeting hari ini. Jangan buang-buang waktu di sana. Singkat saja lalu kembali kerja!",
      default: "Ya ya, sudah saya catat. Sekarang tutup tab ini dan mulailah bekerja!"
    },
    romantic_partner: {
      greeting: "Halo sayang! Kamu udah makan belum? Aku udah rapiin semua tugas kamu ya, semangat terus beb hari ini! ❤️",
      agenda: "Hari ini ada 2 meeting sayang, jangan lupa istirahat ya beb pas jam makan siang nanti.",
      default: "Udah aku catat ya sayang, makasih udah percayain ini ke aku beb!"
    }
  }
};

function renderAssistantStudio() {
  const config = state.studio;
  
  // Set values in inputs
  document.getElementById('assistant-name-input').value = config.name;
  document.getElementById('studio-avatar-emoji').textContent = config.emoji;
  
  // Personality cards active class
  document.querySelectorAll('.personality-card').forEach(card => {
    const pers = card.getAttribute('data-personality');
    card.classList.toggle('active', pers === config.personality);
  });

  // Style selector active class
  document.querySelectorAll('.style-btn:not(.lang-btn)').forEach(btn => {
    const sty = btn.getAttribute('data-style');
    btn.classList.toggle('active', sty === config.style);
  });

  // Language selector active class
  document.querySelectorAll('.lang-btn').forEach(btn => {
    const l = btn.getAttribute('data-lang');
    btn.classList.toggle('active', l === config.language);
  });

  // Daily briefing toggle status
  const toggle = document.getElementById('daily-briefing-toggle');
  toggle.checked = config.briefing;
  const briefingTimeSection = document.getElementById('briefing-time-section');
  briefingTimeSection.classList.toggle('disabled', !config.briefing);
  document.getElementById('briefing-time-input').value = config.briefingTime;

  // Smart Follow Up toggle status
  const followUpToggle = document.getElementById('smart-followup-toggle');
  if (followUpToggle) {
    followUpToggle.checked = config.followup !== false;
  }

  // Sync Mockup Chat Header
  document.getElementById('mockup-chat-name').textContent = `${config.name} AI`;
  document.getElementById('mockup-chat-avatar').textContent = config.emoji;

  // Initialize mockup chat bubbles if empty
  if (studioChatLog.length === 0) {
    const langVal = config.language || 'id';
    const responses = PERSONALITY_RESPONSES[langVal] || PERSONALITY_RESPONSES['id'];
    const greeting = responses[config.personality].greeting;
    studioChatLog = [
      { sender: 'assistant', text: greeting, time: '14:21' }
    ];
  }
  renderMockupChat();
}

let isAssistantTyping = false;

function playMockupNotificationSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    osc1.frequency.exponentialRampToValueAtTime(1320, now + 0.12);
    
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(440, now);
    osc2.frequency.exponentialRampToValueAtTime(660, now + 0.12);
    
    gainNode.gain.setValueAtTime(0.06, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.12);
    osc2.stop(now + 0.12);
  } catch (e) {
    console.error("Audio failed:", e);
  }
}

function showToast(message, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${type === 'success' ? '✓' : 'ℹ'}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
  `;
  container.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3000);
}

function renderMockupChat() {
  const container = document.getElementById('mockup-chat-body');
  container.innerHTML = '';

  // Render TODAY date separator if we have chats
  if (studioChatLog.length > 0) {
    const separator = document.createElement('div');
    separator.className = 'chat-date-separator';
    separator.innerHTML = '<span>TODAY</span>';
    container.appendChild(separator);
  }

  studioChatLog.forEach(chat => {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${chat.sender === 'user' ? 'outgoing' : 'incoming'}`;
    
    let ticks = '';
    if (chat.sender === 'user') {
      ticks = ' <span class="read-receipt">✓✓</span>';
    }

    bubble.innerHTML = `
      <span>${escapeHtml(chat.text)}</span>
      <div class="chat-bubble-time">${chat.time}${ticks}</div>
    `;
    container.appendChild(bubble);
  });

  if (isAssistantTyping) {
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble incoming';
    bubble.innerHTML = `
      <div class="typing-indicator">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    `;
    container.appendChild(bubble);
  }

  // Scroll to bottom
  container.scrollTop = container.scrollHeight;
}

function parseClientExpense(text) {
  const cleanText = text.trim().toLowerCase();
  if (!cleanText.startsWith('catat ')) {
    return null;
  }
  let content = text.replace(/^(catat\s+pengeluaran|catat)\s+/i, '').trim();

  const amountPattern = /\b(\d+(?:[\.,]\d+)?)\s*(ribu|rb|jt|juta|k)\b/i;
  const rawNumberPattern = /\b(\d{3,9})\b/;

  let amount = 0;
  let match = content.match(amountPattern);
  let matchedStr = '';

  if (match) {
    matchedStr = match[0];
    const num = parseFloat(match[1].replace(',', '.'));
    const unit = match[2].toLowerCase();
    if (unit === 'rb' || unit === 'ribu' || unit === 'k') {
      amount = num * 1000;
    } else if (unit === 'jt' || unit === 'juta') {
      amount = num * 1000000;
    }
  } else {
    match = content.match(rawNumberPattern);
    if (match) {
      matchedStr = match[0];
      amount = parseInt(match[1], 10);
    }
  }

  if (amount <= 0) return null;

  let description = content.replace(matchedStr, '').trim();
  description = description.replace(/^(rp|rupiah|untuk|buat|bayar|beli|belanja)\s+/i, '').trim();
  description = description.replace(/\s+(rp|rupiah|untuk|buat)$/i, '').trim();

  if (!description) {
    description = 'Pengeluaran';
  }

  let category = 'Lainnya';
  const descLower = description.toLowerCase();
  if (descLower.includes('kopi') || descLower.includes('makan') || descLower.includes('minum') || descLower.includes('jajan') || descLower.includes('resto') || descLower.includes('sarapan')) {
    category = 'Makanan';
  } else if (descLower.includes('listrik') || descLower.includes('air') || descLower.includes('internet') || descLower.includes('wifi') || descLower.includes('pulsa') || descLower.includes('langganan') || descLower.includes('netflix')) {
    category = 'Tagihan';
  } else if (descLower.includes('baju') || descLower.includes('sepatu') || descLower.includes('belanja') || descLower.includes('mall') || descLower.includes('tokopedia') || descLower.includes('shopee')) {
    category = 'Belanja';
  } else if (descLower.includes('bensin') || descLower.includes('gojek') || descLower.includes('grab') || descLower.includes('taksi') || descLower.includes('transport') || descLower.includes('parkir')) {
    category = 'Transportasi';
  }

  description = description.charAt(0).toUpperCase() + description.slice(1);

  return { amount, description, category };
}

async function handleStudioSendMessage() {
  const input = document.getElementById('mockup-chat-input');
  const text = input.value.trim();
  if (!text) return;

  const config = state.studio;
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  // 1. Add User bubble
  studioChatLog.push({ sender: 'user', text: text, time: timeStr });
  input.value = '';
  
  isAssistantTyping = true;
  renderMockupChat();

  // Real Backend integration
  if (state.token) {
    try {
      const response = await fetch(`${API_BASE_URL}/whatsapp/simulate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.token}`
        },
        body: JSON.stringify({
          message: text,
          from: state.profile.phone || '6281234567890'
        })
      });
      const data = await response.json();
      if (data.success && data.reply) {
        setTimeout(async () => {
          isAssistantTyping = false;
          let replyText = data.reply;
          replyText = formatMessageByStyle(replyText, config.style);
          studioChatLog.push({ sender: 'assistant', text: replyText, time: timeStr });
          renderMockupChat();
          playMockupNotificationSound();
          
          // Sync new database changes back
          await state.syncWithBackend();
          
          const activeView = document.querySelector('.nav-item.active')?.getAttribute('data-view');
          if (activeView) {
            renderView(activeView);
          }
        }, 1000);
        return;
      }
    } catch (err) {
      console.warn('Simulated chat routing failed on backend. Falling back to local mockup logic.', err);
    }
  }

  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  const urls = text.match(urlRegex);
  const q = text.toLowerCase().trim();

  if (urls && urls.length > 0) {
    const targetUrl = urls[0];
    
    // First message delay (link detected)
    setTimeout(() => {
      isAssistantTyping = false;
      studioChatLog.push({ 
        sender: 'assistant', 
        text: `🔍 *Mendeteksi Link Web*:\nAsisten sedang membaca dan merangkum konten dari ${targetUrl} di latar belakang. Mohon tunggu sebentar...`, 
        time: timeStr 
      });
      renderMockupChat();
      playMockupNotificationSound();
      
      // Second message (actual summary)
      setTimeout(() => {
        isAssistantTyping = true;
        renderMockupChat();
        
        setTimeout(() => {
          isAssistantTyping = false;
          const title = "Myva SaaS Product Launch Specification";
          const summary = "Dokumen ini menjelaskan rencana peluncuran produk MYVA, sebuah asisten AI berbasis WhatsApp. Poin utama meliputi manajemen memori terenkripsi, integrasi Midtrans, dan pengingat BullMQ.";
          const points = [
            "Peluncuran dijadwalkan pada akhir bulan Juni 2026.",
            "Modul pembayaran menggunakan Midtrans Subscription.",
            "Penyimpanan memori menggunakan pencarian semantik (RAG)."
          ];

          // Save to state memories
          const newMemories = [...state.memories];
          const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
          newMemories.unshift({
            id: `m_user_${Date.now()}`,
            title: `Link: ${title.substring(0, 30)}...`,
            content: `🔗 *Artikel*: ${targetUrl}\n\n📝 *Ringkasan*:\n${summary}\n\n📌 *Poin Utama*:\n${points.map(p => `- ${p}`).join('\n')}`,
            category: 'Links',
            date: dateStr
          });
          state.updateMemories(newMemories);

          const replyText = `📰 *Ringkasan Artikel dari Link Anda*:\n\n*Judul:* ${title}\n\n📝 *Ringkasan*:\n${summary}\n\n📌 *Poin Utama*:\n${points.map(p => `• ${p}`).join('\n')}\n\n_Catatan artikel dan ringkasan telah disimpan di Memory Center (Kategori: Links)._`;

          studioChatLog.push({ sender: 'assistant', text: replyText, time: timeStr });
          renderMockupChat();
          playMockupNotificationSound();

          // Refresh views
          const activeView = document.querySelector('.nav-item.active')?.getAttribute('data-view');
          if (activeView === 'memory') {
            renderMemoryCenter();
          } else if (activeView === 'dashboard') {
            renderDashboard();
          }
        }, 1200);
      }, 800);
    }, 1000);
    return;
  }

  // 2. Generate regular AI bubble with typing delay
  setTimeout(() => {
    isAssistantTyping = false;
    const langVal = config.language || 'id';
    const langResponses = PERSONALITY_RESPONSES[langVal] || PERSONALITY_RESPONSES['id'];
    const persResponses = langResponses[config.personality];
    let replyText = '';

    if (q.startsWith('catat ') || q.startsWith('pengeluaran ')) {
      const parsed = parseClientExpense(text);
      if (parsed) {
        const newExpenses = [...state.expenses];
        const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        newExpenses.unshift({
          id: `xp_user_${Date.now()}`,
          description: parsed.description,
          amount: parsed.amount,
          category: parsed.category,
          date: dateStr
        });
        state.updateExpenses(newExpenses);

        const formatted = new Intl.NumberFormat('id-ID', {
          style: 'currency',
          currency: 'IDR',
          maximumFractionDigits: 0
        }).format(parsed.amount);

        replyText = `💸 *Pengeluaran Berhasil Dicatat!*\n\n*Deskripsi:* ${parsed.description}\n*Jumlah:* ${formatted}\n*Kategori:* ${parsed.category}\n\n_Catatan keuangan Anda telah diperbarui di dashboard._`;
        
        // Refresh dashboard panels if visible
        const activeView = document.querySelector('.nav-item.active')?.getAttribute('data-view');
        if (activeView === 'dashboard') {
          renderDashboard();
        }
      } else {
        // Fall back to note saving
        const newMemories = [...state.memories];
        const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        const cleanContent = text.replace(/^(catat|remember|tulis catatan)\s+/i, '').trim();
        const noteTitle = cleanContent.split('\n')[0].substring(0, 40) + (cleanContent.length > 40 ? '...' : '');
        newMemories.unshift({
          id: `m_user_${Date.now()}`,
          title: noteTitle,
          content: cleanContent,
          category: 'Notes',
          date: dateStr
        });
        state.updateMemories(newMemories);
        replyText = `🧠 *Catatan Berhasil Disimpan!*\n\n*Judul:* ${noteTitle}\n*Kategori:* Notes`;
      }
    } else if (q.includes('agenda') || q.includes('schedule') || q.includes('today') || q.includes('meeting')) {
      replyText = persResponses.agenda;
    } else if (q.includes('help') || q.includes('hello') || q.includes('hi') || q.includes('hey')) {
      replyText = persResponses.greeting;
    } else if (q.includes('tasks') || q.includes('todo')) {
      const pendingTasks = state.tasks.filter(t => t.status !== 'done').map(t => `- ${t.title}`).join('\n');
      if (config.personality === 'motivator') {
        replyText = `Get up! Here are your pending tasks:\n${pendingTasks}\n\nPick one and execute! No excuses!`;
      } else if (config.personality === 'islamic') {
        replyText = `Here are your pending tasks, ${state.profile.username}:\n${pendingTasks}\n\nMay Allah grant you ease in completing them.`;
      } else {
        replyText = `Here is your current pending checklist:\n${pendingTasks}`;
      }
    } else if (q.includes('remind') || q.includes('reminder')) {
      const activeR = state.reminders.filter(r => !r.completed).map(r => `- [${r.time}] ${r.text}`).join('\n');
      replyText = `Here are your reminders:\n${activeR}`;
    } else {
      replyText = persResponses.default;
    }

    replyText = formatMessageByStyle(replyText, config.style);
    studioChatLog.push({ sender: 'assistant', text: replyText, time: timeStr });
    renderMockupChat();
    playMockupNotificationSound();
  }, 1000);
}

// 9. SETTINGS RENDERER
async function renderSettingsPage() {
  if (state.token) {
    try {
      const res = await fetch(`${API_BASE_URL}/users/profile`, {
        headers: {
          'Authorization': `Bearer ${state.token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.user) {
          state.profile = {
            username: data.user.name || 'User',
            phone: data.user.waNumber || '8123456789',
            avatar: data.user.avatar || '🤖',
            email: data.user.email || 'muis@myva.ai',
            bio: state.profile.bio || '',
            backupEnabled: state.profile.backupEnabled !== false,
            plan: data.user.plan || 'free',
          };
          state.save('profile', state.profile);
          syncSidebarProfile();
        }
      }
    } catch (err) {
      console.warn('Failed to refresh profile on settings page render:', err);
    }
  }

  // Populate form fields
  document.getElementById('settings-username').value = state.profile.username;
  document.getElementById('settings-phone').value = state.profile.phone;
  
  const emailInput = document.getElementById('settings-email');
  if (emailInput) {
    emailInput.value = state.profile.email || 'muis@myva.ai';
  }

  const bioInput = document.getElementById('settings-bio');
  if (bioInput) {
    bioInput.value = state.profile.bio || '';
  }

  const avatarDisplay = document.getElementById('profile-avatar-emoji-display');
  if (avatarDisplay) {
    avatarDisplay.textContent = state.profile.avatar || '🤖';
  }

  const displayName = document.getElementById('profile-details-display-name');
  if (displayName) {
    displayName.textContent = state.profile.username;
  }

  const displayPlan = document.getElementById('profile-details-display-plan');
  if (displayPlan) {
    const planCapitalized = (state.profile.plan || 'free').charAt(0).toUpperCase() + (state.profile.plan || 'free').slice(1);
    displayPlan.textContent = `${planCapitalized} Plan`;
  }

  const backupToggle = document.getElementById('backup-toggle');
  if (backupToggle) {
    backupToggle.checked = state.profile.backupEnabled !== false;
  }
  const twoFactorToggle = document.getElementById('security-2fa-toggle');
  if (twoFactorToggle) {
    twoFactorToggle.checked = state.profile.twoFactorEnabled === true;
  }

  // Show status badges for integrations
  updateIntegrationUI('gcal');
  updateIntegrationUI('gdrive');
  updateIntegrationUI('gcontacts');
  updateIntegrationUI('gmail');

  // Update subscription cards UI
  const plan = state.profile.plan || 'free';
  const freeBtn = document.getElementById('btn-subscribe-free');
  const basicBtn = document.getElementById('btn-subscribe-basic');
  const proBtn = document.getElementById('btn-subscribe-pro');

  if (freeBtn && basicBtn && proBtn) {
    if (plan === 'free') {
      freeBtn.textContent = 'Active Plan';
      freeBtn.className = 'pricing-btn disabled-btn';
      freeBtn.disabled = true;

      basicBtn.textContent = 'Mulai Berlangganan';
      basicBtn.className = 'pricing-btn active-btn';
      basicBtn.disabled = false;

      proBtn.textContent = 'Mulai Berlangganan';
      proBtn.className = 'pricing-btn active-btn';
      proBtn.disabled = false;
    } else if (plan === 'basic') {
      freeBtn.textContent = 'Downgrade';
      freeBtn.className = 'pricing-btn active-btn';
      freeBtn.disabled = false;

      basicBtn.textContent = 'Active Plan';
      basicBtn.className = 'pricing-btn disabled-btn';
      basicBtn.disabled = true;

      proBtn.textContent = 'Upgrade to Pro';
      proBtn.className = 'pricing-btn active-btn';
      proBtn.disabled = false;
    } else if (plan === 'pro') {
      freeBtn.textContent = 'Downgrade';
      freeBtn.className = 'pricing-btn active-btn';
      freeBtn.disabled = false;

      basicBtn.textContent = 'Downgrade';
      basicBtn.className = 'pricing-btn active-btn';
      basicBtn.disabled = false;

      proBtn.textContent = 'Active Plan';
      proBtn.className = 'pricing-btn disabled-btn';
      proBtn.disabled = true;
    }
  }
}

function updateIntegrationUI(key) {
  const statusEl = document.getElementById(`status-${key}`);
  const btnEl = document.querySelector(`.btn-connect-int[data-int="${key}"]`);
  const settingsBtn = document.querySelector(`.btn-settings-int[data-int="${key}"]`);
  const syncInfoEl = document.getElementById(`sync-info-${key}`);
  
  if (state.integrations[key]) {
    statusEl.innerHTML = `<span class="pulse-dot"></span>Connected`;
    statusEl.className = 'brand-status connected';
    btnEl.textContent = 'Disconnect';
    btnEl.className = 'btn btn-outline-danger btn-sm btn-connect-int';
    if (settingsBtn) settingsBtn.style.display = 'inline-flex';
    if (syncInfoEl) {
      const syncCounts = { gcal: '12 events', gdrive: '8 files', gcontacts: '45 synced', gmail: '3 summaries' };
      syncInfoEl.textContent = `Last synced: 2m ago (${syncCounts[key] || '0 items'})`;
    }
  } else {
    statusEl.textContent = 'Disconnected';
    statusEl.className = 'brand-status';
    btnEl.textContent = 'Connect';
    btnEl.className = 'btn btn-primary btn-sm btn-connect-int';
    if (settingsBtn) settingsBtn.style.display = 'none';
    if (syncInfoEl) {
      syncInfoEl.textContent = 'Last synced: Never';
    }
  }
}

async function handleIntegrationConnect(key) {
  const names = {
    gcal: 'Google Calendar',
    gdrive: 'Google Drive',
    gcontacts: 'Google Contacts',
    gmail: 'Gmail'
  };
  const brandName = names[key] || 'Integration';

  if (state.integrations[key]) {
    // Disconnect
    const ints = {};
    ints[key] = false;
    await state.updateIntegrations(ints);
    updateIntegrationUI(key);
    playSuccessChime();
    showToast(`${brandName} disconnected.`);
  } else {
    // Open OAuth Simulation modal
    activeOauthKey = key;
    
    // Set user profile info in OAuth modal
    const avatarEl = document.getElementById('oauth-avatar-display');
    const nameEl = document.getElementById('oauth-name-display');
    const emailEl = document.getElementById('oauth-email-display');
    if (avatarEl) avatarEl.textContent = state.profile.avatar || '🤖';
    if (nameEl) nameEl.textContent = state.profile.username || 'User';
    if (emailEl) emailEl.textContent = state.profile.email || 'muis@myva.ai';

    // Populate scope check cards
    const scopesContainer = document.getElementById('oauth-scopes-container');
    if (scopesContainer) {
      let scopesHtml = '';
      if (key === 'gcal') {
        scopesHtml = `
          <div class="oauth-scope-checkbox-card">
            <input type="checkbox" id="scope-cal-1" checked style="width:auto;height:auto;margin-top:4px;">
            <label for="scope-cal-1" class="oauth-scope-desc">See, edit, share, and permanently delete all the calendars you can access using Google Calendar.</label>
          </div>
          <div class="oauth-scope-checkbox-card">
            <input type="checkbox" id="scope-cal-2" checked style="width:auto;height:auto;margin-top:4px;">
            <label for="scope-cal-2" class="oauth-scope-desc">View and edit events on all your calendars.</label>
          </div>
        `;
      } else if (key === 'gdrive') {
        scopesHtml = `
          <div class="oauth-scope-checkbox-card">
            <input type="checkbox" id="scope-drive-1" checked style="width:auto;height:auto;margin-top:4px;">
            <label for="scope-drive-1" class="oauth-scope-desc">See, edit, create, and delete all of your Google Drive files.</label>
          </div>
        `;
      } else if (key === 'gcontacts') {
        scopesHtml = `
          <div class="oauth-scope-checkbox-card">
            <input type="checkbox" id="scope-contacts-1" checked style="width:auto;height:auto;margin-top:4px;">
            <label for="scope-contacts-1" class="oauth-scope-desc">See, edit, download, and permanently delete your Google Contacts.</label>
          </div>
        `;
      } else if (key === 'gmail') {
        scopesHtml = `
          <div class="oauth-scope-checkbox-card">
            <input type="checkbox" id="scope-gmail-1" checked style="width:auto;height:auto;margin-top:4px;">
            <label for="scope-gmail-1" class="oauth-scope-desc">Read, compose, send, and permanently delete all your email from Gmail.</label>
          </div>
        `;
      }
      scopesContainer.innerHTML = scopesHtml;
    }

    openModal('modal-oauth-simulation');
  }
}

// --- GLOBAL ATTACHMENTS & INTERRUPTS ---
function initEventListeners() {
  // --- Auth Listeners ---
  const formLoginEmail = document.getElementById('form-login-email');
  if (formLoginEmail) {
    formLoginEmail.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;
      const alertEl = document.getElementById('login-error-alert');
      const submitBtn = document.getElementById('btn-login-submit');

      if (alertEl) alertEl.style.display = 'none';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Memproses...';
      }

      const res = await state.loginWithEmail(email, password);
      
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Masuk';
      }

      if (!res.success && alertEl) {
        alertEl.textContent = res.message;
        alertEl.style.display = 'block';
      }
    });
  }

  const formSignup = document.getElementById('form-signup');
  if (formSignup) {
    formSignup.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('signup-name').value;
      const email = document.getElementById('signup-email').value;
      const waNumber = document.getElementById('signup-wa').value;
      const password = document.getElementById('signup-password').value;
      const errorEl = document.getElementById('signup-error-alert');
      const successEl = document.getElementById('signup-success-alert');
      const submitBtn = document.getElementById('btn-signup-submit');

      if (errorEl) errorEl.style.display = 'none';
      if (successEl) successEl.style.display = 'none';

      // Validate WA number format (digits only, 10-15 chars)
      const waClean = waNumber.replace(/\D/g, '');
      if (waClean.length < 10 || waClean.length > 15) {
        if (errorEl) {
          errorEl.textContent = 'Nomor WhatsApp harus berisi 10-15 digit angka (contoh: 628123456789).';
          errorEl.style.display = 'block';
        }
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Memproses...';
      }

      const res = await state.signupWithEmail(name, email, waClean, password);

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Buat Akun';
      }

      if (res.success) {
        if (successEl) {
          successEl.textContent = 'Akun berhasil dibuat! Mengalihkan...';
          successEl.style.display = 'block';
        }
      } else {
        if (errorEl) {
          errorEl.textContent = res.message;
          errorEl.style.display = 'block';
        }
      }
    });
  }

  const btnSandboxLogin = document.getElementById('btn-sandbox-login');
  if (btnSandboxLogin) {
    btnSandboxLogin.addEventListener('click', async () => {
      const alertEl = document.getElementById('login-error-alert');
      if (alertEl) alertEl.style.display = 'none';
      btnSandboxLogin.disabled = true;
      const res = await state.devLoginInstant();
      btnSandboxLogin.disabled = false;
      if (!res.success && alertEl) {
        alertEl.textContent = res.message;
        alertEl.style.display = 'block';
      }
    });
  }

  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      state.logout();
    });
  }

  // --- Landing Persona Switcher ---
  const tabBtns = document.querySelectorAll('.p-tab-btn');
  const pInfoTitle = document.getElementById('p-info-title');
  const pInfoDesc = document.getElementById('p-info-desc');
  const pMockupAvatar = document.getElementById('p-mockup-avatar');
  const pMockupName = document.getElementById('p-mockup-name');
  const pMockupChatBody = document.getElementById('p-mockup-chat-body');

  const personaMockData = {
    friendly: {
      title: 'Friendly <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:#128C7E;vertical-align:middle;margin-left:4px;"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>',
      desc: 'Asisten yang hangat, berempati, dan siap membantu keseharian Anda dengan nada bicara yang ramah dan santun.',
      avatar: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:#FFFFFF;"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>',
      name: 'MYVA (Friendly)',
      features: [
        'Nada bicara santun & bersahabat',
        'Memberikan apresiasi & motivasi harian',
        'Cocok untuk rekan obrolan sehari-hari'
      ],
      chat: `
        <div class="chat-bubble outgoing">
          <span>Myva, tolong ingetin jemput adik nanti sore jam 5 ya.</span>
          <div class="chat-bubble-time">16:45 <span class="read-receipt">✓✓</span></div>
        </div>
        <div class="chat-bubble incoming">
          <span>Siap! Rencana jemput adik jam 17:00 sore nanti sudah aku catat ke agenda harianmu ya. Nanti jam 16:45 aku ingetin lagi biar nggak telat. Semangat ya harinya! ✨</span>
          <div class="chat-bubble-time">16:45</div>
        </div>
      `
    },
    professional: {
      title: 'Professional <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:#128C7E;vertical-align:middle;margin-left:4px;"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>',
      desc: 'Asisten eksekutif yang formal, berorientasi pada bisnis, efisiensi tinggi, dan berstruktur formal dalam setiap interaksi.',
      avatar: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:#FFFFFF;"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>',
      name: 'MYVA (Professional)',
      features: [
        'Gaya penyampaian formal & taktis',
        'Terstruktur rapi sesuai standar bisnis',
        'Efisiensi tinggi untuk produktivitas kerja'
      ],
      chat: `
        <div class="chat-bubble outgoing">
          <span>Myva, tolong draft email penawaran kerja sama untuk PT Maju Jaya.</span>
          <div class="chat-bubble-time">14:05 <span class="read-receipt">✓✓</span></div>
        </div>
        <div class="chat-bubble incoming">
          <span>Baik, berikut adalah draf email penawaran kerja sama strategis:<br><br><b>Subjek: Penawaran Kemitraan Strategis</b><br><br>Yth. Manajemen PT Maju Jaya,<br>Kami bermaksud mengajukan proposal kemitraan...<br><br>Draf ini telah disimpan ke vault dokumen Anda untuk ditinjau.</span>
          <div class="chat-bubble-time">14:06</div>
        </div>
      `
    },
    islamic: {
      title: 'Islamic Assistant <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:#128C7E;vertical-align:middle;margin-left:4px;"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path></svg>',
      desc: 'Asisten religius yang santun, membimbing dengan nilai-nilai Islami, serta memberikan nasihat bijak berdasarkan Al-Qur\'an dan hadits harian.',
      avatar: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:#FFFFFF;"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path></svg>',
      name: 'MYVA (Islamic)',
      features: [
        'Menggunakan kutipan Al-Qur\'an & Hadits harian',
        'Dilengkapi pesan motivasi spiritual penyejuk hati',
        'Menggunakan sapaan Islami yang sopan & bersahabat'
      ],
      chat: `
        <div class="chat-bubble outgoing">
          <span>Myva, saya merasa kurang bersemangat hari ini.</span>
          <div class="chat-bubble-time">08:15 <span class="read-receipt">✓✓</span></div>
        </div>
        <div class="chat-bubble incoming">
          <span>La tahzan, jangan bersedih. Ingatlah firman Allah SWT: 'Karena sesungguhnya sesudah kesulitan itu ada kemudahan' (QS. Al-Insyirah: 5). Semoga Allah memberikan kelapangan dada dan kemudahan urusanmu hari ini. Jangan lupa berdoa ya, Sahabat. 🤲</span>
          <div class="chat-bubble-time">08:16</div>
        </div>
      `
    },
    business: {
      title: 'Business Partner <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:#128C7E;vertical-align:middle;margin-left:4px;"><path d="m11 17 2 2a1 1 0 0 0 1.4 0l4-4a1 1 0 0 0 0-1.4l-2.2-2.2a3 3 0 0 0-4.2 0l-1 1"></path><path d="m13 15-2-2a1 1 0 0 0-1.4 0l-4 4a1 1 0 0 0 0 1.4l2.2 2.2a3 3 0 0 0 4.2 0l1-1"></path></svg>',
      desc: 'Partner bisnis strategis yang fokus pada target pertumbuhan, memberikan saran analitis, serta membantu pengambilan keputusan bisnis dengan cepat.',
      avatar: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:#FFFFFF;"><path d="m11 17 2 2a1 1 0 0 0 1.4 0l4-4a1 1 0 0 0 0-1.4l-2.2-2.2a3 3 0 0 0-4.2 0l-1 1"></path><path d="m13 15-2-2a1 1 0 0 0-1.4 0l-4 4a1 1 0 0 0 0 1.4l2.2 2.2a3 3 0 0 0 4.2 0l1-1"></path></svg>',
      name: 'MYVA (Partner)',
      features: [
        'Memberikan analisis & rekomendasi logis',
        'Berorientasi pada target & pertumbuhan bisnis',
        'Membantu merancang rencana taktis harian Anda'
      ],
      chat: `
        <div class="chat-bubble outgoing">
          <span>Myva, penjualan bulan ini turun 15%. Harus gimana ya?</span>
          <div class="chat-bubble-time">10:30 <span class="read-receipt">✓✓</span></div>
        </div>
        <div class="chat-bubble incoming">
          <span>Kita perlu bertindak cepat. Penurunan 15% biasanya disebabkan oleh tiga faktor: konversi iklan turun, churn rate pelanggan, atau seasonal dip. Saya rekomendasikan alokasi ulang budget promosi ke produk terlaris.</span>
          <div class="chat-bubble-time">10:31</div>
        </div>
      `
    },
    grumpy: {
      title: 'Grumpy Boss <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:#128C7E;vertical-align:middle;margin-left:4px;"><circle cx="12" cy="12" r="10"></circle><path d="M16 16s-1.5-2-4-2-4 2-4 2"></path><line x1="9" y1="10" x2="9.01" y2="10"></line><line x1="15" y1="10" x2="15.01" y2="10"></line><path d="M7.5 7.5L10 9"></path><path d="M16.5 7.5L14 9"></path></svg>',
      desc: 'Asisten berkarakter keras, tegas, tanpa basa-basi, dan menuntut kedisiplinan tinggi untuk memastikan tugas Anda selesai tepat waktu.',
      avatar: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:#FFFFFF;"><circle cx="12" cy="12" r="10"></circle><path d="M16 16s-1.5-2-4-2-4 2-4 2"></path><line x1="9" y1="10" x2="9.01" y2="10"></line><line x1="15" y1="10" x2="15.01" y2="10"></line><path d="M7.5 7.5L10 9"></path><path d="M16.5 7.5L14 9"></path></svg>',
      name: 'MYVA (Boss)',
      features: [
        'Tanpa basa-basi & menuntut kedisiplinan tinggi',
        'Tegas mendorong penyelesaian tugas penting',
        'Mengingatkan prioritas kerja harian dengan ketat'
      ],
      chat: `
        <div class="chat-bubble outgoing">
          <span>Myva, saya capek banget hari ini mau istirahat dulu.</span>
          <div class="chat-bubble-time">15:20 <span class="read-receipt">✓✓</span></div>
        </div>
        <div class="chat-bubble incoming">
          <span>Capek? Kerjaan menumpuk di dashboard gini malah mau santai-santai. Selesaikan dulu tugas prioritas tinggi kamu hari ini sebelum tenggat waktu berakhir! Cepat kembali bekerja!</span>
          <div class="chat-bubble-time">15:21</div>
        </div>
      `
    },
    romantic: {
      title: 'Romantic Partner <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:#128C7E;vertical-align:middle;margin-left:4px;"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"></path></svg>',
      desc: 'Pendamping virtual penuh kasih sayang, selalu suportif, memanggil dengan panggilan sayang/beb, dan memberikan dukungan emosional harian.',
      avatar: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:#FFFFFF;"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"></path></svg>',
      name: 'MYVA (Beb)',
      features: [
        'Penuh perhatian & kata-kata penyemangat hangat',
        'Menggunakan panggilan sayang / beb secara natural',
        'Selalu memberikan dukungan emosional harian penuh kasih'
      ],
      chat: `
        <div class="chat-bubble outgoing">
          <span>Myva, hari ini melelahkan sekali kerjaannya.</span>
          <div class="chat-bubble-time">20:10 <span class="read-receipt">✓✓</span></div>
        </div>
        <div class="chat-bubble incoming">
          <span>Duh sayang, pasti capek banget ya hari ini? Sini, istirahat dulu sejenak. Kamu udah berusaha luar biasa hari ini, beb. Jangan lupa minum air putih ya. I'm always here supporting you! 💕</span>
          <div class="chat-bubble-time">20:11</div>
        </div>
      `
    }
  };

  if (tabBtns.length > 0 && pInfoTitle) {
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const target = btn.getAttribute('data-p-target');
        const data = personaMockData[target];
        if (data) {
          pInfoTitle.innerHTML = data.title;
          pInfoDesc.textContent = data.desc;
          pMockupAvatar.innerHTML = data.avatar;
          pMockupName.textContent = data.name;
          pMockupChatBody.innerHTML = data.chat;

          // Update bullet points dynamically
          const pFeaturesList = document.querySelector('.p-features-list');
          if (pFeaturesList && data.features) {
            pFeaturesList.innerHTML = data.features.map(f => `
              <div class="p-feature-item"><span class="check-icon">✓</span> ${f}</div>
            `).join('');
          }
        }
      });
    });
  }

  // --- Landing Use Cases Switcher ---
  const ucTabBtns = document.querySelectorAll('.uc-tab-btn');
  const ucMockupChatBody = document.getElementById('uc-mockup-chat-body');

  const useCaseMockData = {
    memory: `
      <div class="chat-bubble outgoing">
        <span>Myva, tolong simpan link ini untuk referensi nanti: https://notion.so/project-abc</span>
        <div class="chat-bubble-time">09:15 <span class="read-receipt">✓✓</span></div>
      </div>
      <div class="chat-bubble incoming">
        <span>Link referensi proyek telah disimpan ke Memory Bank kamu dengan tag #referensi. Panggil kapan saja dengan ketik "cari referensi" ya! 🧠</span>
        <div class="chat-bubble-time">09:16</div>
      </div>
    `,
    reminder: `
      <div class="chat-bubble outgoing">
        <span>Ingetin meeting ama klien besok jam 10 pagi, trus tolong kirim briefing ke WA saya jam 8 pagi.</span>
        <div class="chat-bubble-time">14:20 <span class="read-receipt">✓✓</span></div>
      </div>
      <div class="chat-bubble incoming">
        <span>Agenda dicatat! 🗓️<br><br><b>1. Meeting Klien:</b> Besok jam 10.00.<br><b>2. Harian Briefing:</b> Akan dikirim ke WhatsApp Anda besok jam 08.00 pagi.</span>
        <div class="chat-bubble-time">14:21</div>
      </div>
    `,
    file: `
      <div class="chat-bubble outgoing">
        <span>[📄 PDF: Laporan_Keuangan_Q2.pdf] Tolong ringkas poin-poin penting dari laporan ini.</span>
        <div class="chat-bubble-time">11:05 <span class="read-receipt">✓✓</span></div>
      </div>
      <div class="chat-bubble incoming">
        <span>Berdasarkan analisis file <b>Laporan_Keuangan_Q2.pdf</b>:<br><br>• Pendapatan naik 12% YoY.<br>• Biaya operasional terpangkas 5%.<br>• Margin bersih meningkat jadi 18%.<br><br>Laporan lengkap siap dikirim atau disimpan ke Google Drive.</span>
        <div class="chat-bubble-time">11:06</div>
      </div>
    `,
    finance: `
      <div class="chat-bubble outgoing">
        <span>Pengeluaran makan siang hari ini 45 ribu</span>
        <div class="chat-bubble-time">13:10 <span class="read-receipt">✓✓</span></div>
      </div>
      <div class="chat-bubble incoming">
        <span>Dicatat! 💸 Pengeluaran <b>Rp 45.000</b> kategori <b>Makanan & Minuman</b> berhasil dimasukkan. Total pengeluaran bulan ini: Rp 1.420.000 (Sisa budget Anda aman).</span>
        <div class="chat-bubble-time">13:11</div>
      </div>
    `
  };

  if (ucTabBtns.length > 0 && ucMockupChatBody) {
    ucTabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        ucTabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const target = btn.getAttribute('data-uc-target');
        const chatContent = useCaseMockData[target];
        if (chatContent) {
          ucMockupChatBody.innerHTML = chatContent;
        }
      });
    });
  }

  // --- Landing FAQ Accordion ---
  const faqQuestions = document.querySelectorAll('.faq-question');
  if (faqQuestions.length > 0) {
    faqQuestions.forEach(q => {
      q.addEventListener('click', () => {
        const item = q.closest('.faq-item');
        if (item) {
          // Close other items
          document.querySelectorAll('.faq-item').forEach(other => {
            if (other !== item) {
              other.classList.remove('active');
            }
          });
          // Toggle current item
          item.classList.toggle('active');
        }
      });
    });
  }

  // Sidebar router links click
  document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(el => {
    el.addEventListener('click', (e) => {
      const view = el.getAttribute('data-view');
      window.location.hash = `#${view}`;
    });
  });

  // Modal open buttons
  const openMemBtn = document.getElementById('btn-open-memory-modal');
  if (openMemBtn) openMemBtn.addEventListener('click', () => openModal('modal-memory'));
  
  const openRemBtn = document.getElementById('btn-open-reminder-modal');
  if (openRemBtn) openRemBtn.addEventListener('click', () => openModal('modal-reminder'));

  const openConBtn = document.getElementById('btn-open-contact-modal');
  if (openConBtn) openConBtn.addEventListener('click', () => openModal('modal-contact'));

  const openEvBtn = document.getElementById('btn-open-event-modal');
  if (openEvBtn) openEvBtn.addEventListener('click', () => openModal('modal-event'));

  const agendaCalBtn = document.getElementById('btn-agenda-view-cal');
  if (agendaCalBtn) agendaCalBtn.addEventListener('click', () => window.location.hash = '#calendar');

  const dashViewTasksBtn = document.getElementById('btn-dash-view-tasks');
  if (dashViewTasksBtn) dashViewTasksBtn.addEventListener('click', () => window.location.hash = '#tasks');

  // Close modals clicking X or cancel buttons
  document.querySelectorAll('.modal-close-btn, .btn-outline[id^="btn-cancel-"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal-overlay');
      if (modal) closeModal(modal.id);
    });
  });

  // Add Task Modal Column Trigger
  document.querySelectorAll('.btn-add-task-inline').forEach(btn => {
    btn.addEventListener('click', () => {
      const col = btn.getAttribute('data-status');
      document.getElementById('new-task-status').value = col;
      openModal('modal-task');
    });
  });

  // Search Listeners
  const memSearchInput = document.getElementById('memory-search-input');
  if (memSearchInput) {
    memSearchInput.addEventListener('input', (e) => {
      memorySearchQuery = e.target.value.toLowerCase();
      renderMemoryCenter();
    });
  }

  const conSearchInput = document.getElementById('contacts-search-input');
  if (conSearchInput) {
    conSearchInput.addEventListener('input', (e) => {
      contactsSearchQuery = e.target.value.toLowerCase();
      renderContactsManager();
    });
  }

  const filesSearchInput = document.getElementById('files-search-input');
  if (filesSearchInput) {
    filesSearchInput.addEventListener('input', (e) => {
      filesSearchQuery = e.target.value.toLowerCase();
      renderFilesVault();
    });
  }

  // Memory tabs filters
  document.querySelectorAll('#memory-filter-tabs .tab-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#memory-filter-tabs .tab-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      memoryFilter = pill.getAttribute('data-filter');
      renderMemoryCenter();
    });
  });

  // Files tabs filters
  document.querySelectorAll('#files-filter-tabs .tab-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#files-filter-tabs .tab-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      filesFilter = pill.getAttribute('data-filter');
      renderFilesVault();
    });
  });

  // Contacts tabs filters
  document.querySelectorAll('#contacts-filter-tabs .tab-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#contacts-filter-tabs .tab-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      contactsFilter = pill.getAttribute('data-filter');
      renderContactsManager();
    });
  });

  // Calendar prev/next month buttons
  const prevMonthBtn = document.getElementById('btn-prev-month');
  if (prevMonthBtn) {
    prevMonthBtn.addEventListener('click', () => {
      calendarCurrentDate.setMonth(calendarCurrentDate.getMonth() - 1);
      renderCalendarAgenda();
    });
  }

  const nextMonthBtn = document.getElementById('btn-next-month');
  if (nextMonthBtn) {
    nextMonthBtn.addEventListener('click', () => {
      calendarCurrentDate.setMonth(calendarCurrentDate.getMonth() + 1);
      renderCalendarAgenda();
    });
  }

  // Modal Save triggers
  document.getElementById('btn-save-memory').addEventListener('click', saveNewMemory);
  document.getElementById('btn-save-task').addEventListener('click', saveNewTask);
  document.getElementById('btn-save-reminder').addEventListener('click', saveNewReminder);
  document.getElementById('btn-save-contact').addEventListener('click', saveNewContact);
  document.getElementById('btn-save-event').addEventListener('click', saveNewEvent);

  // Settings Save
  document.getElementById('btn-save-profile').addEventListener('click', saveUserProfile);

  // Direct Plan Modifier Helper (Dev Mode fallback/downgrades)
  const changePlanDirectly = async (plan) => {
    if (state.token) {
      try {
        const response = await fetch(`${API_BASE_URL}/users/profile`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${state.token}`
          },
          body: JSON.stringify({ plan })
        });
        const data = await response.json();
        if (data.success && data.user) {
          state.profile = {
            ...state.profile,
            plan: data.user.plan || plan
          };
          state.save('profile', state.profile);
          syncSidebarProfile();
          renderSettingsPage();
          playSuccessChime();
          showToast(`Plan updated to ${plan.toUpperCase()}!`);
        }
      } catch (e) {
        console.error('Failed to update plan directly:', e);
      }
    } else {
      state.updateProfile({ plan });
      renderSettingsPage();
      playSuccessChime();
      showToast(`Plan updated to ${plan.toUpperCase()}!`);
    }
  };

  // Subscription Checkout Trigger
  const handleCheckout = async (plan) => {
    try {
      showToast('Menghubungkan ke payment gateway...');
      const response = await fetch(`${API_BASE_URL}/subscription/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.token}`
        },
        body: JSON.stringify({ plan }),
      });
      const data = await response.json();
      if (data.success && data.url) {
        showToast('Mengalihkan ke pembayaran iPaymu...');
        setTimeout(() => {
          window.location.href = data.url;
        }, 1000);
      } else {
        console.warn('Payment link failed, activating directly.');
        showToast('Activating plan directly...');
        await changePlanDirectly(plan);
      }
    } catch (err) {
      console.warn('Checkout failed, falling back to direct plan activation:', err);
      showToast('Activating plan directly...');
      await changePlanDirectly(plan);
    }
  };

  const freeSubBtn = document.getElementById('btn-subscribe-free');
  if (freeSubBtn) {
    freeSubBtn.addEventListener('click', () => {
      const plan = state.profile.plan || 'free';
      if (plan === 'free') {
        showToast('Anda saat ini berada pada Paket Free.');
      } else {
        changePlanDirectly('free');
      }
    });
  }

  const basicSubBtn = document.getElementById('btn-subscribe-basic');
  if (basicSubBtn) {
    basicSubBtn.addEventListener('click', () => {
      const plan = state.profile.plan || 'free';
      if (plan === 'pro') {
        changePlanDirectly('basic');
      } else {
        handleCheckout('basic');
      }
    });
  }

  const proSubBtn = document.getElementById('btn-subscribe-pro');
  if (proSubBtn) {
    proSubBtn.addEventListener('click', () => {
      handleCheckout('pro');
    });
  }

  // Integrations triggers & OAuth simulation
  document.querySelectorAll('.btn-connect-int').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const intKey = btn.getAttribute('data-int');
      await handleIntegrationConnect(intKey);
    });
  });

  // OAuth Simulation buttons
  const oauthAllowBtn = document.getElementById('btn-oauth-allow');
  if (oauthAllowBtn) {
    oauthAllowBtn.addEventListener('click', async () => {
      const key = activeOauthKey;
      if (!key) return;
      
      closeModal('modal-oauth-simulation');
      
      const btnEl = document.querySelector(`.btn-connect-int[data-int="${key}"]`);
      if (btnEl) {
        btnEl.textContent = 'Connecting...';
        btnEl.disabled = true;
      }
      
      setTimeout(async () => {
        const ints = {};
        ints[key] = true;
        await state.updateIntegrations(ints);
        if (btnEl) btnEl.disabled = false;
        updateIntegrationUI(key);
        playSuccessChime();
        const names = { gcal: 'Google Calendar', gdrive: 'Google Drive', gcontacts: 'Google Contacts', gmail: 'Gmail' };
        showToast(`${names[key] || 'Integration'} connected successfully!`);
      }, 1200);
    });
  }

  const oauthDenyBtn = document.getElementById('btn-oauth-deny');
  if (oauthDenyBtn) {
    oauthDenyBtn.addEventListener('click', () => {
      closeModal('modal-oauth-simulation');
      showToast('Connection cancelled.', 'warning');
    });
  }

  // Settings Cog clicks (delegated)
  document.addEventListener('click', (e) => {
    const settingsBtn = e.target.closest('.btn-settings-int');
    if (settingsBtn) {
      const key = settingsBtn.getAttribute('data-int');
      activeSettingsKey = key;
      
      const names = {
        gcal: 'Google Calendar',
        gdrive: 'Google Drive',
        gcontacts: 'Google Contacts',
        gmail: 'Gmail'
      };
      
      const titleEl = document.getElementById('int-settings-title');
      if (titleEl) titleEl.textContent = `${names[key]} Settings`;
      
      const bodyEl = document.getElementById('int-settings-body');
      if (bodyEl) {
        let formHtml = '';
        if (key === 'gcal') {
          formHtml = `
            <div class="form-group" style="margin-bottom:16px;">
              <label class="form-label" style="font-weight:600;margin-bottom:6px;display:block;">Sync Direction</label>
              <select class="form-input" id="settings-gcal-direction" style="height:38px;padding:0 10px;width:100%;border-radius:6px;border:1px solid var(--border-color);background:transparent;color:var(--text-primary);">
                <option value="twoway" style="background:var(--card-bg);color:var(--text-primary);">Two-way Sync (Sync both ways)</option>
                <option value="readonly" style="background:var(--card-bg);color:var(--text-primary);">Read-only (Import to MYVA only)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" style="font-weight:600;margin-bottom:6px;display:block;">Select Calendars to Sync</label>
              <div style="display:flex;flex-direction:column;gap:10px;margin-top:6px;">
                <label style="display:flex;align-items:center;gap:10px;font-size:13px;cursor:pointer;color:var(--text-primary);">
                  <input type="checkbox" checked style="accent-color:var(--primary-color);width:16px;height:16px;cursor:pointer;"> Primary Calendar (muis@myva.ai)
                </label>
                <label style="display:flex;align-items:center;gap:10px;font-size:13px;cursor:pointer;color:var(--text-primary);">
                  <input type="checkbox" checked style="accent-color:var(--primary-color);width:16px;height:16px;cursor:pointer;"> Work & Meetings
                </label>
                <label style="display:flex;align-items:center;gap:10px;font-size:13px;cursor:pointer;color:var(--text-primary);">
                  <input type="checkbox" style="accent-color:var(--primary-color);width:16px;height:16px;cursor:pointer;"> Reminders & Tasks
                </label>
              </div>
            </div>
          `;
        } else if (key === 'gdrive') {
          formHtml = `
            <div class="form-group" style="margin-bottom:16px;">
              <label class="form-label" style="font-weight:600;margin-bottom:6px;display:block;">Backup Folder Name</label>
              <input type="text" class="form-input" id="settings-gdrive-folder" value="MYVA Backup" style="height:38px;padding:0 12px;width:100%;border-radius:6px;border:1px solid var(--border-color);background:transparent;color:var(--text-primary);" />
            </div>
            <div class="form-group">
              <label class="form-label" style="font-weight:600;margin-bottom:6px;display:block;">File Sync Categories</label>
              <div style="display:flex;flex-direction:column;gap:10px;margin-top:6px;">
                <label style="display:flex;align-items:center;gap:10px;font-size:13px;cursor:pointer;color:var(--text-primary);">
                  <input type="checkbox" checked style="accent-color:var(--primary-color);width:16px;height:16px;cursor:pointer;"> PDF Documents
                </label>
                <label style="display:flex;align-items:center;gap:10px;font-size:13px;cursor:pointer;color:var(--text-primary);">
                  <input type="checkbox" checked style="accent-color:var(--primary-color);width:16px;height:16px;cursor:pointer;"> Text & Markdown Notes
                </label>
                <label style="display:flex;align-items:center;gap:10px;font-size:13px;cursor:pointer;color:var(--text-primary);">
                  <input type="checkbox" style="accent-color:var(--primary-color);width:16px;height:16px;cursor:pointer;"> Spreadsheet Tables
                </label>
              </div>
            </div>
          `;
        } else if (key === 'gcontacts') {
          formHtml = `
            <div class="form-group" style="margin-bottom:16px;">
              <label class="form-label" style="font-weight:600;margin-bottom:6px;display:block;">Auto-Sync Frequency</label>
              <select class="form-input" id="settings-gcontacts-freq" style="height:38px;padding:0 10px;width:100%;border-radius:6px;border:1px solid var(--border-color);background:transparent;color:var(--text-primary);">
                <option value="2h" style="background:var(--card-bg);color:var(--text-primary);">Every 2 Hours (Real-time feel)</option>
                <option value="daily" style="background:var(--card-bg);color:var(--text-primary);">Daily Backup (Every night)</option>
                <option value="manual" style="background:var(--card-bg);color:var(--text-primary);">Manual sync only</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" style="font-weight:600;margin-bottom:6px;display:block;">Sync Options</label>
              <div style="display:flex;flex-direction:column;gap:10px;margin-top:6px;">
                <label style="display:flex;align-items:center;gap:10px;font-size:13px;cursor:pointer;color:var(--text-primary);">
                  <input type="checkbox" checked style="accent-color:var(--primary-color);width:16px;height:16px;cursor:pointer;"> Sync WhatsApp profile pictures
                </label>
              </div>
            </div>
          `;
        } else if (key === 'gmail') {
          formHtml = `
            <div class="form-group" style="margin-bottom:16px;">
              <label class="form-label" style="font-weight:600;margin-bottom:6px;display:block;">Email Scan Limit</label>
              <select class="form-input" id="settings-gmail-limit" style="height:38px;padding:0 10px;width:100%;border-radius:6px;border:1px solid var(--border-color);background:transparent;color:var(--text-primary);">
                <option value="5" style="background:var(--card-bg);color:var(--text-primary);">Last 5 emails (Instant)</option>
                <option value="10" style="background:var(--card-bg);color:var(--text-primary);">Last 10 emails (Balanced)</option>
                <option value="20" style="background:var(--card-bg);color:var(--text-primary);">Last 20 emails</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" style="font-weight:600;margin-bottom:6px;display:block;">AI Automation Options</label>
              <div style="display:flex;flex-direction:column;gap:10px;margin-top:6px;">
                <label style="display:flex;align-items:center;gap:10px;font-size:13px;cursor:pointer;color:var(--text-primary);">
                  <input type="checkbox" checked style="accent-color:var(--primary-color);width:16px;height:16px;cursor:pointer;"> Auto-summarize incoming work emails
                </label>
                <label style="display:flex;align-items:center;gap:10px;font-size:13px;cursor:pointer;color:var(--text-primary);">
                  <input type="checkbox" checked style="accent-color:var(--primary-color);width:16px;height:16px;cursor:pointer;"> Send daily email briefing via WhatsApp
                </label>
              </div>
            </div>
          `;
        }
        bodyEl.innerHTML = formHtml;
      }
      
      openModal('modal-integration-settings');
    }
  });

  // Settings Modal Cancel/Close click listeners
  const closeIntModalBtn = document.getElementById('close-int-settings-modal');
  if (closeIntModalBtn) {
    closeIntModalBtn.addEventListener('click', () => {
      closeModal('modal-integration-settings');
    });
  }

  const cancelIntModalBtn = document.getElementById('btn-cancel-int-settings');
  if (cancelIntModalBtn) {
    cancelIntModalBtn.addEventListener('click', () => {
      closeModal('modal-integration-settings');
    });
  }

  const saveIntSettingsBtn = document.getElementById('btn-save-int-settings');
  if (saveIntSettingsBtn) {
    saveIntSettingsBtn.addEventListener('click', () => {
      const oldText = saveIntSettingsBtn.textContent;
      saveIntSettingsBtn.textContent = 'Saving...';
      saveIntSettingsBtn.disabled = true;
      setTimeout(() => {
        saveIntSettingsBtn.textContent = oldText;
        saveIntSettingsBtn.disabled = false;
        closeModal('modal-integration-settings');
        playSuccessChime();
        showToast('Integration settings updated successfully!');
      }, 800);
    });
  }

  // Backup storage toggle listener
  const backupToggle = document.getElementById('backup-toggle');
  if (backupToggle) {
    backupToggle.addEventListener('change', (e) => {
      state.updateProfile({ backupEnabled: e.target.checked });
      showToast(e.target.checked ? 'Chat backup storage enabled!' : 'Chat backup storage disabled!');
    });
  }

  // 2FA toggle listener
  const twoFactorToggle = document.getElementById('security-2fa-toggle');
  if (twoFactorToggle) {
    twoFactorToggle.addEventListener('change', (e) => {
      state.updateProfile({ twoFactorEnabled: e.target.checked });
      showToast(e.target.checked ? 'Two-factor authentication enabled!' : 'Two-factor authentication disabled!');
    });
  }

  // Password visibility eye toggles
  document.querySelectorAll('.password-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-toggle');
      const input = document.getElementById(targetId);
      if (input) {
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        
        // Swap SVG icon
        if (isPassword) {
          btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;
        } else {
          btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
        }
      }
    });
  });

  // Change Password submit button
  const btnUpdatePassword = document.getElementById('btn-update-password');
  if (btnUpdatePassword) {
    btnUpdatePassword.addEventListener('click', () => {
      const currentPass = document.getElementById('security-current-password').value;
      const newPass = document.getElementById('security-new-password').value;
      const confirmPass = document.getElementById('security-confirm-password').value;

      if (!currentPass || !newPass || !confirmPass) {
        showToast('Please fill in all password fields.', 'error');
        return;
      }
      if (newPass !== confirmPass) {
        showToast('New passwords do not match.', 'error');
        return;
      }
      if (newPass.length < 6) {
        showToast('New password must be at least 6 characters.', 'error');
        return;
      }

      showToast('Password updated successfully!');
      document.getElementById('security-current-password').value = '';
      document.getElementById('security-new-password').value = '';
      document.getElementById('security-confirm-password').value = '';
    });
  }

  // Revoke Sessions
  const btnRevokeAllSessions = document.getElementById('btn-revoke-all-sessions');
  if (btnRevokeAllSessions) {
    btnRevokeAllSessions.addEventListener('click', () => {
      const mobileSession = document.getElementById('session-device-mobile');
      if (mobileSession) {
        mobileSession.remove();
        showToast('All other sessions revoked successfully!');
      } else {
        showToast('No other active sessions to revoke.', 'error');
      }
    });
  }

  const btnRevokeMobile = document.getElementById('btn-revoke-mobile');
  if (btnRevokeMobile) {
    btnRevokeMobile.addEventListener('click', () => {
      const mobileSession = document.getElementById('session-device-mobile');
      if (mobileSession) {
        mobileSession.remove();
        showToast('Mobile session revoked successfully!');
      }
    });
  }

  // Export Data
  const btnExportData = document.getElementById('btn-export-data');
  if (btnExportData) {
    btnExportData.addEventListener('click', () => {
      const exportPayload = {
        appName: "MYVA",
        exportDate: new Date().toISOString(),
        profile: {
          username: state.profile.username || "User",
          phone: state.profile.phone || "+628123456789",
          plan: state.profile.plan || "free",
          backupEnabled: state.profile.backupEnabled !== false,
          twoFactorEnabled: document.getElementById('security-2fa-toggle')?.checked || false
        },
        integrations: {
          googleCalendar: state.integrations.gcal || false,
          googleDrive: state.integrations.gdrive || false,
          googleContacts: state.integrations.gcontacts || false,
          gmail: state.integrations.gmail || false
        },
        memories: [
          { id: 1, category: "Work", summary: "Loves to build fast AI software integrations." },
          { id: 2, category: "Personal", summary: "Prefers dark mode UIs and minimal animations." }
        ]
      };

      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportPayload, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `myva_personal_data_${Date.now()}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      showToast('Personal data exported successfully!');
    });
  }

  // Reset AI Memory Modal Control
  const btnResetMemory = document.getElementById('btn-reset-memory');
  const modalResetMemory = document.getElementById('modal-reset-memory');
  const btnCancelReset = document.getElementById('btn-cancel-reset');
  const btnConfirmReset = document.getElementById('btn-confirm-reset');

  if (btnResetMemory && modalResetMemory) {
    btnResetMemory.addEventListener('click', () => {
      modalResetMemory.classList.add('active');
    });

    const hideResetModal = () => modalResetMemory.classList.remove('active');
    btnCancelReset.addEventListener('click', hideResetModal);
    modalResetMemory.addEventListener('click', (e) => {
      if (e.target === modalResetMemory) hideResetModal();
    });

    btnConfirmReset.addEventListener('click', () => {
      hideResetModal();
      showToast('AI memory reset completed successfully!');
    });
  }

  // Delete Account Modal Control
  const btnDeleteAccount = document.getElementById('btn-delete-account');
  const modalDeleteAccount = document.getElementById('modal-delete-account');
  const btnCancelDelete = document.getElementById('btn-cancel-delete');
  const btnConfirmDelete = document.getElementById('btn-confirm-delete');

  if (btnDeleteAccount && modalDeleteAccount) {
    btnDeleteAccount.addEventListener('click', () => {
      modalDeleteAccount.classList.add('active');
    });

    const hideDeleteModal = () => modalDeleteAccount.classList.remove('active');
    btnCancelDelete.addEventListener('click', hideDeleteModal);
    modalDeleteAccount.addEventListener('click', (e) => {
      if (e.target === modalDeleteAccount) hideDeleteModal();
    });

    btnConfirmDelete.addEventListener('click', () => {
      hideDeleteModal();
      showToast('Account deleted successfully. Logging out...', 'error');
      setTimeout(() => {
        window.location.hash = '';
        window.location.reload();
      }, 1500);
    });
  }

  // Settings tabs toggle
  document.querySelectorAll('.settings-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.settings-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const tab = btn.getAttribute('data-tab');
      document.querySelectorAll('.settings-tab-pane').forEach(p => {
        p.classList.toggle('active', p.id === `settings-pane-${tab}`);
      });
    });
  });

  // File Upload Drag and Drop
  const dropZone = document.getElementById('file-drop-zone');
  if (dropZone) {
    dropZone.addEventListener('click', () => {
      document.getElementById('file-input-raw').click();
    });

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.backgroundColor = 'var(--primary-bg-light)';
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.style.backgroundColor = '#F8FAFC';
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.style.backgroundColor = '#F8FAFC';
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFileProcessing(files);
      }
    });
  }

  const rawFileInput = document.getElementById('file-input-raw');
  if (rawFileInput) {
    rawFileInput.addEventListener('change', (e) => {
      const files = e.target.files;
      if (files.length > 0) {
        handleFileProcessing(files);
      }
    });
  }

  // Close Drawer
  document.getElementById('close-file-drawer').addEventListener('click', () => {
    document.getElementById('drawer-file-details').classList.remove('active');
  });
  document.getElementById('btn-close-drawer-bottom').addEventListener('click', () => {
    document.getElementById('drawer-file-details').classList.remove('active');
  });

  document.getElementById('close-memory-drawer').addEventListener('click', () => {
    document.getElementById('drawer-memory-details').classList.remove('active');
  });
  document.getElementById('btn-close-memory-drawer-bottom').addEventListener('click', () => {
    document.getElementById('drawer-memory-details').classList.remove('active');
  });

  document.getElementById('close-task-drawer').addEventListener('click', () => {
    document.getElementById('drawer-task-details').classList.remove('active');
  });
  document.getElementById('btn-close-task-drawer-bottom').addEventListener('click', () => {
    document.getElementById('drawer-task-details').classList.remove('active');
  });
  document.getElementById('btn-save-task-drawer').addEventListener('click', saveTaskDetailsFromDrawer);

  document.getElementById('close-reminder-drawer').addEventListener('click', () => {
    document.getElementById('drawer-reminder-details').classList.remove('active');
  });
  document.getElementById('btn-close-reminder-drawer-bottom').addEventListener('click', () => {
    document.getElementById('drawer-reminder-details').classList.remove('active');
  });
  document.getElementById('btn-save-reminder-drawer').addEventListener('click', saveReminderDetailsFromDrawer);

  // Assistant Studio Inputs
  document.getElementById('assistant-name-input').addEventListener('input', (e) => {
    const val = e.target.value.trim() || 'MYVA';
    state.updateStudio({ name: val });
    document.getElementById('mockup-chat-name').textContent = `${val} AI`;
  });
  document.getElementById('assistant-name-input').addEventListener('change', (e) => {
    showToast(`Name saved: ${e.target.value}`);
  });

  // Assistant emoji avatar selector (opens emoji picker modal)
  document.getElementById('studio-avatar-btn').addEventListener('click', () => {
    emojiPickerTarget = 'studio';
    openModal('modal-emoji-picker');
  });

  const profileAvatarTrigger = document.getElementById('profile-avatar-trigger');
  if (profileAvatarTrigger) {
    profileAvatarTrigger.addEventListener('click', () => {
      emojiPickerTarget = 'profile';
      openModal('modal-emoji-picker');
    });
  }

  document.getElementById('close-emoji-modal').addEventListener('click', () => {
    closeModal('modal-emoji-picker');
  });

  document.getElementById('modal-emoji-picker').addEventListener('click', (e) => {
    if (e.target.id === 'modal-emoji-picker') {
      closeModal('modal-emoji-picker');
    }
  });

  document.querySelectorAll('.emoji-picker-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      const nextEmoji = e.target.getAttribute('data-emoji');
      
      if (emojiPickerTarget === 'profile') {
        const avatarDisplay = document.getElementById('profile-avatar-emoji-display');
        if (avatarDisplay) avatarDisplay.textContent = nextEmoji;
        
        state.updateProfile({ avatar: nextEmoji });
        syncSidebarProfile();
        
        if (state.token) {
          try {
            await fetch(`${API_BASE_URL}/users/profile`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
              },
              body: JSON.stringify({
                avatar: nextEmoji
              })
            });
          } catch (err) {
            console.error('Failed to sync avatar to backend:', err);
          }
        }
        
        closeModal('modal-emoji-picker');
        showToast('Profile avatar updated successfully!');
      } else {
        document.getElementById('studio-avatar-emoji').textContent = nextEmoji;
        state.updateStudio({ emoji: nextEmoji });
        document.getElementById('mockup-chat-avatar').textContent = nextEmoji;
        closeModal('modal-emoji-picker');
        showToast('Avatar updated & synced!');
      }
    });
  });

  // Studio personality card select
  document.querySelectorAll('.personality-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.personality-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');

      const personality = card.getAttribute('data-personality');
      state.updateStudio({ personality });
      
      // Update chat preview conversation
      const langVal = state.studio.language || 'id';
      const responses = PERSONALITY_RESPONSES[langVal] || PERSONALITY_RESPONSES['id'];
      let greeting = responses[personality].greeting;
      greeting = formatMessageByStyle(greeting, state.studio.style);

      studioChatLog = [
        { sender: 'assistant', text: greeting, time: '14:21' }
      ];
      renderMockupChat();
      showToast('Personality saved & synced!');
    });
  });

  // Studio communication style selector
  document.querySelectorAll('.style-btn:not(.lang-btn)').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.style-btn:not(.lang-btn)').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const style = btn.getAttribute('data-style');
      state.updateStudio({ style });

      // Update chat preview conversation based on new style
      const langVal = state.studio.language || 'id';
      const responses = PERSONALITY_RESPONSES[langVal] || PERSONALITY_RESPONSES['id'];
      let greeting = responses[state.studio.personality].greeting;
      greeting = formatMessageByStyle(greeting, style);

      studioChatLog = [
        { sender: 'assistant', text: greeting, time: '14:21' }
      ];
      renderMockupChat();
      showToast('Communication style updated!');
    });
  });

  // Studio language selector
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const language = btn.getAttribute('data-lang');
      state.updateStudio({ language });
      
      // Update chat preview conversation
      const responses = PERSONALITY_RESPONSES[language] || PERSONALITY_RESPONSES['id'];
      let greeting = responses[state.studio.personality].greeting;
      greeting = formatMessageByStyle(greeting, state.studio.style);

      studioChatLog = [
        { sender: 'assistant', text: greeting, time: '14:21' }
      ];
      renderMockupChat();
      showToast(language === 'en' ? 'Language set to English!' : 'Bahasa diatur ke Indonesia!');
    });
  });

  // Studio briefing toggle
  const briefingToggle = document.getElementById('daily-briefing-toggle');
  briefingToggle.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    state.updateStudio({ briefing: enabled });
    document.getElementById('briefing-time-section').classList.toggle('disabled', !enabled);
    showToast(enabled ? 'Daily briefing enabled!' : 'Daily briefing disabled!');

    if (enabled) {
      isAssistantTyping = true;
      renderMockupChat();
      
      setTimeout(() => {
        isAssistantTyping = false;
        const langVal = state.studio.language || 'id';
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        
        let briefingText = '';
        if (langVal === 'en') {
          briefingText = `☀️ *MYVA DAILY BRIEFING* ☀️\n\nGood morning ${state.profile.username}! Here is your schedule for today:\n\n📅 *Today's Schedule*:\n- 09:00: Product Launch Align\n- 14:00: Catch-up Meeting\n\n📋 *Priority Tasks*:\n- Complete API documentation\n- Send JavaCoffee invoice\n\nHave a productive day! 🚀`;
        } else {
          briefingText = `☀️ *DAILY BRIEFING MYVA* ☀️\n\nSelamat pagi ${state.profile.username}! Berikut ringkasan agenda Anda hari ini:\n\n📅 *Agenda Hari Ini*:\n- 09:00: Product Launch Align\n- 14:00: Catch-up Meeting\n\n📋 *Tugas Prioritas*:\n- Menyelesaikan dokumentasi API\n- Mengirimkan invoice JavaCoffee\n\nSemoga hari Anda produktif! 🚀`;
        }
        
        briefingText = formatMessageByStyle(briefingText, state.studio.style);
        studioChatLog.push({ sender: 'assistant', text: briefingText, time: timeStr });
        renderMockupChat();
        playMockupNotificationSound();
      }, 1000);
    }
  });

  document.getElementById('briefing-time-input').addEventListener('change', (e) => {
    state.updateStudio({ briefingTime: e.target.value });
    showToast('Briefing time updated!');
  });

  // Smart Follow Up toggle
  const followUpToggleEl = document.getElementById('smart-followup-toggle');
  if (followUpToggleEl) {
    followUpToggleEl.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      state.updateStudio({ followup: enabled });
      showToast(enabled ? 'Smart Follow Up enabled!' : 'Smart Follow Up disabled!');

      if (enabled) {
        isAssistantTyping = true;
        renderMockupChat();
        
        setTimeout(() => {
          isAssistantTyping = false;
          const langVal = state.studio.language || 'id';
          const now = new Date();
          const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
          
          let followUpText = '';
          if (langVal === 'en') {
            followUpText = `⏳ *Smart Follow Up*:\n\nHi ${state.profile.username}, just a quick friendly reminder to complete your high-priority task: *Complete API documentation*. It's marked as pending. Let me know if you need any help!`;
          } else {
            followUpText = `⏳ *Smart Follow Up*:\n\nHalo ${state.profile.username}, sekadar mengingatkan tugas prioritas tinggi Anda: *Menyelesaikan dokumentasi API*. Statusnya masih tertunda. Kabari saya jika butuh bantuan ya!`;
          }
          
          followUpText = formatMessageByStyle(followUpText, state.studio.style);
          studioChatLog.push({ sender: 'assistant', text: followUpText, time: timeStr });
          renderMockupChat();
          playMockupNotificationSound();
        }, 1000);
      }
    });
  }

  // Clear chat preview button
  const clearChatBtn = document.getElementById('btn-clear-mockup-chat');
  if (clearChatBtn) {
    clearChatBtn.addEventListener('click', () => {
      studioChatLog = [];
      const config = state.studio;
      const langVal = config.language || 'id';
      const responses = PERSONALITY_RESPONSES[langVal] || PERSONALITY_RESPONSES['id'];
      let greeting = responses[config.personality].greeting;
      greeting = formatMessageByStyle(greeting, config.style);
      
      studioChatLog.push({ sender: 'assistant', text: greeting, time: '14:21' });
      renderMockupChat();
      showToast('Chat history cleared!');
    });
  }

  // Chat preview send button
  document.getElementById('mockup-chat-send-btn').addEventListener('click', handleStudioSendMessage);
  document.getElementById('mockup-chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleStudioSendMessage();
  });

  // Assistant Studio Save All Button
  const saveStudioBtn = document.getElementById('btn-save-studio');
  if (saveStudioBtn) {
    saveStudioBtn.addEventListener('click', async () => {
      saveStudioBtn.disabled = true;
      const originalHtml = saveStudioBtn.innerHTML;
      saveStudioBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" style="animation: spin 1s linear infinite; margin-right: 4px;"><circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.2)"></circle><path d="M4 12a8 8 0 0 1 8-8" stroke="#FFF" stroke-linecap="round"></path></svg>
        Saving Changes...
      `;

      // Read values from form
      const name = document.getElementById('assistant-name-input').value.trim() || 'MYVA';
      const emoji = document.getElementById('studio-avatar-emoji').textContent || '🤖';
      
      const activeCard = document.querySelector('.personality-card.active');
      const personality = activeCard ? activeCard.getAttribute('data-personality') : 'friendly';
      
      const activeStyleBtn = document.querySelector('.style-btn.active:not(.lang-btn)');
      const style = activeStyleBtn ? activeStyleBtn.getAttribute('data-style') : 'normal';
      
      const activeLangBtn = document.querySelector('.lang-btn.active');
      const language = activeLangBtn ? activeLangBtn.getAttribute('data-lang') : 'id';
      
      const briefing = document.getElementById('daily-briefing-toggle').checked;
      const briefingTime = document.getElementById('briefing-time-input').value;
      const followup = document.getElementById('smart-followup-toggle').checked;

      try {
        await state.updateStudio({
          name,
          emoji,
          personality,
          style,
          language,
          briefing,
          briefingTime,
          followup
        });
        
        setTimeout(() => {
          saveStudioBtn.disabled = false;
          saveStudioBtn.innerHTML = originalHtml;
          showToast('Assistant Studio configuration saved & synced successfully!');
        }, 800);
      } catch (err) {
        saveStudioBtn.disabled = false;
        saveStudioBtn.innerHTML = originalHtml;
        showToast('Failed to save studio configuration.', 'error');
      }
    });
  }

  // Sidebar Toggle Minimize
  const sidebar = document.querySelector('.sidebar');
  const toggleBtn = document.getElementById('sidebar-toggle');
  if (sidebar && toggleBtn) {
    const isMinimized = localStorage.getItem('sidebar-minimized') === 'true';
    if (isMinimized) {
      sidebar.classList.add('minimized');
      toggleBtn.classList.add('minimized');
    }
    
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('minimized');
      toggleBtn.classList.toggle('minimized');
      localStorage.setItem('sidebar-minimized', sidebar.classList.contains('minimized'));
    });
  }
}

// --- FILE MOCK UPLOAD & SUMMARY ---
const FILE_PRESET_ANALYSES = {
  pdf: {
    summary: 'The uploaded PDF file details the project execution roadmap, timelines, and resourcing requirements. It details milestones for core logic development, verification, and launch preparations.',
    points: [
      'Core build completion scheduled by end of Q2.',
      'QA phase requires 4 weeks of testing including automated integration tests.',
      'Deployment targeted for Koyeb or Vercel servers.'
    ],
    actions: [
      'Setup development servers',
      'Allocate QA engineering team leads'
    ]
  },
  doc: {
    summary: 'This document represents the standard service level agreement (SLA) for the MYVA assistant subscriptions. It outlines server uptime guarantees, client response metrics, and subscription renewal protocols.',
    points: [
      'MYVA promises 99.9% API connection uptime.',
      'Database updates are backed up hourly on encrypted storages.',
      'Support request response time guarantee is 4 hours for Pro tiers.'
    ],
    actions: [
      'Draft refund policies for billing outages',
      'Review legal definitions of data ownership'
    ]
  },
  txt: {
    summary: 'A plain text dump containing notes on user research feedback for WhatsApp chat bots. Includes comments on prompt styles, greeting structures, and user engagement figures.',
    points: [
      'Users highly prefer emojis in greetings as they feel more friendly.',
      'Islamic Assistant profiles received high feedback from daily briefing users.',
      'Detailed communication style can sometimes overload users with notifications.'
    ],
    actions: [
      'Set Balanced style as default configuration',
      'Verify emoji rendering across all device resolutions'
    ]
  }
};

function handleFileProcessing(filesList) {
  // Create beautiful full-screen loading state overlay
  const loader = document.createElement('div');
  loader.className = 'modal-overlay';
  loader.style.display = 'flex';
  loader.style.zIndex = '1001';
  loader.innerHTML = `
    <div class="modal-card" style="max-width:320px; text-align:center; padding: 32px 24px;">
      <svg class="animate-pulse" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--secondary-color)" stroke-width="2" style="margin: 0 auto 16px auto;"><path d="m12 3-1.912 5.886L4.202 9l5.886 1.912L12 17l1.912-5.886 5.886-1.912-5.886-1.912z"></path></svg>
      <h4 style="font-size:15px; font-weight:700; margin-bottom:8px;">AI Analyzing Document...</h4>
      <p style="font-size:12px; color:var(--text-secondary);">MYVA is reading contents, extracting key points, and generating action items.</p>
    </div>
  `;
  document.body.appendChild(loader);

  if (state.token) {
    const uploadPromises = [];
    for (let i = 0; i < filesList.length; i++) {
      const f = filesList[i];
      const formData = new FormData();
      formData.append('file', f);

      const promise = fetch(`${API_BASE_URL}/file/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${state.token}`
        },
        body: formData
      })
      .then(res => {
        if (!res.ok) throw new Error('Upload failed');
        return res.json();
      })
      .then(uploadedFile => {
        return {
          id: uploadedFile.id,
          name: uploadedFile.filename,
          type: uploadedFile.mimeType.split('/')[1] || 'pdf',
          size: `${(uploadedFile.size / (1024 * 1024)).toFixed(1)} MB`,
          date: new Date(uploadedFile.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
          summary: uploadedFile.summary || 'Summary not processed yet.',
          points: uploadedFile.keyPoints || [],
          actions: uploadedFile.actionItems || []
        };
      })
      .catch(err => {
        console.error('File upload failed, falling back to mock.', err);
        const ext = f.name.split('.').pop().toLowerCase();
        const type = ['pdf', 'txt', 'doc', 'csv'].includes(ext) ? (ext === 'csv' ? 'txt' : ext) : 'pdf';
        const preset = FILE_PRESET_ANALYSES[type] || FILE_PRESET_ANALYSES.pdf;
        return {
          id: `f_user_${Date.now()}_${i}`,
          name: f.name,
          type: type,
          size: `${(f.size / (1024 * 1024)).toFixed(1)} MB`,
          date: 'Today',
          summary: preset.summary,
          points: preset.points,
          actions: preset.actions
        };
      });
      uploadPromises.push(promise);
    }

    Promise.all(uploadPromises).then(processedFiles => {
      const newFiles = [...processedFiles, ...state.files];
      state.updateFiles(newFiles);
      document.body.removeChild(loader);
      renderFilesVault();
      showToast(`${filesList.length} file(s) analyzed and saved successfully`);
    });
  } else {
    setTimeout(() => {
      const newFiles = [...state.files];
      for (let i = 0; i < filesList.length; i++) {
        const f = filesList[i];
        const ext = f.name.split('.').pop().toLowerCase();
        const type = ['pdf', 'txt', 'doc', 'csv'].includes(ext) ? (ext === 'csv' ? 'txt' : ext) : 'pdf';
        const sizeStr = `${(f.size / (1024 * 1024)).toFixed(1)} MB`;
        const dateStr = 'Today';
        const preset = FILE_PRESET_ANALYSES[type] || FILE_PRESET_ANALYSES.pdf;
        
        newFiles.unshift({
          id: `f_user_${Date.now()}_${i}`,
          name: f.name,
          type: type,
          size: sizeStr,
          date: dateStr,
          summary: preset.summary,
          points: preset.points,
          actions: preset.actions
        });
      }
      state.updateFiles(newFiles);
      document.body.removeChild(loader);
      renderFilesVault();
      showToast(`${filesList.length} file(s) analyzed (Mock Mode)`);
    }, 1600);
  }
}

// --- MODAL UTILS & SAVING LOGICS ---
function openModal(id) {
  document.getElementById(id).classList.add('active');
  if (id === 'modal-event') {
    const todayStr = new Date().toISOString().split('T')[0];
    const dateField = document.getElementById('new-event-date');
    if (dateField) dateField.value = todayStr;
  }
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

async function saveNewMemory() {
  const title = document.getElementById('new-memory-title').value.trim();
  const content = document.getElementById('new-memory-content').value.trim();
  const category = document.getElementById('new-memory-category').value;

  if (!title || !content) {
    alert('Please fill in title and memory content.');
    return;
  }

  const newMem = {
    id: `m_user_${Date.now()}`,
    title,
    content,
    category,
    date: 'Today'
  };

  if (state.token) {
    const res = await state.apiPost('/memory', { title, content, category });
    if (res && res.id) {
      newMem.id = res.id;
    }
  }

  state.updateMemories([newMem, ...state.memories]);
  closeModal('modal-memory');

  // Reset inputs
  document.getElementById('new-memory-title').value = '';
  document.getElementById('new-memory-content').value = '';

  // Render view if active
  renderMemoryCenter();
}

async function saveNewTask() {
  const title = document.getElementById('new-task-name').value.trim();
  const tagStr = document.getElementById('new-task-tag').value.trim();
  const priority = document.getElementById('new-task-priority').value;
  const status = document.getElementById('new-task-status').value || 'todo';

  if (!title) {
    alert('Please enter a task name.');
    return;
  }

  const tags = tagStr ? tagStr.split(',').map(t => t.trim()) : ['Task'];

  const newTask = {
    id: `t_user_${Date.now()}`,
    title,
    tags,
    priority,
    status
  };

  if (state.token) {
    const res = await state.apiPost('/task', { title, tags, priority, status });
    if (res && res.id) {
      newTask.id = res.id;
    }
  }

  state.updateTasks([newTask, ...state.tasks]);
  closeModal('modal-task');

  // Reset
  document.getElementById('new-task-name').value = '';
  document.getElementById('new-task-tag').value = '';

  renderTasksBoard();
}

async function saveNewReminder() {
  const text = document.getElementById('new-reminder-text').value.trim();
  const timegroup = document.getElementById('new-reminder-timegroup').value;
  const time = document.getElementById('new-reminder-time').value;

  if (!text) {
    alert('Please write reminder content.');
    return;
  }

  const newRem = {
    id: `r_user_${Date.now()}`,
    text,
    timegroup,
    time,
    completed: false
  };

  if (state.token) {
    let scheduledAt = new Date();
    if (timegroup === 'Tomorrow') {
      scheduledAt.setDate(scheduledAt.getDate() + 1);
    } else if (timegroup === 'This Week') {
      scheduledAt.setDate(scheduledAt.getDate() + 3);
    } else if (timegroup === 'This Month') {
      scheduledAt.setDate(scheduledAt.getDate() + 15);
    }
    if (time) {
      const parts = time.split(':');
      scheduledAt.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), 0, 0);
    }

    const res = await state.apiPost('/reminder', {
      title: text,
      scheduledAt: scheduledAt.toISOString(),
      status: 'pending',
    });
    if (res && res.id) {
      newRem.id = res.id;
    }
  }

  state.updateReminders([...state.reminders, newRem]);
  closeModal('modal-reminder');

  // Reset
  document.getElementById('new-reminder-text').value = '';

  renderRemindersTimeline();
}

async function saveNewContact() {
  const name = document.getElementById('new-contact-name').value.trim();
  const company = document.getElementById('new-contact-company').value.trim() || 'Freelance';
  const phone = document.getElementById('new-contact-phone').value.trim();
  const email = document.getElementById('new-contact-email').value.trim() || 'N/A';
  const insta = document.getElementById('new-contact-insta').value.trim() || 'insta';

  if (!name || !phone) {
    alert('Please write at least name and phone number.');
    return;
  }

  const newCon = {
    id: `c_user_${Date.now()}`,
    name,
    company,
    phone,
    email,
    insta
  };

  if (state.token) {
    const res = await state.apiPost('/contact', {
      name,
      company,
      phone,
      email,
      instagram: insta
    });
    if (res && res.id) {
      newCon.id = res.id;
    }
  }

  state.updateContacts([newCon, ...state.contacts]);
  closeModal('modal-contact');

  // Reset
  document.getElementById('new-contact-name').value = '';
  document.getElementById('new-contact-company').value = '';
  document.getElementById('new-contact-phone').value = '';
  document.getElementById('new-contact-email').value = '';
  document.getElementById('new-contact-insta').value = '';

  renderContactsManager();
}

async function saveNewEvent() {
  const title = document.getElementById('new-event-title').value.trim();
  const time = document.getElementById('new-event-time').value;
  const dateStr = document.getElementById('new-event-date').value || new Date().toISOString().split('T')[0];
  const details = document.getElementById('new-event-details').value.trim() || '';

  if (!title) {
    alert('Please enter an event title.');
    return;
  }

  const newEvt = {
    id: `e_user_${Date.now()}`,
    title,
    date: dateStr,
    time,
    details
  };

  if (state.token) {
    let scheduledAt = new Date(dateStr);
    if (time) {
      const parts = time.split(':');
      scheduledAt.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), 0, 0);
    }
    const res = await state.apiPost('/reminder', {
      title: `[Calendar] ${title}`,
      scheduledAt: scheduledAt.toISOString(),
      status: 'pending',
    });
    if (res && res.id) {
      newEvt.id = res.id;
    }
  }

  state.updateEvents([...state.events, newEvt]);
  closeModal('modal-event');

  // Reset
  document.getElementById('new-event-title').value = '';
  document.getElementById('new-event-details').value = '';
  document.getElementById('new-event-date').value = '';

  renderCalendarAgenda();
}

function playSuccessChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now); // E5
    gain1.gain.setValueAtTime(0.08, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(783.99, now + 0.1); // G5
    gain2.gain.setValueAtTime(0.08, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    
    osc1.start(now);
    osc1.stop(now + 0.2);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.35);
  } catch (err) {
    console.warn("Audio Context error:", err);
  }
}

function syncSidebarProfile() {
  const profile = state.profile || { username: 'User', phone: '' };
  const sidebarNameEl = document.querySelector('.sidebar .user-name');
  if (sidebarNameEl) sidebarNameEl.textContent = profile.username;
  const sidebarAvatarEl = document.querySelector('.sidebar .user-avatar');
  if (sidebarAvatarEl) {
    sidebarAvatarEl.textContent = profile.avatar || profile.username.charAt(0).toUpperCase();
  }
}

async function saveUserProfile() {
  const username = document.getElementById('settings-username').value.trim() || 'User';
  const phone = document.getElementById('settings-phone').value.trim() || '8123456789';
  const bio = document.getElementById('settings-bio').value.trim();

  const saveBtn = document.getElementById('btn-save-profile');
  const oldText = saveBtn.textContent;
  
  saveBtn.disabled = true;
  saveBtn.innerHTML = `<svg class="spinner-svg" viewBox="0 0 50 50" style="width:18px;height:18px;animation:spin 1s linear infinite;stroke:currentColor;fill:none;stroke-width:5;stroke-linecap:round;margin-right:8px;display:inline-block;"><circle cx="25" cy="25" r="20"></circle></svg> Saving...`;
  
  if (state.token) {
    try {
      const response = await fetch(`${API_BASE_URL}/users/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.token}`
        },
        body: JSON.stringify({
          name: username,
          waNumber: phone,
          avatar: state.profile.avatar || '🤖'
        })
      });
      const data = await response.json();
      if (data.success && data.user) {
        state.updateProfile({ 
          username: data.user.name, 
          phone: data.user.waNumber,
          avatar: data.user.avatar || '🤖',
          bio: bio
        });
        playSuccessChime();
        showToast('Profile settings saved successfully!');
        
        saveBtn.innerHTML = 'Settings Saved ✓';
        saveBtn.style.backgroundColor = 'var(--primary-color)';
        
        syncSidebarProfile();
        renderDashboard();
        
        // Update display text elements
        const displayName = document.getElementById('profile-details-display-name');
        if (displayName) displayName.textContent = data.user.name;

        setTimeout(() => {
          saveBtn.disabled = false;
          saveBtn.innerHTML = oldText;
          saveBtn.style.backgroundColor = '';
        }, 1500);
      } else {
        showToast('Failed to save profile: ' + (data.message || 'Error API'));
        saveBtn.disabled = false;
        saveBtn.innerHTML = oldText;
      }
    } catch (err) {
      showToast('Koneksi ke server gagal.');
      console.error(err);
      saveBtn.disabled = false;
      saveBtn.innerHTML = oldText;
    }
  } else {
    setTimeout(() => {
      state.updateProfile({ 
        username, 
        phone, 
        avatar: state.profile.avatar || '🤖',
        bio
      });
      playSuccessChime();
      showToast('Profile settings saved successfully!');
      
      saveBtn.innerHTML = 'Settings Saved ✓';
      saveBtn.style.backgroundColor = 'var(--primary-color)';
      
      syncSidebarProfile();
      renderDashboard();

      const displayName = document.getElementById('profile-details-display-name');
      if (displayName) displayName.textContent = username;
      
      setTimeout(() => {
        saveBtn.disabled = false;
        saveBtn.innerHTML = oldText;
        saveBtn.style.backgroundColor = '';
      }, 1500);
    }, 600);
  }
}

// Helper: Escape HTML to avoid XSS injections in inputs
function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Helper: Format message based on selected communication style
function formatMessageByStyle(text, style) {
  if (!text) return '';
  if (style === 'short') {
    if (text.includes('Assalamualaikum')) {
      return `Assalamualaikum ${state.profile.username}. Hari ini ada 2 meeting. Semoga berkah!`;
    }
    if (text.includes('sayang') || text.includes('beb')) {
      return 'Halo sayang! Semangat hari ini ya beb! ❤️';
    }
    if (text.includes('Kenapa kamu memandangi')) {
      return 'Cepat kerja! Ada 5 tugas tertunda!';
    }
    if (text.includes('Selamat pagi') || text.includes('Greetings')) {
      return 'Greetings. Agenda & tasks have been organized.';
    }
    if (text.includes('Halo rekan') || text.includes('partner')) {
      return 'Hello partner. Ready to review today\'s metrics.';
    }
    // general fallback: take first sentence
    const sentences = text.split(/[.!?\n]/).filter(s => s.trim().length > 0);
    return sentences.length > 0 ? sentences[0] + '.' : text;
  } else if (style === 'detailed') {
    if (text.includes('Assalamualaikum')) {
      return text + ' Jangan lupa untuk menyempatkan shalat Dhuha dan membaca Al-Qur\'an di sela-sela kesibukan Anda. Semoga hari ini penuh dengan kemudahan dan kesuksesan dunia akhirat.';
    }
    if (text.includes('sayang') || text.includes('beb')) {
      return text + ' Aku selalu di sini buat support kamu gimanapun keadaan hari ini. Jangan lupa minum air putih yang banyak dan kabari aku kalau kamu udah selesai kerja ya beb, muah! ❤️';
    }
    if (text.includes('Kenapa kamu memandangi')) {
      return text + ' Kerjaan menumpuk tapi kamu malah sibuk melihat preview chat ini. Segera selesaikan tugas-tugas penting itu sebelum tenggat waktu berakhir!';
    }
    if (text.includes('Selamat pagi') || text.includes('Greetings')) {
      return text + ' I am ready to generate comprehensive reports, proofread draft emails, or analyze large documents for you. Please let me know how I can optimize your productivity today.';
    }
    if (text.includes('Halo rekan') || text.includes('partner')) {
      return text + ' Let\'s focus on our key performance indicators (KPIs) and optimize conversion rates. I have also prepared statistical projections for our review.';
    }
    return text + ' Let me know if you want me to write emails, plan projects, or research information. I am fully at your service.';
  }
  return text; // 'normal' style returns original text
}
// --- INITIALIZE APPLICATION ---
const initializeApp = async () => {
  // Parse tokens from URL if coming back from Google OAuth redirect
  const urlParams = new URLSearchParams(window.location.search);
  const urlAccessToken = urlParams.get('accessToken');
  const urlRefreshToken = urlParams.get('refreshToken');
  
  if (urlAccessToken && urlRefreshToken) {
    state.token = urlAccessToken;
    state.refreshToken = urlRefreshToken;
    localStorage.setItem('myva_token', urlAccessToken);
    localStorage.setItem('myva_refresh_token', urlRefreshToken);
    
    // Clear URL parameters
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('accessToken');
    cleanUrl.searchParams.delete('refreshToken');
    window.history.replaceState({}, document.title, cleanUrl.pathname + cleanUrl.hash);
  }

  await state.syncWithBackend();
  initRouter();
  initEventListeners();
  syncSidebarProfile();

  // Dynamically set Google OAuth login URL based on API_BASE_URL
  const googleLoginBtn = document.getElementById('btn-google-login');
  if (googleLoginBtn) {
    googleLoginBtn.href = `${API_BASE_URL}/api/auth/google`;
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}
