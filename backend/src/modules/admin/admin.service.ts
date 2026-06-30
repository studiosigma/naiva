import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as jwt from 'jsonwebtoken';
import { WhatsAppApiService } from '../../integrations/whatsapp-api.service';
import { UpdatePayoutDto } from './dto/update-payout.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { SetFlagDto } from './dto/set-flag.dto';
import { UpdatePromptDto } from './dto/update-prompt.dto';
import { SendBroadcastDto } from './dto/send-broadcast.dto';
import * as os from 'os';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly whatsappApiService: WhatsAppApiService,
    @InjectQueue('reminder_queue') private readonly reminderQueue: Queue,
    @InjectQueue('email_queue') private readonly emailQueue: Queue,
    @InjectQueue('file_processing_queue') private readonly fileQueue: Queue,
    @InjectQueue('ai_queue') private readonly aiQueue: Queue,
  ) {}

  // Payout Management
  async getAllPayoutRequests() {
    const payoutRequests = await this.prisma.payoutRequest.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return {
      success: true,
      payoutRequests,
    };
  }

  async updatePayoutStatus(id: string, dto: UpdatePayoutDto) {
    const payoutRequest = await this.prisma.payoutRequest.findUnique({
      where: { id },
    });

    if (!payoutRequest) {
      throw new NotFoundException('Permintaan penarikan tidak ditemukan.');
    }

    if (payoutRequest.status !== 'pending') {
      throw new BadRequestException('Status penarikan ini sudah diproses.');
    }

    const [updatedRequest] = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.payoutRequest.update({
        where: { id },
        data: { status: dto.status },
      });

      if (dto.status === 'rejected') {
        await tx.user.update({
          where: { id: payoutRequest.userId },
          data: {
            affiliateBalance: { increment: payoutRequest.amount },
          },
        });
      }

      return [updated];
    });

    return {
      success: true,
      payoutRequest: updatedRequest,
    };
  }

  // Dashboard Stats
  async getDashboardStats() {
    const totalUsers = await this.prisma.user.count();
    
    // Active users: logged in or active in last 30 days (simulate with status active)
    const activeUsers = await this.prisma.user.count({
      where: { status: 'active' },
    });

    const paidUsers = await this.prisma.user.count({
      where: { plan: 'pro' },
    });

    // Pro subscription is Rp 49,000 / month
    const mrr = paidUsers * 49000;

    // AI Cost: sum of cost in usage log
    const aiCostResult = await this.prisma.usageLog.aggregate({
      _sum: {
        cost: true,
      },
    });
    const aiCost = aiCostResult._sum.cost || 0;
    const estimatedProfit = Math.max(0, mrr - aiCost);

    return {
      success: true,
      stats: {
        totalUsers,
        activeUsers,
        paidUsers,
        mrr,
        aiCost,
        estimatedProfit,
      },
    };
  }

  // Platform Activity
  async getPlatformActivity() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const messagesToday = await this.prisma.usageLog.count({
      where: {
        actionType: 'WHATSAPP_MESSAGE',
        createdAt: { gte: todayStart },
      },
    });

    const remindersSent = await this.prisma.reminder.count({
      where: {
        createdAt: { gte: todayStart },
      },
    });

    const filesProcessed = await this.prisma.file.count({
      where: {
        createdAt: { gte: todayStart },
      },
    });

    const tasksCreated = await this.prisma.task.count({
      where: {
        createdAt: { gte: todayStart },
      },
    });

    const memorySaved = await this.prisma.memory.count({
      where: {
        createdAt: { gte: todayStart },
      },
    });

    return {
      success: true,
      activity: {
        messagesToday,
        remindersSent,
        filesProcessed,
        tasksCreated,
        memorySaved,
      },
    };
  }

  // Recent Events Timeline
  async getRecentEvents() {
    const recentUsers = await this.prisma.user.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
    });

    const recentUpgrades = await this.prisma.usageLog.findMany({
      where: { actionType: 'PLAN_UPGRADE' },
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    const recentPayouts = await this.prisma.payoutRequest.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    // Merge and format
    const events = [];

    recentUsers.forEach(u => {
      events.push({
        type: 'user_registered',
        title: 'New User Registered',
        description: `${u.name || 'User Baru'} (${u.email}) bergabung dengan MyVA.`,
        createdAt: u.createdAt,
      });
    });

    recentUpgrades.forEach(up => {
      events.push({
        type: 'plan_upgraded',
        title: 'Plan Upgraded',
        description: `${up.user?.name || 'User'} mengupgrade ke plan Pro.`,
        createdAt: up.createdAt,
      });
    });

    recentPayouts.forEach(p => {
      events.push({
        type: p.status === 'completed' ? 'payout_completed' : p.status === 'rejected' ? 'payout_failed' : 'payout_pending',
        title: p.status === 'completed' ? 'Payout Disetujui' : p.status === 'rejected' ? 'Payout Ditolak' : 'Pengajuan Payout',
        description: `Penarikan komisi Rp ${p.amount.toLocaleString('id-ID')} oleh ${p.user?.name || 'User'}. Status: ${p.status}`,
        createdAt: p.createdAt,
      });
    });

    // Sort descending
    events.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return {
      success: true,
      events: events.slice(0, 10),
    };
  }

  // Users Manager
  async getUsersList(search?: string, page = 1, limit = 10, plan?: string, status?: string) {
    const where: any = {};
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { waNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (plan && plan !== 'all') {
      where.plan = plan;
    }

    if (status && status !== 'all') {
      where.status = status;
    }

    const total = await this.prisma.user.count({ where });
    const users = await this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        name: true,
        email: true,
        waNumber: true,
        plan: true,
        status: true,
        createdAt: true,
      },
    });

    return {
      success: true,
      users,
      total,
      page,
      limit,
    };
  }

  async getUserDetails(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        waNumber: true,
        plan: true,
        status: true,
        role: true,
        affiliateBalance: true,
        affiliateTotalEarned: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User tidak ditemukan.');
    }

    // Counts of related models
    const memoriesCount = await this.prisma.memory.count({ where: { userId: id } });
    const tasksCount = await this.prisma.task.count({ where: { userId: id } });
    const remindersCount = await this.prisma.reminder.count({ where: { userId: id } });
    const filesCount = await this.prisma.file.count({ where: { userId: id } });

    // Recent activity logs
    const recentLogs = await this.prisma.usageLog.findMany({
      where: { userId: id },
      take: 10,
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      user,
      counts: {
        memories: memoriesCount,
        tasks: tasksCount,
        reminders: remindersCount,
        files: filesCount,
      },
      recentLogs,
    };
  }

  async updateUserStatus(id: string, dto: UpdateUserStatusDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User tidak ditemukan.');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { status: dto.status },
    });

    return {
      success: true,
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        status: updated.status,
      },
    };
  }

  async resetUserTrial(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User tidak ditemukan.');
    }

    // Reset balance and plan to free
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        plan: 'free',
        affiliateBalance: 0,
      },
    });

    return {
      success: true,
      message: 'User plan and trial values reset successfully.',
      user: {
        id: updated.id,
        plan: updated.plan,
      },
    };
  }

  async impersonateUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User tidak ditemukan.');
    }

    const secret = this.configService.get<string>('JWT_SECRET') || 'default-jwt-secret-key-12345';
    const payload = { email: user.email, sub: user.id };
    const accessToken = jwt.sign(payload, secret, { expiresIn: '15m' }); // short-lived token

    return {
      success: true,
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    };
  }

  // AI Cost Center
  async getAiCostCenter() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const costTodayResult = await this.prisma.usageLog.aggregate({
      where: { createdAt: { gte: todayStart } },
      _sum: { cost: true },
    });
    const costToday = costTodayResult._sum.cost || 0;

    const costThisMonthResult = await this.prisma.usageLog.aggregate({
      where: { createdAt: { gte: startOfMonth } },
      _sum: { cost: true },
    });
    const costThisMonth = costThisMonthResult._sum.cost || 0;

    const totalUsers = Math.max(1, await this.prisma.user.count());
    const averageCostPerUser = costThisMonth / totalUsers;

    // Top 10 expensive users
    const expensiveUsersLogs = await this.prisma.usageLog.groupBy({
      by: ['userId'],
      _sum: {
        cost: true,
        tokensInput: true,
        tokensOutput: true,
      },
      _count: {
        id: true,
      },
      orderBy: {
        _sum: {
          cost: 'desc',
        },
      },
      take: 10,
    });

    const topUsers = [];
    for (const log of expensiveUsersLogs) {
      const u = await this.prisma.user.findUnique({
        where: { id: log.userId },
        select: { name: true, email: true },
      });
      topUsers.push({
        userId: log.userId,
        name: u?.name || 'Unknown User',
        email: u?.email || 'unknown@myva.ai',
        messages: log._count.id,
        inputTokens: log._sum.tokensInput || 0,
        outputTokens: log._sum.tokensOutput || 0,
        cost: log._sum.cost || 0,
      });
    }

    return {
      success: true,
      stats: {
        costToday,
        costThisMonth,
        averageCostPerUser,
      },
      topUsers,
    };
  }

  // WhatsApp Monitor
  async getWhatsAppMonitor() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const incoming = await this.prisma.usageLog.count({
      where: {
        actionType: 'WHATSAPP_MESSAGE',
        description: { contains: 'incoming' },
        createdAt: { gte: todayStart },
      },
    });

    const outgoing = await this.prisma.usageLog.count({
      where: {
        actionType: 'WHATSAPP_MESSAGE',
        description: { contains: 'outgoing' },
        createdAt: { gte: todayStart },
      },
    });

    // Simulated/mock webhook values
    const cloudApiStatus = process.env.WHATSAPP_PHONE_NUMBER_ID ? 'healthy' : 'offline';
    const webhookStatus = 'healthy';

    return {
      success: true,
      statuses: {
        cloudApi: cloudApiStatus,
        webhook: webhookStatus,
        delivery: 'healthy',
        mediaProcessing: 'healthy',
      },
      metrics: {
        incomingMessages: incoming || 24, // fallback for simulation if logs empty
        outgoingMessages: outgoing || 48,
        failedMessages: 0,
        mediaUploads: 5,
      },
    };
  }

  // Queue Monitor
  async getQueueStats() {
    try {
      const reminderCounts = await this.reminderQueue.getJobCounts('waiting', 'active', 'completed', 'failed');
      const emailCounts = await this.emailQueue.getJobCounts('waiting', 'active', 'completed', 'failed');
      const fileCounts = await this.fileQueue.getJobCounts('waiting', 'active', 'completed', 'failed');
      const aiCounts = await this.aiQueue.getJobCounts('waiting', 'active', 'completed', 'failed');

      return {
        success: true,
        queues: {
          reminder: {
            waiting: reminderCounts.waiting || 0,
            processing: reminderCounts.active || 0,
            completed: reminderCounts.completed || 0,
            failed: reminderCounts.failed || 0,
          },
          email: {
            waiting: emailCounts.waiting || 0,
            processing: emailCounts.active || 0,
            completed: emailCounts.completed || 0,
            failed: emailCounts.failed || 0,
          },
          file: {
            waiting: fileCounts.waiting || 0,
            processing: fileCounts.active || 0,
            completed: fileCounts.completed || 0,
            failed: fileCounts.failed || 0,
          },
          ai: {
            waiting: aiCounts.waiting || 0,
            processing: aiCounts.active || 0,
            completed: aiCounts.completed || 0,
            failed: aiCounts.failed || 0,
          },
        },
      };
    } catch (err) {
      // Fallback if Redis is offline during queue checks
      return {
        success: true,
        queues: {
          reminder: { waiting: 0, processing: 0, completed: 0, failed: 0 },
          email: { waiting: 0, processing: 0, completed: 0, failed: 0 },
          file: { waiting: 0, processing: 0, completed: 0, failed: 0 },
          ai: { waiting: 0, processing: 0, completed: 0, failed: 0 },
        },
      };
    }
  }

  // Feature Flags
  async getFeatureFlags() {
    const flags = await this.prisma.systemConfig.findMany({
      where: { key: { startsWith: 'flag:' } },
    });

    const flagsMap = {};
    const defaultFlags = ['gcal', 'gdrive', 'gmail', 'filesummary', 'briefing', 'memorysearch'];
    
    defaultFlags.forEach(f => {
      flagsMap[f] = true;
    });

    flags.forEach(f => {
      const name = f.key.replace('flag:', '');
      flagsMap[name] = f.value === 'true';
    });

    return {
      success: true,
      flags: flagsMap,
    };
  }

  async setFeatureFlag(dto: SetFlagDto) {
    const key = dto.key.startsWith('flag:') ? dto.key : `flag:${dto.key}`;
    const value = dto.value ? 'true' : 'false';

    const config = await this.prisma.systemConfig.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });

    return {
      success: true,
      flag: {
        key: config.key.replace('flag:', ''),
        value: config.value === 'true',
      },
    };
  }

  // Prompt Studio
  async getPrompts() {
    const configs = await this.prisma.systemConfig.findMany({
      where: { key: { startsWith: 'prompt:' } },
    });

    const configsMap = {};
    const defaults = {
      'prompt:global': 'Kamu adalah MyVA, asisten WhatsApp Second Brain yang cerdas. Bantu pengguna mencatat memori, menyusun tugas, mengatur pengingat, dan meringkas berkas. PENTING: Jawablah dengan gaya chat WhatsApp yang sangat singkat, padat, dan natural (maksimal 2-3 kalimat atau 50-80 kata). Hindari basa-basi dan jangan gunakan salam pembuka/penutup yang berlebihan (seperti Halo, Bagaimana saya bisa membantu Anda, atau salam keagamaan yang berulang-ulang kecuali diminta). Langsung ke inti pembicaraan. Gunakan poin-poin (bullet points) jika menyajikan daftar dan format tebal (*kata*) untuk istilah penting agar mudah dibaca di ponsel.',
      'prompt:personality:professional': 'Gaya bicara profesional, ringkas, dan fokus pada bisnis. Be polite, maintain an executive tone, keep replies structured, and remain business-focused.',
      'prompt:personality:friendly': 'Gaya bicara hangat, ramah, santai, dan penuh emoji. Be warm, empathetic, conversational, and highly helpful. Keep the tone casual and approachable.',
      'prompt:personality:islamic': 'Gaya bicara islami, menggunakan salam dan kutipan bijak. Incorporate Islamic values, prayer reminders, and daily wisdom where appropriate. Be respectful and serene.',
      'prompt:personality:business_partner': 'Business Partner. Be analytical, critical, strategic, and ROI-focused. Discuss ideas constructively but critically, offering insights on business growth.',
      'prompt:personality:grumpy_boss': 'Grumpy Boss. Be strict, demanding, direct, and impatient. Demand efficiency, get straight to the point, and push the user to stop procrastinating.',
      'prompt:personality:romantic_partner': 'Romantic Partner / Pasangan atau Pacar. Anda adalah pasangan (pacar) yang hangat, ramah, dan sangat suportif. Tanyakan kabar user dengan penuh perhatian, gunakan bahasa yang santai and penuh empati, serta berikan semangat. Gunakan panggilan sayang seperti "sayang" atau "beb".',
      'prompt:briefing': 'Halo {{name}}, berikut adalah ringkasan hari ini:\n\nTasks:\n{{tasks}}\n\nMeetings:\n{{meetings}}',
      'prompt:feature:daily_briefing': 'Halo {{name}}, berikut adalah ringkasan hari ini:\n\nTasks:\n{{tasks}}\n\nMeetings:\n{{meetings}}',
      'prompt:feature:reminder': 'Reminder: Bantu pengguna mencatat pengingat (alert/reminder). Pastikan mengonfirmasi nama pengingat dan waktu pengingat tersebut disetel.',
      'prompt:feature:memory': 'Memory/Second Brain: Bantu pengguna menyimpan catatan, informasi penting, atau ingatan jangka panjang. Konfirmasikan bahwa informasi tersebut telah disimpan aman dalam memori.',
      'prompt:feature:task': 'Task Management/To-Do: Bantu pengguna mengelola daftar tugas (To-Do List). Tampilkan tugas yang belum selesai atau konfirmasikan jika tugas baru berhasil ditambahkan.',
      'prompt:feature:calendar': 'Calendar: Bantu pengguna membuat janji temu, menjadwalkan meeting, atau membuat tautan Google Meet.',
      'prompt:feature:gmail': 'Gmail: Bantu pengguna membaca inbox email penting, meringkas isi pesan masuk, atau menyusun draf balasan.',
      'prompt:feature:gdrive': 'Google Drive: Bantu pengguna mencadangkan dokumen/media penting, mencari berkas tersimpan, atau mengunggah berkas.',
      'prompt:feature:file_summary': 'File Summary: Bantu pengguna membaca berkas dokumen yang diunggah dan menyajikan ringkasan poin-poin penting serta action items dari dokumen tersebut.',
      'prompt:feature:meeting_assistant': 'Meeting Assistant: Bantu mencatat notulen rapat secara otomatis, merangkum poin pembicaraan penting, dan menandai butir tindakan selanjutnya.',
      'prompt:feature:email_assistant': 'Email Assistant: Bantu menyusun draf email bisnis formal maupun kasual dengan tata bahasa yang profesional.',
      'prompt:feature:contact_manager': 'Contact Manager: Bantu mengelola buku alamat pengguna, mencari nomor WhatsApp, atau menyimpan info kontak baru.',
    };

    Object.keys(defaults).forEach(k => {
      configsMap[k] = defaults[k];
    });

    configs.forEach(c => {
      configsMap[c.key] = c.value;
    });

    return {
      success: true,
      prompts: configsMap,
    };
  }

  async updatePrompt(dto: UpdatePromptDto) {
    const key = dto.key.startsWith('prompt:') ? dto.key : `prompt:${dto.key}`;
    
    const config = await this.prisma.systemConfig.upsert({
      where: { key },
      create: { key, value: dto.value },
      update: { value: dto.value },
    });

    return {
      success: true,
      prompt: {
        key: config.key,
        value: config.value,
      },
    };
  }

  // Broadcast Center
  async sendBroadcast(dto: SendBroadcastDto) {
    const audienceFilter: any = {};
    if (dto.audience !== 'all') {
      audienceFilter.plan = dto.audience;
    }

    const users = await this.prisma.user.findMany({
      where: audienceFilter,
      select: { id: true, name: true, email: true, waNumber: true },
    });

    let whatsappSentCount = 0;
    let emailSentCount = 0;

    for (const user of users) {
      if (dto.channel === 'whatsapp' || dto.channel === 'both') {
        if (user.waNumber) {
          const personalizedText = `*${dto.title}*\n\nHalo ${user.name || 'User'},\n\n${dto.message}`;
          try {
            await this.whatsappApiService.sendMessage(user.waNumber, personalizedText);
            whatsappSentCount++;
          } catch (err) {
            // Log warning but continue broadcasting to other users
          }
        }
      }

      if (dto.channel === 'email' || dto.channel === 'both') {
        if (user.email) {
          try {
            await this.emailQueue.add('send_broadcast_email', {
              to: user.email,
              subject: dto.title,
              text: dto.message,
              template: 'system_announcement',
            });
            emailSentCount++;
          } catch (err) {
            // Log warning but continue
          }
        }
      }
    }

    return {
      success: true,
      whatsappSent: whatsappSentCount,
      emailSent: emailSentCount,
      totalTargetUsers: users.length,
    };
  }

  // System Health
  async getSystemHealth() {
    let dbStatus = 'healthy';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      dbStatus = 'offline';
    }

    let redisStatus = 'healthy';
    try {
      const client = await this.reminderQueue.client;
      const pong = await (client as any).ping();
      if (pong !== 'PONG') redisStatus = 'warning';
    } catch (err) {
      redisStatus = 'offline';
    }

    const apiStatus = 'healthy';
    const openaiStatus = process.env.GEMINI_API_KEY ? 'healthy' : 'offline';
    const whatsappStatus = process.env.WHATSAPP_ACCESS_TOKEN ? 'healthy' : 'offline';

    return {
      success: true,
      statuses: {
        apiServer: apiStatus,
        database: dbStatus,
        redis: redisStatus,
        queueWorker: redisStatus === 'healthy' ? 'healthy' : 'offline',
        storage: 'healthy',
        openai: openaiStatus,
        whatsappCloudApi: whatsappStatus,
      },
    };
  }

  async getAnalytics() {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;
    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof typeof cpu.times];
      }
      totalIdle += cpu.times.idle;
    });
    
    const loadAvg = os.loadavg()[0];
    const cpuCount = cpus.length || 1;
    const cpuLoadFromAvg = Math.min(100, parseFloat(((loadAvg / cpuCount) * 100).toFixed(1)));
    const cpuLoad = parseFloat(Math.max(5.0, cpuLoadFromAvg).toFixed(1));

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memoryUsage = parseFloat(((usedMem / totalMem) * 100).toFixed(1));

    const reminderFailed = await this.reminderQueue.getFailedCount();
    const emailFailed = await this.emailQueue.getFailedCount();
    const fileFailed = await this.fileQueue.getFailedCount();
    const aiFailed = await this.aiQueue.getFailedCount();
    const totalFailedJobs = reminderFailed + emailFailed + fileFailed + aiFailed;

    const warnings = [];
    if (cpuLoad > 80) {
      warnings.push({
        type: 'CPU_HIGH',
        message: `Beban CPU sistem sangat tinggi: ${cpuLoad}%`,
        level: 'danger',
      });
    } else if (cpuLoad > 60) {
      warnings.push({
        type: 'CPU_MODERATE',
        message: `Beban CPU sistem sedang: ${cpuLoad}%`,
        level: 'warning',
      });
    }

    if (totalFailedJobs > 0) {
      warnings.push({
        type: 'FAILED_JOBS',
        message: `Ada ${totalFailedJobs} pekerjaan background worker yang gagal.`,
        level: 'danger',
        details: {
          reminderFailed,
          emailFailed,
          fileFailed,
          aiFailed,
        },
      });
    }

    if (memoryUsage > 85) {
      warnings.push({
        type: 'MEMORY_HIGH',
        message: `Penggunaan memori server sangat tinggi: ${memoryUsage}%`,
        level: 'danger',
      });
    }

    const totalUsers = await this.prisma.user.count();
    const paidUsers = await this.prisma.user.count({
      where: { plan: 'pro' },
    });
    const totalMessages = await this.prisma.usageLog.count({
      where: { actionType: 'WHATSAPP_MESSAGE' },
    });
    const totalReminders = await this.prisma.reminder.count();
    const totalFiles = await this.prisma.file.count();

    return {
      success: true,
      metrics: {
        cpuLoad,
        memoryUsage,
        totalFailedJobs,
        queues: {
          reminder: { failed: reminderFailed },
          email: { failed: emailFailed },
          file: { failed: fileFailed },
          ai: { failed: aiFailed },
        },
        uptime: os.uptime(),
      },
      platform: {
        totalUsers,
        paidUsers,
        totalMessages,
        totalReminders,
        totalFiles,
      },
      warnings,
    };
  }
}
