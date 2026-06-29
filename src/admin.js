const API_BASE_URL = (window.location.origin.includes('localhost') ? 'http://localhost:3000' : 'https://eager-angelfish-studio6ma-3ffda666.koyeb.app') + '/api';

// Admin Session State
const state = {
  token: localStorage.getItem('myva_token'),
  profile: JSON.parse(localStorage.getItem('myva_profile') || '{}'),
  currentView: 'dashboard',
  usersSearch: '',
  usersPage: 1,
  usersLimit: 10,
  usersPlan: 'all',
  usersStatus: 'all',
  selectedUserId: null,
  charts: {}
};

// Check authorization
function verifyAuth() {
  if (!state.token || state.profile.role !== 'admin') {
    showToast('Akses ditolak. Silakan masuk sebagai administrator.', 'error');
    setTimeout(() => {
      window.location.href = '/index.html#login';
    }, 1500);
    return false;
  }
  
  // Set founder display details
  const avatarEl = document.getElementById('founder-avatar');
  const nameEl = document.getElementById('founder-name');
  if (avatarEl) avatarEl.textContent = (state.profile.username || state.profile.name || 'A').charAt(0).toUpperCase();
  if (nameEl) nameEl.textContent = state.profile.username || state.profile.name || 'Founder';
  return true;
}

// Global Toast notification
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  if (type === 'error') {
    toast.style.backgroundColor = '#EF4444';
  } else if (type === 'warning') {
    toast.style.backgroundColor = '#F59E0B';
  } else {
    toast.style.backgroundColor = '#0F172A';
  }

  toast.innerHTML = `
    <span style="font-size: 14px;">${type === 'error' ? '❌' : type === 'warning' ? '⚠️' : '✨'}</span>
    <span>${message}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.5s ease';
    setTimeout(() => toast.remove(), 500);
  }, 3000);
}

// Router and Tab switcher
function initRouter() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const view = item.getAttribute('data-view');
      switchView(view);
    });
  });

  // Handle initial load or refresh
  const hash = window.location.hash.replace('#', '');
  if (hash && document.querySelector(`[data-view="${hash}"]`)) {
    switchView(hash);
  } else {
    switchView('dashboard');
  }

  // Handle window popstate
  window.addEventListener('hashchange', () => {
    const newHash = window.location.hash.replace('#', '');
    if (newHash && document.querySelector(`[data-view="${newHash}"]`)) {
      switchView(newHash, false);
    }
  });
}

async function switchView(view, updateHash = true) {
  state.currentView = view;
  if (updateHash) {
    window.location.hash = `#${view}`;
  }

  // Toggle active class on sidebar items
  document.querySelectorAll('.nav-item').forEach(item => {
    if (item.getAttribute('data-view') === view) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Toggle visible sections
  document.querySelectorAll('.admin-view-section').forEach(sec => {
    if (sec.id === `view-${view}`) {
      sec.classList.add('active');
    } else {
      sec.classList.remove('active');
    }
  });

  // Update header title
  const titles = {
    dashboard: 'Mission Control Dashboard',
    users: 'Kelola Pengguna MyVA',
    'ai-cost': 'AI Cost & Profit Center',
    whatsapp: 'WhatsApp Delivery & Webhooks',
    queues: 'BullMQ Queue Processor',
    broadcast: 'Broadcast Announcement Center',
    prompts: 'Prompt Studio & Persona Editor',
    flags: 'System Feature Flags',
    analytics: 'Analytics & Growth Trend',
    health: 'System Infrastructure Health',
    payouts: 'Persetujuan Manual Penarikan Dana'
  };
  document.getElementById('page-title').textContent = titles[view] || 'Mission Control';

  // Toggle search bar visibility (only on users list view)
  const searchWrapper = document.getElementById('search-wrapper');
  if (searchWrapper) {
    searchWrapper.style.display = view === 'users' ? 'block' : 'none';
  }

  // Fetch view specific data
  loadViewData(view);
}

// Fetch routing actions
async function loadViewData(view) {
  try {
    switch (view) {
      case 'dashboard':
        await loadDashboardStats();
        await loadTimelineEvents();
        renderDashboardCharts();
        break;
      case 'users':
        await loadUsersList();
        break;
      case 'ai-cost':
        await loadAiCosts();
        break;
      case 'whatsapp':
        await loadWhatsAppMonitor();
        break;
      case 'queues':
        await loadQueueStats();
        break;
      case 'prompts':
        await loadPrompts();
        break;
      case 'flags':
        await loadFeatureFlags();
        break;
      case 'analytics':
        await loadAnalyticsCharts();
        break;
      case 'health':
        await loadSystemHealth();
        break;
      case 'payouts':
        await loadPayoutsList();
        break;
    }
  } catch (err) {
    console.error(`Error loading data for view ${view}:`, err);
    showToast('Gagal memuat data terbaru.', 'error');
  }
}

// 1. Dashboard Loaders
async function loadDashboardStats() {
  const res = await fetch(`${API_BASE_URL}/admin/dashboard-stats`, {
    headers: { 'Authorization': `Bearer ${state.token}` }
  });
  if (res.ok) {
    const data = await res.json();
    if (data.success && data.stats) {
      document.getElementById('kpi-total-users').textContent = data.stats.totalUsers;
      document.getElementById('kpi-active-users').textContent = data.stats.activeUsers;
      document.getElementById('kpi-paid-users').textContent = data.stats.paidUsers;
      document.getElementById('kpi-mrr').textContent = `Rp ${data.stats.mrr.toLocaleString('id-ID')}`;
      document.getElementById('kpi-ai-cost').textContent = `Rp ${Number(data.stats.aiCost).toLocaleString('id-ID')}`;
      document.getElementById('kpi-estimated-profit').textContent = `Rp ${data.stats.estimatedProfit.toLocaleString('id-ID')}`;
    }
  }

  // Load platform activity metrics
  const activityRes = await fetch(`${API_BASE_URL}/admin/platform-activity`, {
    headers: { 'Authorization': `Bearer ${state.token}` }
  });
  if (activityRes.ok) {
    const actData = await activityRes.json();
    if (actData.success && actData.activity) {
      document.getElementById('act-whatsapp').textContent = actData.activity.messagesToday;
      document.getElementById('act-reminders').textContent = actData.activity.remindersSent;
      document.getElementById('act-files').textContent = actData.activity.filesProcessed;
      document.getElementById('act-tasks').textContent = actData.activity.tasksCreated;
      document.getElementById('act-memory').textContent = actData.activity.memorySaved;
    }
  }
}

async function loadTimelineEvents() {
  const container = document.getElementById('timeline-events-body');
  if (!container) return;

  const res = await fetch(`${API_BASE_URL}/admin/recent-events`, {
    headers: { 'Authorization': `Bearer ${state.token}` }
  });

  if (res.ok) {
    const data = await res.json();
    if (data.success && data.events && data.events.length > 0) {
      container.innerHTML = data.events.map(ev => {
        const timeStr = new Date(ev.createdAt).toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit'
        });
        
        let colorClass = '';
        if (ev.type === 'user_registered') colorClass = 'success';
        if (ev.type === 'plan_upgraded') colorClass = 'success';
        if (ev.type.includes('failed') || ev.type.includes('error')) colorClass = 'danger';

        return `
          <div class="activity-item">
            <span class="activity-dot ${colorClass}"></span>
            <div class="activity-content">
              <strong>${ev.title}</strong>
              <p style="color: var(--text-secondary); margin-top: 2px;">${ev.description}</p>
              <div class="activity-time">${timeStr}</div>
            </div>
          </div>
        `;
      }).join('');
    } else {
      container.innerHTML = `<div style="color: var(--text-secondary); text-align: center; padding: 20px 0;">Belum ada kejadian tercatat hari ini.</div>`;
    }
  }
}

// 2. Users Management Loaders
async function loadUsersList() {
  const tbody = document.getElementById('users-table-body');
  if (!tbody) return;

  const url = `${API_BASE_URL}/admin/users?search=${encodeURIComponent(state.usersSearch)}&page=${state.usersPage}&limit=${state.usersLimit}&plan=${state.usersPlan}&status=${state.usersStatus}`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${state.token}` }
  });

  if (res.ok) {
    const data = await res.json();
    if (data.success && data.users) {
      if (data.users.length > 0) {
        tbody.innerHTML = data.users.map(u => {
          const joinedDate = new Date(u.createdAt).toLocaleDateString('id-ID', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
          });

          const planBadge = u.plan === 'pro' ? '<span class="badge badge-pro">Pro</span>' : '<span class="badge badge-free">Free</span>';
          const statusBadge = u.status === 'active' ? '<span class="badge badge-active">Active</span>' : '<span class="badge badge-suspended">Suspended</span>';

          return `
            <tr>
              <td>
                <strong>${u.name || 'User Baru'}</strong>
                <span style="font-size: 11px; color: var(--text-secondary); display: block;">${u.email}</span>
              </td>
              <td>+${u.waNumber || '-'}</td>
              <td>${planBadge}</td>
              <td>${statusBadge}</td>
              <td>${joinedDate}</td>
              <td style="text-align: right;">
                <button class="btn btn-sm btn-view-user" data-id="${u.id}" style="padding: 4px 8px; font-size: 11px;">Detail</button>
              </td>
            </tr>
          `;
        }).join('');

        // Attach action click listeners
        document.querySelectorAll('.btn-view-user').forEach(btn => {
          btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            openUserDetailsDrawer(id);
          });
        });
      } else {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding: 40px; color: var(--text-secondary);">Tidak ada pengguna ditemukan.</td></tr>`;
      }
    }
  }
}

async function openUserDetailsDrawer(id) {
  state.selectedUserId = id;
  const overlay = document.getElementById('user-drawer-overlay');
  const drawer = document.getElementById('user-details-drawer');
  if (!overlay || !drawer) return;

  // Fetch full details
  const res = await fetch(`${API_BASE_URL}/admin/users/${id}`, {
    headers: { 'Authorization': `Bearer ${state.token}` }
  });

  if (res.ok) {
    const data = await res.json();
    if (data.success && data.user) {
      const u = data.user;
      document.getElementById('drawer-user-name').textContent = u.name || 'User Detail';
      document.getElementById('drawer-email').textContent = u.email;
      document.getElementById('drawer-wa').textContent = `+${u.waNumber || '-'}`;
      document.getElementById('drawer-plan').textContent = u.plan === 'pro' ? 'Pro Sub' : 'Free Trial';
      document.getElementById('drawer-status').textContent = u.status;
      document.getElementById('drawer-joined').textContent = new Date(u.createdAt).toLocaleDateString('id-ID', {
        day: '2-digit', month: 'long', year: 'numeric'
      });

      // Populate usage counts
      document.getElementById('drawer-count-memories').textContent = data.counts.memories;
      document.getElementById('drawer-count-tasks').textContent = data.counts.tasks;
      document.getElementById('drawer-count-reminders').textContent = data.counts.reminders;
      document.getElementById('drawer-count-files').textContent = data.counts.files;

      // Populate affiliate info
      document.getElementById('drawer-aff-balance').textContent = `Rp ${Number(u.affiliateBalance || 0).toLocaleString('id-ID')}`;
      document.getElementById('drawer-aff-earned').textContent = `Rp ${Number(u.affiliateTotalEarned || 0).toLocaleString('id-ID')}`;

      // Suspend button text status
      const suspendBtn = document.getElementById('btn-drawer-suspend');
      if (suspendBtn) {
        if (u.status === 'suspended') {
          suspendBtn.textContent = 'Aktifkan Kembali';
          suspendBtn.style.color = 'var(--success)';
          suspendBtn.style.borderColor = 'rgba(34, 197, 94, 0.3)';
        } else {
          suspendBtn.textContent = 'Suspend User';
          suspendBtn.style.color = 'var(--danger)';
          suspendBtn.style.borderColor = 'rgba(239, 68, 68, 0.3)';
        }
      }

      // Open UI sliding animation
      overlay.classList.add('active');
      drawer.classList.add('active');
    }
  }
}

function closeUserDetailsDrawer() {
  const overlay = document.getElementById('user-drawer-overlay');
  const drawer = document.getElementById('user-details-drawer');
  if (overlay && drawer) {
    overlay.classList.remove('active');
    drawer.classList.remove('active');
  }
  state.selectedUserId = null;
}

// 3. AI Cost Center Loaders
async function loadAiCosts() {
  const tbody = document.getElementById('ai-costs-table-body');
  if (!tbody) return;

  const res = await fetch(`${API_BASE_URL}/admin/ai-costs`, {
    headers: { 'Authorization': `Bearer ${state.token}` }
  });

  if (res.ok) {
    const data = await res.json();
    if (data.success) {
      document.getElementById('cost-today').textContent = `Rp ${Number(data.stats.costToday).toLocaleString('id-ID')}`;
      document.getElementById('cost-this-month').textContent = `Rp ${Number(data.stats.costThisMonth).toLocaleString('id-ID')}`;
      document.getElementById('cost-average-user').textContent = `Rp ${Number(data.stats.averageCostPerUser).toLocaleString('id-ID')}`;

      if (data.topUsers && data.topUsers.length > 0) {
        tbody.innerHTML = data.topUsers.map(tu => {
          return `
            <tr>
              <td>
                <strong>${tu.name}</strong>
                <span style="font-size: 11px; color: var(--text-secondary); display: block;">${tu.email}</span>
              </td>
              <td class="text-center">${tu.messages}</td>
              <td class="text-center">${tu.inputTokens.toLocaleString('id-ID')}</td>
              <td class="text-center">${tu.outputTokens.toLocaleString('id-ID')}</td>
              <td class="text-center" style="font-weight: 600; color: var(--text);">Rp ${Number(tu.cost).toLocaleString('id-ID')}</td>
            </tr>
          `;
        }).join('');
      } else {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center" style="padding: 30px; color: var(--text-secondary);">Belum ada log penggunaan token AI.</td></tr>`;
      }
    }
  }
}

// 4. WhatsApp Monitor Loaders
async function loadWhatsAppMonitor() {
  const res = await fetch(`${API_BASE_URL}/admin/whatsapp-monitor`, {
    headers: { 'Authorization': `Bearer ${state.token}` }
  });

  if (res.ok) {
    const data = await res.json();
    if (data.success) {
      const renderStatus = (elId, status) => {
        const el = document.getElementById(elId);
        if (!el) return;
        el.textContent = status === 'healthy' ? 'HEALTHY' : status === 'warning' ? 'WARNING' : 'OFFLINE';
        el.className = 'kpi-value';
        el.style.color = status === 'healthy' ? 'var(--success)' : status === 'warning' ? 'var(--warning)' : 'var(--danger)';
      };

      renderStatus('wa-status-cloud', data.statuses.cloudApi);
      renderStatus('wa-status-webhook', data.statuses.webhook);
      renderStatus('wa-status-delivery', data.statuses.delivery);
      renderStatus('wa-status-media', data.statuses.media);

      document.getElementById('wa-incoming').textContent = data.metrics.incomingMessages;
      document.getElementById('wa-outgoing').textContent = data.metrics.outgoingMessages;
      document.getElementById('wa-failed').textContent = data.metrics.failedMessages;
      document.getElementById('wa-media').textContent = data.metrics.mediaUploads;
    }
  }
}

// 5. Queue Monitor Loaders
async function loadQueueStats() {
  const tbody = document.getElementById('queues-table-body');
  if (!tbody) return;

  const res = await fetch(`${API_BASE_URL}/admin/queue-stats`, {
    headers: { 'Authorization': `Bearer ${state.token}` }
  });

  if (res.ok) {
    const data = await res.json();
    if (data.success && data.queues) {
      const qs = data.queues;
      const makeRow = (name, q) => `
        <tr>
          <td><strong>${name}</strong></td>
          <td class="text-center" style="color: ${q.waiting > 0 ? 'var(--warning)' : 'var(--text-secondary)'}; font-weight: ${q.waiting > 0 ? '600' : 'normal'};">${q.waiting}</td>
          <td class="text-center" style="color: ${q.processing > 0 ? 'var(--primary)' : 'var(--text-secondary)'}; font-weight: ${q.processing > 0 ? '600' : 'normal'};">${q.processing}</td>
          <td class="text-center" style="color: var(--success);">${q.completed}</td>
          <td class="text-center" style="color: ${q.failed > 0 ? 'var(--danger)' : 'var(--text-secondary)'}; font-weight: ${q.failed > 0 ? '600' : 'normal'};">${q.failed}</td>
        </tr>
      `;

      tbody.innerHTML = `
        ${makeRow('Reminder Queue (reminder_queue)', qs.reminder)}
        ${makeRow('Email Queue (email_queue)', qs.email)}
        ${makeRow('File Processor Queue (file_processing_queue)', qs.file)}
        ${makeRow('AI Intent Routing Queue (ai_queue)', qs.ai)}
      `;
    }
  }
}

// 6. Prompts Loader
async function loadPrompts() {
  const res = await fetch(`${API_BASE_URL}/admin/prompts`, {
    headers: { 'Authorization': `Bearer ${state.token}` }
  });

  if (res.ok) {
    const data = await res.json();
    if (data.success && data.prompts) {
      const p = data.prompts;
      document.getElementById('prompt-global-editor').value = p['prompt:global'] || '';
      document.getElementById('prompt-persona-professional').value = p['prompt:personality:professional'] || '';
      document.getElementById('prompt-persona-friendly').value = p['prompt:personality:friendly'] || '';
      document.getElementById('prompt-persona-islamic').value = p['prompt:personality:islamic'] || '';
      document.getElementById('prompt-persona-business_partner').value = p['prompt:personality:business_partner'] || '';
      document.getElementById('prompt-persona-grumpy_boss').value = p['prompt:personality:grumpy_boss'] || '';
      document.getElementById('prompt-persona-romantic_partner').value = p['prompt:personality:romantic_partner'] || '';
      document.getElementById('prompt-briefing-editor').value = p['prompt:briefing'] || '';
    }
  }
}

// 7. Feature Flags Loader
async function loadFeatureFlags() {
  const res = await fetch(`${API_BASE_URL}/admin/feature-flags`, {
    headers: { 'Authorization': `Bearer ${state.token}` }
  });

  if (res.ok) {
    const data = await res.json();
    if (data.success && data.flags) {
      Object.keys(data.flags).forEach(fKey => {
        const chk = document.getElementById(`flag-${fKey}`);
        if (chk) {
          chk.checked = data.flags[fKey] === true;
        }
      });
    }
  }
}

// 8. System Health Loader
async function loadSystemHealth() {
  const res = await fetch(`${API_BASE_URL}/admin/system-health`, {
    headers: { 'Authorization': `Bearer ${state.token}` }
  });

  if (res.ok) {
    const data = await res.json();
    if (data.success && data.statuses) {
      const mapHealth = (elId, status) => {
        const el = document.getElementById(elId);
        if (!el) return;
        el.textContent = status.toUpperCase();
        if (status === 'healthy') {
          el.style.backgroundColor = 'rgba(34, 197, 94, 0.1)';
          el.style.color = 'var(--success)';
        } else if (status === 'warning') {
          el.style.backgroundColor = 'rgba(245, 158, 11, 0.1)';
          el.style.color = 'var(--warning)';
        } else {
          el.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
          el.style.color = 'var(--danger)';
        }
      };

      mapHealth('health-api', data.statuses.apiServer);
      mapHealth('health-db', data.statuses.database);
      mapHealth('health-redis', data.statuses.redis);
      mapHealth('health-worker', data.statuses.queueWorker);
      mapHealth('health-storage', data.statuses.storage);
      mapHealth('health-openai', data.statuses.openai);
      mapHealth('health-whatsapp-cloud', data.statuses.whatsappCloudApi);
    }
  }
}

// 9. Payouts (Affiliate Manual Cashouts)
async function loadPayoutsList() {
  const tbody = document.getElementById('admin-payouts-table-body');
  if (!tbody) return;

  const res = await fetch(`${API_BASE_URL}/admin/payout-requests`, {
    headers: { 'Authorization': `Bearer ${state.token}` }
  });

  if (res.ok) {
    const data = await res.json();
    if (data.payoutRequests && data.payoutRequests.length > 0) {
      tbody.innerHTML = data.payoutRequests.map(p => {
        const dateStr = new Date(p.createdAt).toLocaleDateString('id-ID', {
          day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        let statusBadge = '';
        if (p.status === 'pending') {
          statusBadge = `<span class="badge" style="background: rgba(245, 158, 11, 0.1); color: #D97706; border: 1px solid rgba(245, 158, 11, 0.2); font-weight: 600; padding: 2px 8px; border-radius: 9999px;">Pending</span>`;
        } else if (p.status === 'completed') {
          statusBadge = `<span class="badge" style="background: rgba(16, 185, 129, 0.1); color: #059669; border: 1px solid rgba(16, 185, 129, 0.2); font-weight: 600; padding: 2px 8px; border-radius: 9999px;">Selesai</span>`;
        } else {
          statusBadge = `<span class="badge" style="background: rgba(239, 68, 68, 0.1); color: #DC2626; border: 1px solid rgba(239, 68, 68, 0.2); font-weight: 600; padding: 2px 8px; border-radius: 9999px;">Ditolak</span>`;
        }

        let actionButtons = '-';
        if (p.status === 'pending') {
          actionButtons = `
            <div style="display: flex; gap: 8px; justify-content: center;">
              <button class="btn btn-primary btn-sm btn-payout-complete" data-id="${p.id}" style="background-color: #10B981; border-color: #10B981; padding: 4px 8px; font-size: 11px;">Selesai</button>
              <button class="btn btn-outline btn-sm btn-payout-reject" data-id="${p.id}" style="color: #EF4444; border-color: rgba(239, 68, 68, 0.3); padding: 4px 8px; font-size: 11px;">Tolak</button>
            </div>
          `;
        }

        return `
          <tr>
            <td style="padding: 12px; color: var(--text-primary); font-weight: 600; text-align: left;">
              ${p.user.name || 'User Baru'} 
              <span style="font-size: 11px; color: var(--text-secondary); display: block; font-weight: normal;">${p.user.email}</span>
            </td>
            <td class="text-center" style="padding: 12px; color: var(--text-secondary);">${dateStr}</td>
            <td style="padding: 12px; color: var(--text-primary); text-align: left;">
              <strong>${p.paymentMethod}</strong>
              <span style="font-size: 12px; color: var(--text-secondary); display: block;">Rek: ${p.accountNumber}</span>
              <span style="font-size: 12px; color: var(--text-secondary); display: block;">A/N: ${p.accountName}</span>
            </td>
            <td class="text-center" style="padding: 12px; color: var(--text-primary); font-weight: 600;">Rp ${Number(p.amount).toLocaleString('id-ID')}</td>
            <td class="text-center" style="padding: 12px;">${statusBadge}</td>
            <td class="text-center" style="padding: 12px;">${actionButtons}</td>
          </tr>
        `;
      }).join('');

      // Wire action actions
      document.querySelectorAll('.btn-payout-complete').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          if (confirm('Tandai penarikan komisi ini sebagai SELESAI?')) {
            await handleUpdatePayout(id, 'completed');
          }
        });
      });

      document.querySelectorAll('.btn-payout-reject').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          if (confirm('TOLAK penarikan komisi ini? Saldo komisi akan secara otomatis dikembalikan ke saldo user.')) {
            await handleUpdatePayout(id, 'rejected');
          }
        });
      });
    } else {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding: 30px; color: var(--text-secondary);">Belum ada permintaan penarikan dana.</td></tr>`;
    }
  }
}

async function handleUpdatePayout(id, status) {
  const res = await fetch(`${API_BASE_URL}/admin/payout-requests/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${state.token}`
    },
    body: JSON.stringify({ status })
  });

  if (res.ok) {
    showToast(status === 'completed' ? 'Pencairan berhasil ditandai selesai!' : 'Permintaan pencairan ditolak.');
    await loadPayoutsList();
  } else {
    showToast('Gagal memproses tindakan.', 'error');
  }
}

// Chart Renderers (using minimal Stripe theme colors)
function renderDashboardCharts() {
  const ctx = document.getElementById('userGrowthChart');
  if (!ctx) return;

  if (state.charts.dashboardGrowth) {
    state.charts.dashboardGrowth.destroy();
  }

  // Generate standard simulated last 30 days label
  const labels = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
  });

  // Simulated trend data matching the KPI counts
  const data = Array.from({ length: 30 }, (_, i) => {
    return 100 + i * 3 + Math.floor(Math.random() * 5);
  });

  state.charts.dashboardGrowth = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Total Users',
        data,
        borderColor: '#25D366',
        backgroundColor: 'rgba(37, 211, 102, 0.05)',
        borderWidth: 2,
        tension: 0.3,
        fill: true
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { ticks: { precision: 0 } }
      }
    }
  });
}

async function loadAnalyticsCharts() {
  // 1. MRR Growth Chart
  const mrrCtx = document.getElementById('mrrChart');
  if (mrrCtx) {
    if (state.charts.mrr) state.charts.mrr.destroy();
    state.charts.mrr = new Chart(mrrCtx, {
      type: 'line',
      data: {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun'],
        datasets: [{
          label: 'MRR Growth',
          data: [245000, 392000, 588000, 784000, 1078000, 1470000],
          borderColor: '#25D366',
          borderWidth: 2,
          tension: 0.2,
          fill: false
        }]
      },
      options: { responsive: true, plugins: { legend: { display: false } } }
    });
  }

  // 2. Plan Share Pie Chart
  const planCtx = document.getElementById('planShareChart');
  if (planCtx) {
    if (state.charts.plan) state.charts.plan.destroy();
    state.charts.plan = new Chart(planCtx, {
      type: 'doughnut',
      data: {
        labels: ['Free Trial', 'Pro Plan'],
        datasets: [{
          data: [70, 30],
          backgroundColor: ['#64748B', '#25D366'],
          borderWidth: 0
        }]
      },
      options: { responsive: true }
    });
  }

  // 3. AI Cost Trend Chart
  const costCtx = document.getElementById('aiCostTrendChart');
  if (costCtx) {
    if (state.charts.costTrend) state.charts.costTrend.destroy();
    state.charts.costTrend = new Chart(costCtx, {
      type: 'bar',
      data: {
        labels: ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'],
        datasets: [{
          label: 'AI Cost (Rupiah)',
          data: [12000, 15000, 18000, 14000, 22000, 9000, 7000],
          backgroundColor: '#0F172A',
          borderRadius: 4
        }]
      },
      options: { responsive: true, plugins: { legend: { display: false } } }
    });
  }
}

// User Action Listeners
function setupActionListeners() {
  // Search keyup debouncer
  const searchInput = document.getElementById('search-users-input');
  if (searchInput) {
    let timeout;
    searchInput.addEventListener('keyup', () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        state.usersSearch = searchInput.value;
        state.usersPage = 1;
        loadUsersList();
      }, 500);
    });
  }

  // Filters change
  const filterPlan = document.getElementById('filter-user-plan');
  if (filterPlan) {
    filterPlan.addEventListener('change', () => {
      state.usersPlan = filterPlan.value;
      state.usersPage = 1;
      loadUsersList();
    });
  }

  const filterStatus = document.getElementById('filter-user-status');
  if (filterStatus) {
    filterStatus.addEventListener('change', () => {
      state.usersStatus = filterStatus.value;
      state.usersPage = 1;
      loadUsersList();
    });
  }

  // Drawer closers
  const closeBtn = document.getElementById('btn-close-drawer');
  if (closeBtn) closeBtn.addEventListener('click', closeUserDetailsDrawer);

  const overlay = document.getElementById('user-drawer-overlay');
  if (overlay) overlay.addEventListener('click', closeUserDetailsDrawer);

  // Impersonate Action
  const impBtn = document.getElementById('btn-drawer-impersonate');
  if (impBtn) {
    impBtn.addEventListener('click', async () => {
      if (!state.selectedUserId) return;
      if (confirm('Apakah Anda yakin ingin melakukan Login As (Impersonasi) pengguna ini?')) {
        const res = await fetch(`${API_BASE_URL}/admin/users/${state.selectedUserId}/impersonate`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${state.token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.accessToken) {
            // Save token and open dashboard in a new tab
            localStorage.setItem('myva_token', data.accessToken);
            localStorage.setItem('myva_profile', JSON.stringify({
              username: data.user.name || 'User Impersonate',
              email: data.user.email,
              role: 'user'
            }));
            showToast('Sesi impersonasi berhasil dibuat. Membuka dashboard...');
            setTimeout(() => {
              window.open('/index.html#dashboard', '_blank');
              // Restore admin session
              localStorage.setItem('myva_token', state.token);
              localStorage.setItem('myva_profile', JSON.stringify(state.profile));
            }, 1000);
          }
        } else {
          showToast('Gagal membuat sesi impersonasi.', 'error');
        }
      }
    });
  }

  // Suspend Action
  const suspBtn = document.getElementById('btn-drawer-suspend');
  if (suspBtn) {
    suspBtn.addEventListener('click', async () => {
      if (!state.selectedUserId) return;
      const statusText = suspBtn.textContent.trim();
      const newStatus = statusText === 'Suspend User' ? 'suspended' : 'active';
      if (confirm(`Apakah Anda yakin ingin mengubah status pengguna menjadi ${newStatus}?`)) {
        const res = await fetch(`${API_BASE_URL}/admin/users/${state.selectedUserId}/status`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${state.token}`
          },
          body: JSON.stringify({ status: newStatus })
        });
        if (res.ok) {
          showToast(`Pengguna berhasil diset ke ${newStatus}.`);
          closeUserDetailsDrawer();
          loadUsersList();
        } else {
          showToast('Gagal memperbarui status pengguna.', 'error');
        }
      }
    });
  }

  // Reset trial
  const resetBtn = document.getElementById('btn-drawer-reset-trial');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      if (!state.selectedUserId) return;
      if (confirm('Apakah Anda yakin ingin mereset kuota quota/plan trial pengguna ini?')) {
        const res = await fetch(`${API_BASE_URL}/admin/users/${state.selectedUserId}/reset-trial`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${state.token}` }
        });
        if (res.ok) {
          showToast('Trial/Quota pengguna berhasil direset.');
          closeUserDetailsDrawer();
          loadUsersList();
        } else {
          showToast('Gagal mereset kuota pengguna.', 'error');
        }
      }
    });
  }

  // Feature Flags switches
  document.querySelectorAll('.flag-toggle').forEach(chk => {
    chk.addEventListener('change', async () => {
      const fName = chk.getAttribute('data-flag');
      const val = chk.checked;
      const res = await fetch(`${API_BASE_URL}/admin/feature-flags`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.token}`
        },
        body: JSON.stringify({ key: fName, value: val })
      });
      if (res.ok) {
        showToast(`Feature Flag '${fName}' diperbarui ke: ${val}`);
      } else {
        showToast('Gagal memperbarui feature flag.', 'error');
        chk.checked = !val; // rollback
      }
    });
  });

  // Prompt Studio saving
  const savePromptsBtn = document.getElementById('btn-save-prompts');
  if (savePromptsBtn) {
    savePromptsBtn.addEventListener('click', async () => {
      savePromptsBtn.disabled = true;
      savePromptsBtn.textContent = 'Menyimpan...';

      const updateKeyVal = async (key, value) => {
        return fetch(`${API_BASE_URL}/admin/prompts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${state.token}`
          },
          body: JSON.stringify({ key, value })
        });
      };

      try {
        await updateKeyVal('prompt:global', document.getElementById('prompt-global-editor').value);
        await updateKeyVal('prompt:personality:professional', document.getElementById('prompt-persona-professional').value);
        await updateKeyVal('prompt:personality:friendly', document.getElementById('prompt-persona-friendly').value);
        await updateKeyVal('prompt:personality:islamic', document.getElementById('prompt-persona-islamic').value);
        await updateKeyVal('prompt:personality:business_partner', document.getElementById('prompt-persona-business_partner').value);
        await updateKeyVal('prompt:personality:grumpy_boss', document.getElementById('prompt-persona-grumpy_boss').value);
        await updateKeyVal('prompt:personality:romantic_partner', document.getElementById('prompt-persona-romantic_partner').value);
        await updateKeyVal('prompt:briefing', document.getElementById('prompt-briefing-editor').value);

        showToast('Semua perubahan prompt berhasil disimpan!');
      } catch (err) {
        showToast('Gagal menyimpan prompt.', 'error');
      } finally {
        savePromptsBtn.disabled = false;
        savePromptsBtn.textContent = 'Simpan Perubahan Prompt';
      }
    });
  }

  // Broadcast Center form submission
  const broadcastForm = document.getElementById('form-admin-broadcast');
  if (broadcastForm) {
    broadcastForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('btn-broadcast-submit');
      
      const title = document.getElementById('broadcast-title').value;
      const message = document.getElementById('broadcast-message').value;
      const channel = document.getElementById('broadcast-channel').value;
      const audience = document.getElementById('broadcast-audience').value;

      if (!confirm(`Kirim broadcast ini ke target pengguna? Tindakan ini tidak dapat dibatalkan.`)) {
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Mengirim...';

      try {
        const res = await fetch(`${API_BASE_URL}/admin/broadcast`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${state.token}`
          },
          body: JSON.stringify({ title, message, channel, audience })
        });
        if (res.ok) {
          const data = await res.json();
          showToast(`Broadcast sukses dikirim ke ${data.whatsappSent} nomor WA dan ${data.emailSent} email!`);
          broadcastForm.reset();
        } else {
          showToast('Gagal mengirim broadcast pengumuman.', 'error');
        }
      } catch (err) {
        showToast('Gagal menghubungi server.', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Kirim Pengumuman';
      }
    });
  }

  // Broadcast preview button
  const previewBtn = document.getElementById('btn-broadcast-preview');
  if (previewBtn) {
    previewBtn.addEventListener('click', () => {
      const title = document.getElementById('broadcast-title').value || '(Judul)';
      const message = document.getElementById('broadcast-message').value || '(Pesan)';
      alert(`PREVIEW BROADCAST:\n\n*${title}*\n\n${message}`);
    });
  }

  // Refresh Queues button
  const refreshQueuesBtn = document.getElementById('btn-refresh-queues');
  if (refreshQueuesBtn) {
    refreshQueuesBtn.addEventListener('click', async () => {
      refreshQueuesBtn.disabled = true;
      refreshQueuesBtn.textContent = 'Refreshing...';
      await loadQueueStats();
      refreshQueuesBtn.disabled = false;
      refreshQueuesBtn.textContent = 'Refresh Antrean';
      showToast('Status antrean diperbarui.');
    });
  }

  // Refresh Health button
  const refreshHealthBtn = document.getElementById('btn-refresh-health');
  if (refreshHealthBtn) {
    refreshHealthBtn.addEventListener('click', async () => {
      refreshHealthBtn.disabled = true;
      refreshHealthBtn.textContent = 'Checking...';
      await loadSystemHealth();
      refreshHealthBtn.disabled = false;
      refreshHealthBtn.textContent = 'Periksa Kesehatan';
      showToast('Status infrastruktur diperbarui.');
    });
  }

  // Segarkan Payouts button
  const refreshPayoutsBtn = document.getElementById('btn-refresh-admin-payouts-page');
  if (refreshPayoutsBtn) {
    refreshPayoutsBtn.addEventListener('click', async () => {
      refreshPayoutsBtn.disabled = true;
      refreshPayoutsBtn.textContent = 'Menyegarkan...';
      await loadPayoutsList();
      refreshPayoutsBtn.disabled = false;
      refreshPayoutsBtn.textContent = 'Segarkan Data';
      showToast('Riwayat penarikan dana berhasil diperbarui.');
    });
  }

  // Logout Button
  const logoutBtn = document.getElementById('btn-logout-admin');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('myva_token');
      localStorage.removeItem('myva_profile');
      window.location.href = '/index.html#login';
    });
  }
}

// Entrypoint initialization
window.addEventListener('DOMContentLoaded', () => {
  if (verifyAuth()) {
    initRouter();
    setupActionListeners();
  }
});
