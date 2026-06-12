import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../database/prisma.service';
import { UsersService } from '../users/users.service';
import { WhatsAppApiService } from '../../integrations/whatsapp-api.service';
import { IntentRouterService } from './intent-router.service';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly whatsappApiService: WhatsAppApiService,
    private readonly intentRouterService: IntentRouterService,
    @InjectQueue('file_processing_queue') private readonly fileProcessingQueue: Queue,
    @InjectQueue('reminder_queue') private readonly reminderQueue: Queue,
  ) {}

  async handleIncomingMessage(from: string, text: string): Promise<void> {
    this.logger.log(`Handling message from ${from}: "${text}"`);

    // 1. Lookup user by WhatsApp number
    let user = await this.usersService.findOneByWaNumber(from);

    // If user doesn't exist, we auto-create a trial account for them
    if (!user) {
      this.logger.log(`User not found with WhatsApp number ${from}. Creating trial account.`);
      user = await this.usersService.create({
        email: `${from}@trial.naiva.ai`,
        waNumber: from,
        name: `WhatsApp User (${from})`,
        plan: 'free',
        status: 'active',
      });
    }

    // 2. Find or create conversation
    let conversation = await this.prisma.conversation.findUnique({
      where: {
        userId_waRoomId: {
          userId: user.id,
          waRoomId: from,
        },
      },
    });

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          userId: user.id,
          waRoomId: from,
        },
      });
    }

    // 3. Log incoming message
    await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderType: 'user',
        text,
      },
    });

    // Log usage
    await this.prisma.usageLog.create({
      data: {
        userId: user.id,
        actionType: 'WHATSAPP_MESSAGE',
        description: `Received message from user: "${text.substring(0, 30)}"`,
      },
    });

    // URL detection for web scraping & link summary
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const urls = text.match(urlRegex);
    const cleanText = text.trim().toLowerCase();
    const searchPrefixes = ['cari di internet', 'web search', 'browsing', 'tanya web', 'cari ', 'search '];
    const isSearchQuery = searchPrefixes.some(p => cleanText.startsWith(p));

    if (urls && urls.length > 0 && !isSearchQuery) {
      const targetUrl = urls[0];
      this.logger.log(`URL detected: ${targetUrl}. Enqueueing scraping job.`);

      const notifyText = `🔍 *Mendeteksi Link Web*:\nAsisten sedang membaca dan merangkum konten dari ${targetUrl} di latar belakang. Mohon tunggu sebentar...`;

      // Log notification as outgoing message
      await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderType: 'assistant',
          text: notifyText,
        },
      });

      // Send immediate notification back via WhatsApp
      await this.whatsappApiService.sendMessage(from, notifyText);

      // Add background job
      await this.fileProcessingQueue.add('process_web_url', {
        userId: user.id,
        fromPhone: from,
        url: targetUrl,
      });

      // Log usage
      await this.prisma.usageLog.create({
        data: {
          userId: user.id,
          actionType: 'WHATSAPP_MESSAGE',
          description: `Queued web scraping job for: ${targetUrl}`,
        },
      });

      return;
    }

    // 4. Route intent & get reply
    const replyText = await this.intentRouterService.routeMessage(user.id, text, user.persona);

    // 5. Log outgoing message
    await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderType: 'assistant',
        text: replyText,
      },
    });

    // 6. Send message back via WhatsApp Cloud API
    await this.whatsappApiService.sendMessage(from, replyText);
  }

  async handleIncomingAudio(from: string, audio: { id: string; mime_type: string }): Promise<void> {
    this.logger.log(`Handling incoming audio webhook from ${from}. Media ID: ${audio.id}`);

    // Find or create user
    let user = await this.usersService.findOneByWaNumber(from);
    if (!user) {
      this.logger.log(`User not found with WhatsApp number ${from}. Creating trial account.`);
      user = await this.usersService.create({
        email: `${from}@trial.naiva.ai`,
        waNumber: from,
        name: `WhatsApp User (${from})`,
        plan: 'free',
        status: 'active',
      });
    }

    // Add background processing job
    await this.fileProcessingQueue.add('process_voice_note', {
      userId: user.id,
      fromPhone: from,
      mediaId: audio.id,
      mimeType: audio.mime_type,
    });

    this.logger.log(`Queued process_voice_note job for user ${user.id}`);
  }

  async handleReminderInteraction(from: string, buttonId: string): Promise<void> {
    this.logger.log(`Handling reminder interaction for button ID: ${buttonId} from ${from}`);

    const isComplete = buttonId.startsWith('complete_reminder_');
    const reminderId = buttonId.replace(
      isComplete ? 'complete_reminder_' : 'snooze_reminder_',
      '',
    );

    const reminder = await this.prisma.reminder.findUnique({
      where: { id: reminderId },
      include: { user: true },
    });

    if (!reminder) {
      this.logger.warn(`Reminder ${reminderId} not found in database for interaction.`);
      await this.whatsappApiService.sendMessage(
        from,
        `⚠️ *Gagal memproses aksi*:\nPengingat ini tidak ditemukan di sistem.`,
      );
      return;
    }

    // Double check authorization
    if (reminder.user.waNumber !== from) {
      this.logger.warn(`User from number ${from} unauthorized to action reminder ${reminderId}.`);
      return;
    }

    if (isComplete) {
      // 1. Mark as completed in DB
      await this.prisma.reminder.update({
        where: { id: reminderId },
        data: { status: 'completed' },
      });

      // 2. Remove pending job from BullMQ if it exists
      const job = await this.reminderQueue.getJob(reminderId);
      if (job) {
        await job.remove();
      }

      await this.whatsappApiService.sendMessage(
        from,
        `✅ *Reminder Selesai*:\nReminder "*${reminder.title}*" telah ditandai sebagai selesai. Kerja bagus!`,
      );
      this.logger.log(`Reminder ${reminderId} completed successfully.`);
    } else {
      // Snooze Action - 10 minutes
      const snoozeMinutes = 10;
      const nextTime = new Date(Date.now() + snoozeMinutes * 60000);

      // 1. Update DB scheduledAt and reset status to pending
      await this.prisma.reminder.update({
        where: { id: reminderId },
        data: {
          scheduledAt: nextTime,
          status: 'pending',
        },
      });

      // 2. Reschedule job in BullMQ
      const job = await this.reminderQueue.getJob(reminderId);
      if (job) {
        await job.remove();
      }

      await this.reminderQueue.add(
        'send_reminder',
        { reminderId: reminder.id, userId: reminder.userId },
        {
          delay: snoozeMinutes * 60000,
          jobId: reminder.id,
          removeOnComplete: true,
        },
      );

      await this.whatsappApiService.sendMessage(
        from,
        `⏳ *Reminder Ditunda*:\nReminder "*${reminder.title}*" ditunda selama 10 menit. Kami akan mengingatkan Anda lagi pada pukul ${nextTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
      );
      this.logger.log(`Reminder ${reminderId} snoozed for 10 minutes.`);
    }
  }
}
