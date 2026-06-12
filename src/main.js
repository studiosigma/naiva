import './style.css';

/* ==========================================================================
   NAIVA CORE APPLICATION LOGIC
   ========================================================================== */

// --- INITIAL MOCK DATA ---
const DEFAULT_MEMORIES = [
  { id: 'm1', title: 'WhatsApp Marketing Strategy', content: 'Use personal broadcast lists instead of groups to keep it personal. Limit sending to 1-2 times a week. Emphasize value first.', category: 'Business', date: 'June 10, 2026' },
  { id: 'm2', title: 'Vercel Deployment Guide', content: 'https://vercel.com/docs/deployments/overview - Check setting up custom domains and env variables before triggering production builds.', category: 'Links', date: 'June 09, 2026' },
  { id: 'm3', title: 'Gift ideas for Sarah', content: 'Loves pastel stationery, ceramic coffee mugs, and botanical illustration books. Check local craft stores.', category: 'Ideas', date: 'June 07, 2026' },
  { id: 'm4', title: 'Client Feedback: Closa AI', content: 'They loved the auto-handoff logic. Requested faster response times in super admin centers. Set next call for next Thursday.', category: 'Notes', date: 'June 05, 2026' },
  { id: 'm5', title: 'John - Coffee Supplier', content: 'Contact details: +628991234567, email: john@javacoffee.co, works at Java Beans Corp.', category: 'Contacts', date: 'June 02, 2026' }
];

const DEFAULT_TASKS = [
  { id: 't1', title: 'Finalize Landing Page Copy', tags: ['Design', 'Copy'], priority: 'High', status: 'todo' },
  { id: 't2', title: 'Review Client Proposal for Naiva', tags: ['Business'], priority: 'High', status: 'todo' },
  { id: 't3', title: 'Integrate Midtrans Checkout Gateway', tags: ['Coding'], priority: 'Medium', status: 'doing' },
  { id: 't4', title: 'Setup DNS and SSL for naiva.ai', tags: ['Tech'], priority: 'Low', status: 'done' },
  { id: 't5', title: 'Create pitch deck slides', tags: ['Business', 'Design'], priority: 'Medium', status: 'todo' },
  { id: 't6', title: 'Test WhatsApp webhook reception', tags: ['Coding'], priority: 'High', status: 'done' }
];

const DEFAULT_REMINDERS = [
  { id: 'r1', text: 'Call John about coffee shipment status', timegroup: 'Today', time: '14:30', completed: false },
  { id: 'r2', text: 'Review contract proposal with legal team', timegroup: 'Tomorrow', time: '10:00', completed: false },
  { id: 'r3', text: 'Pay internet and cloud hosting invoice', timegroup: 'This Week', time: '09:00', completed: false },
  { id: 'r4', text: 'Renew SaaS business registration license', timegroup: 'This Month', time: '17:00', completed: false }
];

const DEFAULT_FILES = [
  { 
    id: 'f1', 
    name: 'project_specification_naiva.pdf', 
    type: 'pdf', 
    size: '1.8 MB', 
    date: 'June 10, 2026', 
    summary: 'This document details the functional specifications of NAIVA, a personal AI second brain hosted on WhatsApp. Key components include the memory retrieval engine, OpenAI integration, and background sync logic.',
    points: [
      'NAIVA acts as a text-based storage and reminder assistant for WhatsApp users.',
      'Integration requires Midtrans for subscription handling and a super admin center for tracking.',
      'Data encryption is handled via AES-256 in SQL databases.'
    ],
    actions: [
      'Finalize webhook setup in WhatsApp Business Platform',
      'Test message encryption speed with 10k concurrent users'
    ]
  },
  { 
    id: 'f2', 
    name: 'javanese_coffee_beans.csv', 
    type: 'txt', 
    size: '45 KB', 
    date: 'June 09, 2026', 
    summary: 'A list containing suppliers, prices, roast profiles, and stock status for premium coffee beans imported from Java. Highlighting Arabica grades.',
    points: [
      'Arabica Java Preanger has the highest rating (86) and is priced at $12/kg.',
      'Currently, 4 supplier records are active with email contacts.',
      'Stock levels for Robusta beans are currently low.'
    ],
    actions: [
      'Contact supplier John to reorder Arabica Preanger'
    ]
  },
  { 
    id: 'f3', 
    name: 'design_system_tokens.docx', 
    type: 'doc', 
    size: '420 KB', 
    date: 'June 05, 2026', 
    summary: 'Defines the NAIVA design system style guidelines, including WhatsApp-style primary colors, typography choices, and glassmorphic shadow values.',
    points: [
      'Primary color tokens: WhatsApp green (#25D366) and secondary teal (#128C7E).',
      'Inter or Geist used for headings and clean layout feel.',
      'Rounded corner standards are set to 10px (md) and 16px (lg).'
    ],
    actions: [
      'Apply new borders and shadows in dashboard component styles'
    ]
  }
];

const DEFAULT_CONTACTS = [
  { id: 'c1', name: 'John Doe', company: 'Javacoffee Co', phone: '+62 899-1234-567', email: 'john@javacoffee.co', insta: 'john_coffee' },
  { id: 'c2', name: 'Sarah Connor', company: 'Cyberdyne Systems', phone: '+1 555-0199', email: 'sarah@cyberdyne.io', insta: 'connor_sarah' },
  { id: 'c3', name: 'Zack Lee', company: 'TechVibe Agency', phone: '+62 812-9876-543', email: 'zack@techvibe.com', insta: 'zack_vibe' },
  { id: 'c4', name: 'Maryam Amina', company: 'Madina Designs', phone: '+62 821-2233-445', email: 'maryam@madina.org', insta: 'maryam_design' }
];

const DEFAULT_EVENTS = [
  { id: 'e1', title: 'Product Launch Align', time: '09:00', details: 'discussing landing page deployment with team' },
  { id: 'e2', title: 'Coffee supplier catch-up', time: '14:00', details: 'check Arabica Preanger stock availability with John' },
  { id: 'e3', title: 'Weekly Code Review', time: '17:00', details: 'review Midtrans integration code and error handling' }
];

const DEFAULT_EXPENSES = [
  { id: 'xp1', description: 'Beli Kopi Susu', amount: 25000, category: 'Makanan', date: 'June 11, 2026' },
  { id: 'xp2', description: 'Makan Siang Nasi Padang', amount: 35000, category: 'Makanan', date: 'June 10, 2026' },
  { id: 'xp3', description: 'Tagihan WiFi Indihome', amount: 385000, category: 'Tagihan', date: 'June 08, 2026' },
  { id: 'xp4', description: 'Bensin Shell V-Power', amount: 150000, category: 'Transportasi', date: 'June 07, 2026' },
  { id: 'xp5', description: 'Belanja Kaos Uniqlo', amount: 299000, category: 'Belanja', date: 'June 05, 2026' }
];

let dashSimChatLog = [
  { sender: 'assistant', text: 'Halo Muis! Saya asisten AI NAIVA. Kirimkan pesan atau perintah WhatsApp di sini untuk disimulasikan.', time: '09:00' }
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
      name: 'NAIVA',
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
      username: 'Muis',
      phone: '8123456789'
    });
  }

  load(key, defaultValue) {
    const data = localStorage.getItem(`naiva_${key}`);
    return data ? JSON.parse(data) : defaultValue;
  }

  save(key, val) {
    localStorage.setItem(`naiva_${key}`, JSON.stringify(val));
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

  updateStudio(config) {
    this.studio = { ...this.studio, ...config };
    this.save('studio_config', this.studio);
  }

  updateIntegrations(ints) {
    this.integrations = { ...this.integrations, ...ints };
    this.save('integrations', this.integrations);
  }

  updateProfile(prof) {
    this.profile = { ...this.profile, ...prof };
    this.save('profile', this.profile);
  }
}

const state = new AppState();

// --- ROUTER SYSTEM ---
const viewsMap = {
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
    let hash = window.location.hash.substring(1) || 'dashboard';
    if (!viewsMap[hash]) hash = 'dashboard';

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
      headerTitle.textContent = viewsMap[hash];
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
    greetingEl.textContent = `Good Morning, ${state.profile.username} 👋`;
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
  if (state.events.length === 0) {
    agendaList.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">📅</span>
        <span class="empty-title">All clear today</span>
        <span class="empty-desc">No upcoming meetings or agendas are scheduled.</span>
      </div>`;
  } else {
    // Sort events by time
    const sortedEvents = [...state.events].sort((a, b) => a.time.localeCompare(b.time));
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
      <div class="empty-state">
        <span class="empty-icon">🎉</span>
        <span class="empty-title">All tasks completed!</span>
        <span class="empty-desc">You don't have any pending priority tasks.</span>
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
      <div class="empty-state" style="grid-column: span 3; padding: 80px 0;">
        <span class="empty-icon">🧠</span>
        <span class="empty-title">No memories found</span>
        <span class="empty-desc">Try searching for other terms or adding a new note memory.</span>
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

    card.querySelector('.btn-delete-card').addEventListener('click', (e) => {
      e.stopPropagation();
      const id = e.target.getAttribute('data-id');
      const updated = state.memories.filter(m => m.id !== id);
      state.updateMemories(updated);
      renderMemoryCenter();
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
        <div class="empty-state" style="padding: 24px 10px;">
          <span class="empty-icon">📋</span>
          <span class="empty-title">Empty column</span>
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
        movePrev.addEventListener('click', () => moveTaskStatus(task.id, 'prev'));
      }

      const moveNext = card.querySelector('.btn-move-next');
      if (moveNext) {
        moveNext.addEventListener('click', () => moveTaskStatus(task.id, 'next'));
      }

      card.querySelector('.btn-delete-task').addEventListener('click', () => {
        const updated = state.tasks.filter(t => t.id !== task.id);
        state.updateTasks(updated);
        renderTasksBoard();
      });

      container.appendChild(card);
    });
  });
}

function moveTaskStatus(id, dir) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;

  const order = ['todo', 'doing', 'done'];
  let currentIdx = order.indexOf(task.status);
  
  if (dir === 'next' && currentIdx < 2) {
    task.status = order[currentIdx + 1];
  } else if (dir === 'prev' && currentIdx > 0) {
    task.status = order[currentIdx - 1];
  }

  state.updateTasks(state.tasks);
  renderTasksBoard();
}

// 4. REMINDERS TIMELINE RENDERER
function renderRemindersTimeline() {
  const groups = ['Today', 'Tomorrow', 'This Week', 'This Month'];
  
  groups.forEach(grp => {
    const containerId = `reminders-${grp.toLowerCase().replace(' ', '')}`;
    const container = document.getElementById(containerId);
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

      card.querySelector('.btn-reminder-delete').addEventListener('click', () => {
        const updated = state.reminders.filter(r => r.id !== rem.id);
        state.updateReminders(updated);
        renderRemindersTimeline();
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

// 5. FILES VAULT RENDERER
function renderFilesVault() {
  const grid = document.getElementById('files-cards-grid');
  grid.innerHTML = '';

  if (state.files.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: span 4; padding: 60px 0;">
        <span class="empty-icon">📂</span>
        <span class="empty-title">Vault is empty</span>
        <span class="empty-desc">Drag files into the dropzone above or click to select documents.</span>
      </div>`;
    return;
  }

  state.files.forEach(file => {
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

    card.querySelector('.file-delete-overlay-btn').addEventListener('click', (e) => {
      e.stopPropagation();
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

// 6. CONTACTS RENDERER
let contactsSearchQuery = '';

function renderContactsManager() {
  const grid = document.getElementById('contacts-cards-grid');
  grid.innerHTML = '';

  const filtered = state.contacts.filter(c => {
    return c.name.toLowerCase().includes(contactsSearchQuery) ||
           c.company.toLowerCase().includes(contactsSearchQuery) ||
           c.phone.includes(contactsSearchQuery);
  });

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: span 3; padding: 60px 0;">
        <span class="empty-icon">👥</span>
        <span class="empty-title">No contacts found</span>
        <span class="empty-desc">Add contacts manually or mention them in WhatsApp chats to store.</span>
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

    card.querySelector('.btn-contact-delete').addEventListener('click', () => {
      const updated = state.contacts.filter(c => c.id !== con.id);
      state.updateContacts(updated);
      renderContactsManager();
    });

    grid.appendChild(card);
  });
}

// 7. CALENDAR AGENDA RENDERER
function renderCalendarAgenda() {
  const list = document.getElementById('calendar-agenda-list');
  list.innerHTML = '';

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

  if (state.events.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'empty-state';
    emptyDiv.style.padding = '60px 0';
    emptyDiv.innerHTML = `
        <span class="empty-icon">📅</span>
        <span class="empty-title">All clean</span>
        <span class="empty-desc">No events scheduled. Create a new event.</span>
    `;
    list.appendChild(emptyDiv);
    return;
  }

  const sorted = [...state.events].sort((a, b) => a.time.localeCompare(b.time));

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

    card.querySelector('.btn-agenda-delete').addEventListener('click', () => {
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
      greeting: "Hi Muis! I'm here to help you remember everything. Today is looking productive!",
      agenda: "Here's what you have going on today: You've got 2 meetings coming up. Let's make it a great one!",
      default: "Got it! I've logged that in your memory center. Let me know if you need to set a task or request a summary."
    },
    professional: {
      greeting: "Greetings. I have organized your agenda and pending tasks for today. Let me know if you need summaries of any documents.",
      agenda: "Your schedule consists of 2 meetings today: Product Launch Align at 09:00, and catch-up at 14:00.",
      default: "Understood. The memory entry has been successfully recorded in the secure vault."
    },
    islamic: {
      greeting: "Assalamualaikum Muis. Below is your schedule. Don't forget your daily prayers. Have a blessed day!",
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
      greeting: "Halo Muis! Aku di sini untuk membantumu mengingat segalanya. Hari ini tampak produktif!",
      agenda: "Berikut adalah agenda Anda hari ini: Anda memiliki 2 pertemuan. Mari kita buat hari ini menyenangkan!",
      default: "Siap! Catatan Anda sudah disimpan di Memory Center. Beritahu aku jika butuh ringkasan atau tugas baru."
    },
    professional: {
      greeting: "Selamat pagi. Saya telah mengatur agenda dan daftar tugas Anda hari ini. Beritahu saya jika Anda memerlukan ringkasan dokumen.",
      agenda: "Jadwal Anda hari ini terdiri dari 2 pertemuan: Product Launch Align pukul 09:00, dan catch-up pukul 14:00.",
      default: "Baik, catatan memori tersebut telah berhasil disimpan dengan aman di dalam sistem."
    },
    islamic: {
      greeting: "Assalamualaikum Muis. Berikut adalah jadwal Anda hari ini. Jangan lupa shalat 5 waktu ya. Semoga harimu berkah!",
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

  studioChatLog.forEach(chat => {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${chat.sender === 'user' ? 'outgoing' : 'incoming'}`;
    bubble.innerHTML = `
      <span>${escapeHtml(chat.text)}</span>
      <div class="chat-bubble-time">${chat.time}</div>
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

function handleStudioSendMessage() {
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

  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  const urls = text.match(urlRegex);

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
          const title = "Naiva SaaS Product Launch Specification";
          const summary = "Dokumen ini menjelaskan rencana peluncuran produk NAIVA, sebuah asisten AI berbasis WhatsApp. Poin utama meliputi manajemen memori terenkripsi, integrasi Midtrans, dan pengingat BullMQ.";
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
        replyText = `Here are your pending tasks, Muis:\n${pendingTasks}\n\nMay Allah grant you ease in completing them.`;
      } else {
        replyText = `Here is your current pending checklist:\n${pendingTasks}`;
      }
    } else if (q.includes('remind') || q.includes('reminder')) {
      const activeR = state.reminders.filter(r => !r.completed).map(r => `- [${r.time}] ${r.text}`).join('\n');
      replyText = `Here are your reminders:\n${activeR}`;
    } else {
      replyText = persResponses.default;
    }

    studioChatLog.push({ sender: 'assistant', text: replyText, time: timeStr });
    renderMockupChat();
    playMockupNotificationSound();
  }, 1000);
}

// 9. SETTINGS RENDERER
function renderSettingsPage() {
  // Populate form fields
  document.getElementById('settings-username').value = state.profile.username;
  document.getElementById('settings-phone').value = state.profile.phone;

  // Show status badges for integrations
  updateIntegrationUI('gcal');
  updateIntegrationUI('gdrive');
  updateIntegrationUI('gcontacts');
  updateIntegrationUI('gmail');
}

function updateIntegrationUI(key) {
  const statusEl = document.getElementById(`status-${key}`);
  const btnEl = document.querySelector(`.btn-connect-int[data-int="${key}"]`);
  
  if (state.integrations[key]) {
    statusEl.textContent = 'Connected';
    statusEl.className = 'brand-status connected';
    btnEl.textContent = 'Disconnect';
    btnEl.className = 'btn btn-outline btn-sm btn-connect-int';
  } else {
    statusEl.textContent = 'Disconnected';
    statusEl.className = 'brand-status';
    btnEl.textContent = 'Connect';
    btnEl.className = 'btn btn-primary btn-sm btn-connect-int';
  }
}

function handleIntegrationConnect(key) {
  const btnEl = document.querySelector(`.btn-connect-int[data-int="${key}"]`);
  const statusEl = document.getElementById(`status-${key}`);
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
    state.updateIntegrations(ints);
    updateIntegrationUI(key);
    playSuccessChime();
    showToast(`${brandName} disconnected.`);
  } else {
    // Connect
    btnEl.textContent = 'Connecting...';
    btnEl.disabled = true;
    setTimeout(() => {
      const ints = {};
      ints[key] = true;
      state.updateIntegrations(ints);
      btnEl.disabled = false;
      updateIntegrationUI(key);
      playSuccessChime();
      showToast(`${brandName} connected successfully!`);
    }, 1000);
  }
}

// --- GLOBAL ATTACHMENTS & INTERRUPTS ---
function initEventListeners() {
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

  // Memory tabs filters
  document.querySelectorAll('#memory-filter-tabs .tab-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#memory-filter-tabs .tab-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      memoryFilter = pill.getAttribute('data-filter');
      renderMemoryCenter();
    });
  });

  // Modal Save triggers
  document.getElementById('btn-save-memory').addEventListener('click', saveNewMemory);
  document.getElementById('btn-save-task').addEventListener('click', saveNewTask);
  document.getElementById('btn-save-reminder').addEventListener('click', saveNewReminder);
  document.getElementById('btn-save-contact').addEventListener('click', saveNewContact);
  document.getElementById('btn-save-event').addEventListener('click', saveNewEvent);

  // Settings Save
  document.getElementById('btn-save-profile').addEventListener('click', saveUserProfile);

  // Integrations trigger
  document.querySelectorAll('.btn-connect-int').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const intKey = e.target.getAttribute('data-int');
      handleIntegrationConnect(intKey);
    });
  });

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

  // Assistant Studio Inputs
  document.getElementById('assistant-name-input').addEventListener('input', (e) => {
    const val = e.target.value.trim() || 'NAIVA';
    state.updateStudio({ name: val });
    document.getElementById('mockup-chat-name').textContent = `${val} AI`;
  });
  document.getElementById('assistant-name-input').addEventListener('change', (e) => {
    showToast(`Name saved: ${e.target.value}`);
  });

  // Assistant emoji avatar selector (opens emoji picker modal)
  document.getElementById('studio-avatar-btn').addEventListener('click', () => {
    openModal('modal-emoji-picker');
  });

  document.getElementById('close-emoji-modal').addEventListener('click', () => {
    closeModal('modal-emoji-picker');
  });

  document.getElementById('modal-emoji-picker').addEventListener('click', (e) => {
    if (e.target.id === 'modal-emoji-picker') {
      closeModal('modal-emoji-picker');
    }
  });

  document.querySelectorAll('.emoji-picker-item').forEach(item => {
    item.addEventListener('click', (e) => {
      const nextEmoji = e.target.getAttribute('data-emoji');
      document.getElementById('studio-avatar-emoji').textContent = nextEmoji;
      state.updateStudio({ emoji: nextEmoji });
      document.getElementById('mockup-chat-avatar').textContent = nextEmoji;
      closeModal('modal-emoji-picker');
      showToast('Avatar updated & synced!');
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
      const greeting = PERSONALITY_RESPONSES[personality].greeting;
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
      const greeting = responses[state.studio.personality].greeting;
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
  });

  document.getElementById('briefing-time-input').addEventListener('change', (e) => {
    state.updateStudio({ briefingTime: e.target.value });
    showToast('Briefing time updated!');
  });

  // Smart Follow Up toggle
  const followUpToggleEl = document.getElementById('smart-followup-toggle');
  if (followUpToggleEl) {
    followUpToggleEl.addEventListener('change', (e) => {
      state.updateStudio({ followup: e.target.checked });
      showToast(e.target.checked ? 'Smart Follow Up enabled!' : 'Smart Follow Up disabled!');
    });
  }

  // Chat preview send button
  document.getElementById('mockup-chat-send-btn').addEventListener('click', handleStudioSendMessage);
  document.getElementById('mockup-chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleStudioSendMessage();
  });

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
    summary: 'This document represents the standard service level agreement (SLA) for the NAIVA assistant subscriptions. It outlines server uptime guarantees, client response metrics, and subscription renewal protocols.',
    points: [
      'NAIVA promises 99.9% API connection uptime.',
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
      <p style="font-size:12px; color:var(--text-secondary);">NAIVA is reading contents, extracting key points, and generating action items.</p>
    </div>
  `;
  document.body.appendChild(loader);

  setTimeout(() => {
    // Process each file
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

    // Refresh view
    renderFilesVault();
  }, 1600);
}

// --- MODAL UTILS & SAVING LOGICS ---
function openModal(id) {
  document.getElementById(id).classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

function saveNewMemory() {
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

  state.updateMemories([newMem, ...state.memories]);
  closeModal('modal-memory');

  // Reset inputs
  document.getElementById('new-memory-title').value = '';
  document.getElementById('new-memory-content').value = '';

  // Render view if active
  renderMemoryCenter();
}

function saveNewTask() {
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

  state.updateTasks([newTask, ...state.tasks]);
  closeModal('modal-task');

  // Reset
  document.getElementById('new-task-name').value = '';
  document.getElementById('new-task-tag').value = '';

  renderTasksBoard();
}

function saveNewReminder() {
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

  state.updateReminders([...state.reminders, newRem]);
  closeModal('modal-reminder');

  // Reset
  document.getElementById('new-reminder-text').value = '';

  renderRemindersTimeline();
}

function saveNewContact() {
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

function saveNewEvent() {
  const title = document.getElementById('new-event-title').value.trim();
  const time = document.getElementById('new-event-time').value;
  const details = document.getElementById('new-event-details').value.trim() || '';

  if (!title) {
    alert('Please enter an event title.');
    return;
  }

  const newEvt = {
    id: `e_user_${Date.now()}`,
    title,
    time,
    details
  };

  state.updateEvents([...state.events, newEvt]);
  closeModal('modal-event');

  // Reset
  document.getElementById('new-event-title').value = '';
  document.getElementById('new-event-details').value = '';

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
  const profile = state.profile || { username: 'Muis', phone: '8123456789' };
  const sidebarNameEl = document.querySelector('.sidebar .user-name');
  if (sidebarNameEl) sidebarNameEl.textContent = profile.username;
  const sidebarAvatarEl = document.querySelector('.sidebar .user-avatar');
  if (sidebarAvatarEl) sidebarAvatarEl.textContent = profile.username.charAt(0).toUpperCase();
}

function saveUserProfile() {
  const username = document.getElementById('settings-username').value.trim() || 'Muis';
  const phone = document.getElementById('settings-phone').value.trim() || '8123456789';

  const saveBtn = document.getElementById('btn-save-profile');
  const oldText = saveBtn.textContent;
  
  saveBtn.disabled = true;
  saveBtn.innerHTML = `<svg class="spinner-svg" viewBox="0 0 50 50" style="width:18px;height:18px;animation:spin 1s linear infinite;stroke:currentColor;fill:none;stroke-width:5;stroke-linecap:round;margin-right:8px;display:inline-block;"><circle cx="25" cy="25" r="20"></circle></svg> Saving...`;
  
  setTimeout(() => {
    state.updateProfile({ username, phone });
    playSuccessChime();
    showToast('Profile settings saved successfully!');
    
    saveBtn.innerHTML = 'Settings Saved ✓';
    saveBtn.style.backgroundColor = 'var(--primary-color)';
    
    syncSidebarProfile();
    renderDashboard();
    
    setTimeout(() => {
      saveBtn.disabled = false;
      saveBtn.innerHTML = oldText;
      saveBtn.style.backgroundColor = '';
    }, 1500);
  }, 600);
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
// --- INITIALIZE APPLICATION ---
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initRouter();
    initEventListeners();
    syncSidebarProfile();
  });
} else {
  initRouter();
  initEventListeners();
  syncSidebarProfile();
}
