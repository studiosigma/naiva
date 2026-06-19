const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const API_BASE_URL = 'http://localhost:3000/api';

async function main() {
  console.log('--- STARTING SUPER ADMIN HTTP ENDPOINTS VERIFICATION ---');

  // Find admin user
  const admin = await prisma.user.findFirst({
    where: { email: 'studia6ma@gmail.com' }
  });

  if (!admin) {
    console.error('Error: Admin user studia6ma@gmail.com not found.');
    process.exit(1);
  }

  // Find a regular test user for impersonation and resetting trial
  let testUser = await prisma.user.findFirst({
    where: { email: { not: 'studia6ma@gmail.com' } }
  });

  if (!testUser) {
    testUser = await prisma.user.create({
      data: {
        email: 'test_regular@myva.ai',
        name: 'Regular Test User',
        waNumber: '89999999991',
        plan: 'free',
        status: 'active'
      }
    });
    console.log(`Created test user: ${testUser.email}`);
  }

  // Generate Admin JWT Token
  const secret = process.env.JWT_SECRET || 'default-jwt-secret-key-12345';
  const token = jwt.sign({ email: admin.email, sub: admin.id }, secret, { expiresIn: '1h' });
  console.log(`Generated Admin Token: ${token.substring(0, 15)}...`);

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  async function testRoute(name, url, method = 'GET', body = null) {
    try {
      const response = await fetch(`${API_BASE_URL}${url}`, {
        method,
        headers,
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      const data = await response.json();
      if (response.ok && data.success) {
        console.log(`✅ ${name} - SUCCESS (${response.status})`);
        return data;
      } else {
        console.error(`❌ ${name} - FAILED (${response.status}):`, JSON.stringify(data));
        throw new Error(`${name} failed`);
      }
    } catch (err) {
      console.error(`❌ ${name} - EXCEPTION:`, err.message);
      throw err;
    }
  }

  // 1. Dashboard Stats
  await testRoute('Dashboard Stats', '/admin/dashboard-stats');

  // 2. Platform Activity
  await testRoute('Platform Activity', '/admin/platform-activity');

  // 3. Recent Events
  await testRoute('Recent Events', '/admin/recent-events');

  // 4. Users list
  const usersData = await testRoute('Users List', '/admin/users?page=1&limit=5');

  // 5. User Details
  await testRoute('User Details', `/admin/users/${testUser.id}`);

  // 6. User Status Toggle
  await testRoute('Update User Status (Suspend)', `/admin/users/${testUser.id}/status`, 'PATCH', {
    status: 'suspended'
  });
  await testRoute('Update User Status (Reactivate)', `/admin/users/${testUser.id}/status`, 'PATCH', {
    status: 'active'
  });

  // 7. Impersonate User
  await testRoute('Impersonate User', `/admin/users/${testUser.id}/impersonate`, 'POST');

  // 8. Reset User Trial
  await testRoute('Reset User Trial', `/admin/users/${testUser.id}/reset-trial`, 'POST');

  // 9. AI Cost Center
  await testRoute('AI Cost Center', '/admin/ai-costs');

  // 10. WhatsApp Monitor
  await testRoute('WhatsApp Monitor', '/admin/whatsapp-monitor');

  // 11. Queue Stats
  await testRoute('Queue Stats', '/admin/queue-stats');

  // 12. Feature Flags (Get & Set)
  await testRoute('Get Feature Flags', '/admin/feature-flags');
  await testRoute('Set Feature Flag', '/admin/feature-flags', 'POST', {
    key: 'gcal',
    value: false
  });
  await testRoute('Reset Feature Flag', '/admin/feature-flags', 'POST', {
    key: 'gcal',
    value: true
  });

  // 13. Prompts (Get & Set)
  await testRoute('Get Prompts', '/admin/prompts');
  await testRoute('Set Prompt', '/admin/prompts', 'POST', {
    key: 'prompt:global',
    value: 'Kamu adalah MyVA, asisten cerdas WhatsApp.'
  });

  // 14. System Health
  await testRoute('System Health', '/admin/system-health');

  // 15. Payouts (Get)
  await testRoute('Get Payouts', '/admin/payout-requests');

  console.log('--- ALL SUPER ADMIN ENDPOINTS VERIFIED SUCCESSFULLY ---');
}

main()
  .catch(err => {
    console.error('Verification script failed:', err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
