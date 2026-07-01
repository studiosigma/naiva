import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../database/prisma.service';
import { UsersService } from '../users/users.service';
import { WhatsAppApiService } from '../../integrations/whatsapp-api.service';
import { IntentRouterService } from './intent-router.service';
import { normalizePhoneNumber } from '../../common/utils/phone-utils';
import { S3Service } from '../../integrations/s3.service';
import { AIService } from '../ai/ai.service';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private rateLimitMap = new Map<string, number[]>();

  private checkRateLimit(from: string): boolean {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    let timestamps = this.rateLimitMap.get(from) || [];
    // Clean up old timestamps
    timestamps = timestamps.filter(t => t > oneMinuteAgo);
    
    if (timestamps.length >= 10) {
      this.rateLimitMap.set(from, timestamps); // Update the cleaned up timestamps back
      return false; // Rate limit exceeded
    }
    
    timestamps.push(now);
    this.rateLimitMap.set(from, timestamps);
    
    // Occasional cleanup of the map to prevent memory leaks
    if (this.rateLimitMap.size > 1000) {
      for (const [key, times] of this.rateLimitMap.entries()) {
        const validTimes = times.filter(t => t > oneMinuteAgo);
        if (validTimes.length === 0) {
          this.rateLimitMap.delete(key);
        } else {
          this.rateLimitMap.set(key, validTimes);
        }
      }
    }
    
    return true; // Allowed
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly whatsappApiService: WhatsAppApiService,
    private readonly intentRouterService: IntentRouterService,
    private readonly s3Service: S3Service,
    private readonly aiService: AIService,
    @InjectQueue('file_processing_queue') private readonly fileProcessingQueue: Queue,
    @InjectQueue('reminder_queue') private readonly reminderQueue: Queue,
  ) {}

  async handleIncomingMessage(fromRaw: string, text: string, waMessageId?: string): Promise<void> {
    const from = normalizePhoneNumber(fromRaw);
    this.logger.log(`Handling message from ${from} (raw: ${fromRaw}): "${text}" (ID: ${waMessageId || 'N/A'})`);

    if (waMessageId) {
      const existingMessage = await this.prisma.message.findUnique({
        where: { whatsappMessageId: waMessageId },
      });
      if (existingMessage) {
        this.logger.warn(`Duplicate WhatsApp message ID detected: ${waMessageId}. Skipping processing.`);
        return;
      }
    }

    if (!this.checkRateLimit(from)) {
      this.logger.warn(`Rate limit exceeded for ${from}`);
      const timestamps = this.rateLimitMap.get(from);
      // Only send warning on the exact 10th/11th message to avoid spamming the warning itself
      if (timestamps && timestamps.length === 10) {
         await this.whatsappApiService.sendMessage(from, `⚠️ *Sistem Pengamanan*\n\nAnda mengirim pesan terlalu cepat (Batas 10 pesan/menit). Mohon jeda sejenak untuk menghindari pemblokiran akun otomatis.`);
      }
      return;
    }

    // Check if it's a verification message
    if (/^verifikasi\s+myva-\d{4}$/i.test(text.trim())) {
      const match = text.trim().match(/^verifikasi\s+(myva-\d{4})$/i);
      const code = match ? match[1].toUpperCase() : '';
      const targetUser = await this.prisma.user.findFirst({
        where: { waVerificationCode: code }
      });

      if (!targetUser) {
        await this.whatsappApiService.sendMessage(from, `❌ Kode verifikasi *${code}* tidak ditemukan atau sudah kedaluwarsa. Silakan periksa kembali kode di dasbor Settings Anda.`);
        return;
      }

      // Check if code has expired
      if (targetUser.waVerificationExpires && targetUser.waVerificationExpires < new Date()) {
        await this.whatsappApiService.sendMessage(from, `❌ Kode verifikasi *${code}* sudah kedaluwarsa. Silakan regenerasi kode baru di dasbor Settings Anda.`);
        return;
      }

      const conflictingUser = await this.prisma.user.findUnique({
        where: { waNumber: from }
      });
      
      if (conflictingUser && conflictingUser.id !== targetUser.id) {
        if (conflictingUser.waVerified) {
          await this.whatsappApiService.sendMessage(from, `⚠️ Nomor WhatsApp ini sudah terverifikasi pada akun lain (${conflictingUser.email}).`);
          return;
        }
        await this.prisma.user.update({
          where: { id: conflictingUser.id },
          data: { waNumber: null }
        });
        await this.usersService.invalidateCache(conflictingUser.id);
      }

      await this.prisma.user.update({
        where: { id: targetUser.id },
        data: {
          waNumber: from,
          waVerified: true,
          waVerificationCode: null,
          waVerificationExpires: null
        }
      });
      await this.usersService.invalidateCache(targetUser.id);

      await this.whatsappApiService.sendMessage(
        from,
        `🎉 *Verifikasi Berhasil!*\n\nAkun MyVA dengan email *${targetUser.email}* kini terhubung secara aman dengan nomor WhatsApp ini.\n\n💡 *Mulai Asisten MyVA Anda!*\nAnda dapat berbicara dengan saya menggunakan bahasa alami biasa (misal: "tolong ingetin besok jemput adik jam 5 sore").\n\nKetik *bantuan* atau *help* kapan saja di chat ini untuk memunculkan daftar lengkap perintah yang didukung. Selamat menggunakan! 🚀`
      );
      return;
    }

    // 1. Lookup user by WhatsApp number
    let user = await this.usersService.findOneByWaNumber(from);

    // If user doesn't exist, we auto-create a trial account for them
    if (!user) {
      this.logger.log(`User not found with WhatsApp number ${from}. Creating trial account.`);
      user = await this.usersService.create({
        email: `${from}@trial.myva.ai`,
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
        whatsappMessageId: waMessageId || null,
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
      if (user.plan === 'free') {
        const warning = `⚠️ *Fitur Ringkasan Web Terbatas* ⚠️\n\nFitur merangkum konten dari link/URL via WhatsApp hanya tersedia pada paket *Basic* atau *Pro*. Silakan upgrade paket Anda di dasbor MyVA! 🔍`;
        await this.whatsappApiService.sendMessage(from, warning);
        return;
      }
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
    try {
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
    } catch (error) {
      this.logger.error(`Error processing message for user ${user.id}: ${error.message}`);
      
      const fallbackMsg = `🙏 *Mohon Maaf*\n\nSistem MyVA saat ini sedang mengalami gangguan teknis. Mohon tunggu beberapa menit dan coba lagi ya.`;
      
      // Attempt to send the fallback message to user
      await this.whatsappApiService.sendMessage(from, fallbackMsg).catch(err => {
        this.logger.error(`Failed to send fallback message: ${err.message}`);
      });
    }
  }

  async handleIncomingAudio(fromRaw: string, audio: { id: string; mime_type: string }, waMessageId?: string): Promise<void> {
    const from = normalizePhoneNumber(fromRaw);
    this.logger.log(`Handling incoming audio webhook from ${from} (raw: ${fromRaw}). Media ID: ${audio.id} (ID: ${waMessageId || 'N/A'})`);

    if (waMessageId) {
      const existingMessage = await this.prisma.message.findUnique({
        where: { whatsappMessageId: waMessageId },
      });
      if (existingMessage) {
        this.logger.warn(`Duplicate WhatsApp audio message ID detected: ${waMessageId}. Skipping processing.`);
        return;
      }
    }

    if (!this.checkRateLimit(from)) {
      this.logger.warn(`Rate limit exceeded for audio from ${from}`);
      const timestamps = this.rateLimitMap.get(from);
      if (timestamps && timestamps.length === 10) {
         await this.whatsappApiService.sendMessage(from, `⚠️ *Sistem Pengamanan*\n\nAnda mengirim pesan terlalu cepat (Batas 10 pesan/menit). Mohon jeda sejenak untuk menghindari pemblokiran akun otomatis.`);
      }
      return;
    }

    // Find or create user
    let user = await this.usersService.findOneByWaNumber(from);
    if (!user) {
      this.logger.log(`User not found with WhatsApp number ${from}. Creating trial account.`);
      user = await this.usersService.create({
        email: `${from}@trial.myva.ai`,
        waNumber: from,
        name: `WhatsApp User (${from})`,
        plan: 'free',
        status: 'active',
      });
    }

    if (user.plan === 'free') {
      const warning = `⚠️ *Fitur Voice Note Terbatas* ⚠️\n\nFitur transkripsi & rangkuman pesan suara (voice note) via WhatsApp hanya tersedia pada paket *Basic* atau *Pro*. Silakan upgrade paket Anda di dasbor MyVA! 🎙️`;
      await this.whatsappApiService.sendMessage(from, warning);
      return;
    }

    // Add background processing job
    await this.fileProcessingQueue.add('process_voice_note', {
      userId: user.id,
      fromPhone: from,
      mediaId: audio.id,
      mimeType: audio.mime_type,
      waMessageId,
    }, {
      jobId: waMessageId, // BullMQ automatically prevents duplicate queue entries
    });

    this.logger.log(`Queued process_voice_note job for user ${user.id} (Job ID: ${waMessageId || 'auto'})`);
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
        `⏳ *Reminder Ditunda*:\nReminder "*${reminder.title}*" ditunda selama 10 menit. Kami akan mengingatkan Anda lagi pada pukul ${nextTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })}.`,
      );
      this.logger.log(`Reminder ${reminderId} snoozed for 10 minutes.`);
    }
  }

  async simulateMessage(fromRaw: string, text: string): Promise<string> {
    const from = normalizePhoneNumber(fromRaw);

    // Check if it's a verification message
    if (/^verifikasi\s+myva-\d{4}$/i.test(text.trim())) {
      const match = text.trim().match(/^verifikasi\s+(myva-\d{4})$/i);
      const code = match ? match[1].toUpperCase() : '';
      const targetUser = await this.prisma.user.findFirst({
        where: { waVerificationCode: code }
      });

      if (!targetUser) {
        return `❌ Kode verifikasi *${code}* tidak ditemukan atau sudah kedaluwarsa. Silakan periksa kembali kode di dasbor Settings Anda.`;
      }

      // Check if code has expired
      if (targetUser.waVerificationExpires && targetUser.waVerificationExpires < new Date()) {
        return `❌ Kode verifikasi *${code}* sudah kedaluwarsa. Silakan regenerasi kode baru di dasbor Settings Anda.`;
      }

      const conflictingUser = await this.prisma.user.findUnique({
        where: { waNumber: from }
      });
      
      if (conflictingUser && conflictingUser.id !== targetUser.id) {
        if (conflictingUser.waVerified) {
          return `⚠️ Nomor WhatsApp ini sudah terverifikasi pada akun lain (${conflictingUser.email}).`;
        }
        await this.prisma.user.update({
          where: { id: conflictingUser.id },
          data: { waNumber: null }
        });
        await this.usersService.invalidateCache(conflictingUser.id);
      }

      await this.prisma.user.update({
        where: { id: targetUser.id },
        data: {
          waNumber: from,
          waVerified: true,
          waVerificationCode: null,
          waVerificationExpires: null
        }
      });
      await this.usersService.invalidateCache(targetUser.id);

      return `🎉 *Verifikasi Berhasil!*\n\nAkun MyVA dengan email *${targetUser.email}* kini terhubung secara aman dengan nomor WhatsApp ini.\n\n💡 *Mulai Asisten MyVA Anda!*\nAnda dapat berbicara dengan saya menggunakan bahasa alami biasa (misal: "tolong ingetin besok jemput adik jam 5 sore").\n\nKetik *bantuan* atau *help* kapan saja di chat ini untuk memunculkan daftar lengkap perintah yang didukung. Selamat menggunakan! 🚀`;
    }

    let user = await this.usersService.findOneByWaNumber(from);
    if (!user) {
      user = await this.prisma.user.findFirst();
      if (!user) {
        user = await this.usersService.create({
          email: 'muis@myva.ai',
          name: 'Muis',
          waNumber: from,
          plan: 'free',
          status: 'active',
        });
      }
    }

    const replyText = await this.intentRouterService.routeMessage(user.id, text, user.persona);

    // Save conversation log
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

    await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderType: 'user',
        text,
      },
    });

    await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderType: 'assistant',
        text: replyText,
      },
    });

    return replyText;
  }

  async handleIncomingDocument(
    fromRaw: string,
    document: { id: string; filename: string; mime_type: string; caption?: string },
    waMessageId?: string,
  ): Promise<void> {
    const from = normalizePhoneNumber(fromRaw);
    this.logger.log(`Handling incoming document webhook from ${from} (raw: ${fromRaw}). Media ID: ${document.id}, Filename: ${document.filename} (ID: ${waMessageId || 'N/A'})`);

    if (waMessageId) {
      const existingMessage = await this.prisma.message.findUnique({
        where: { whatsappMessageId: waMessageId },
      });
      if (existingMessage) {
        this.logger.warn(`Duplicate WhatsApp document message ID detected: ${waMessageId}. Skipping processing.`);
        return;
      }
    }

    if (!this.checkRateLimit(from)) {
      this.logger.warn(`Rate limit exceeded for document from ${from}`);
      return;
    }

    let user = await this.usersService.findOneByWaNumber(from);
    if (!user) {
      this.logger.log(`User not found with WhatsApp number ${from}. Creating trial account.`);
      user = await this.usersService.create({
        email: `${from}@trial.myva.ai`,
        waNumber: from,
        name: `WhatsApp User (${from})`,
        plan: 'free',
        status: 'active',
      });
    }

    if (user.plan === 'free') {
      const warning = `⚠️ *Fitur Kirim Dokumen Terbatas* ⚠️\n\nFitur pengiriman & rangkuman berkas dokumen via WhatsApp hanya tersedia pada paket *Basic* atau *Pro*. Silakan upgrade paket Anda di dasbor MyVA! 📂`;
      await this.whatsappApiService.sendMessage(from, warning);
      return;
    }

    await this.whatsappApiService.sendMessage(
      from,
      `📂 Berkas Anda *${document.filename}* telah diterima dan sedang diproses oleh MyVA untuk dimasukkan ke Files Vault & Memory Center Anda...`
    );

    try {
      const mediaUrl = await this.whatsappApiService.getMediaUrl(document.id);
      const fileBuffer = await this.whatsappApiService.downloadMedia(mediaUrl);

      const storageKey = `vault/${user.id}/${Date.now()}-${document.filename}`;
      await this.s3Service.upload(storageKey, fileBuffer, document.mime_type);

      const fileRecord = await this.prisma.file.create({
        data: {
          userId: user.id,
          filename: document.filename,
          mimeType: document.mime_type,
          size: fileBuffer.length,
          storagePath: storageKey,
        },
      });

      await this.fileProcessingQueue.add('analyze_document', {
        fileId: fileRecord.id,
        userId: user.id,
      });

      this.logger.log(`Successfully uploaded document ${document.filename} and queued file analysis.`);
    } catch (error) {
      this.logger.error(`Error processing incoming document: ${error.message}`);
      await this.whatsappApiService.sendMessage(
        from,
        `❌ *Gagal memproses dokumen*:\nMaaf, asisten gagal menyimpan atau memproses berkas *${document.filename}* Anda saat ini.`
      );
    }
  }

  async handleIncomingImage(
    fromRaw: string,
    image: { id: string; mime_type: string; caption?: string },
    waMessageId?: string,
  ): Promise<void> {
    const from = normalizePhoneNumber(fromRaw);
    this.logger.log(`Handling incoming image webhook from ${from} (raw: ${fromRaw}). Media ID: ${image.id} (ID: ${waMessageId || 'N/A'})`);

    if (waMessageId) {
      const existingMessage = await this.prisma.message.findUnique({
        where: { whatsappMessageId: waMessageId },
      });
      if (existingMessage) {
        this.logger.warn(`Duplicate WhatsApp image message ID detected: ${waMessageId}. Skipping processing.`);
        return;
      }
    }

    if (!this.checkRateLimit(from)) {
      this.logger.warn(`Rate limit exceeded for image from ${from}`);
      return;
    }

    let user = await this.usersService.findOneByWaNumber(from);
    if (!user) {
      this.logger.log(`User not found with WhatsApp number ${from}. Creating trial account.`);
      user = await this.usersService.create({
        email: `${from}@trial.myva.ai`,
        waNumber: from,
        name: `WhatsApp User (${from})`,
        plan: 'free',
        status: 'active',
      });
    }

    if (user.plan === 'free') {
      const warning = `⚠️ *Fitur Kirim Gambar Terbatas* ⚠️\n\nFitur pengiriman & analisis gambar (multimodal OCR) via WhatsApp hanya tersedia pada paket *Basic* atau *Pro*. Silakan upgrade paket Anda di dasbor MyVA! 🖼️`;
      await this.whatsappApiService.sendMessage(from, warning);
      return;
    }

    await this.whatsappApiService.sendMessage(
      from,
      `🖼️ Gambar Anda telah diterima. MyVA sedang menganalisis konten gambar secara visual & melakukan ekstraksi teks...`
    );

    try {
      const mediaUrl = await this.whatsappApiService.getMediaUrl(image.id);
      const fileBuffer = await this.whatsappApiService.downloadMedia(mediaUrl);

      const extension = image.mime_type.split('/')?.[1] || 'jpg';
      const filename = `photo-${Date.now()}.${extension}`;
      const storageKey = `vault/${user.id}/${filename}`;
      await this.s3Service.upload(storageKey, fileBuffer, image.mime_type);

      await this.prisma.file.create({
        data: {
          userId: user.id,
          filename,
          mimeType: image.mime_type,
          size: fileBuffer.length,
          storagePath: storageKey,
        },
      });

      const analysis = await this.aiService.analyzeImage(fileBuffer, image.mime_type);

      const memoryContent = `🖼️ *Gambar*: ${filename}\n\n📝 *Deskripsi Visual*:\n${analysis.description}\n\n🔍 *Teks Diekstrak (OCR)*:\n${analysis.extractedText || 'Tidak ada teks yang terdeteksi.'}`;
      
      await this.prisma.memory.create({
        data: {
          userId: user.id,
          title: `Gambar: ${analysis.description.substring(0, 40)}...`,
          content: memoryContent,
          category: 'Notes',
        },
      });

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

      await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderType: 'user',
          text: `[Kirim Gambar: ${filename}]`,
          whatsappMessageId: waMessageId || null,
        },
      });

      const replyText = `📸 *Hasil Analisis Gambar Anda*:\n\n📝 *Deskripsi*:\n${analysis.description}\n\n${
        analysis.extractedText
          ? `🔍 *Teks yang Ditemukan (OCR)*:\n_${analysis.extractedText.trim()}_\n\n`
          : ''
      }_Hasil analisis ini telah disimpan dengan aman di Memory Center Anda._`;

      await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderType: 'assistant',
          text: replyText,
        },
      });

      await this.whatsappApiService.sendMessage(from, replyText);
    } catch (error) {
      this.logger.error(`Error processing incoming image: ${error.message}`);
      await this.whatsappApiService.sendMessage(
        from,
        `❌ *Gagal menganalisis gambar*:\nMaaf, asisten gagal menganalisis atau menyimpan gambar Anda saat ini.`
      );
    }
  }
}
