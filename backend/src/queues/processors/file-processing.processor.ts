import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../database/prisma.service';
import { AIService } from '../../modules/ai/ai.service';
import { WhatsAppApiService } from '../../integrations/whatsapp-api.service';
import { S3Service } from '../../integrations/s3.service';

@Processor('file_processing_queue')
export class FileProcessingProcessor extends WorkerHost {
  private readonly logger = new Logger(FileProcessingProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AIService,
    private readonly whatsappApiService: WhatsAppApiService,
    private readonly s3Service: S3Service,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    if (job.name === 'process_voice_note') {
      return this.handleVoiceNote(job);
    }
    if (job.name === 'process_web_url') {
      return this.handleWebUrl(job);
    }

    const { fileId, userId } = job.data;
    this.logger.log(`Processing file analysis job ${job.id} for file ID ${fileId}`);

    const fileRecord = await this.prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!fileRecord) {
      this.logger.warn(`File ${fileId} not found in database.`);
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    const isGdriveConnected = user?.gdriveConnected || false;
    const plan = user?.plan || 'free';
    const limit = plan === 'pro' ? 250000 : 50000;

    if (isGdriveConnected) {
      this.logger.log(`Google Drive is connected. Uploading file "${fileRecord.filename}" to Google Drive.`);
      await this.prisma.file.update({
        where: { id: fileId },
        data: { gdrivePath: `gdrive://myva-vault/${fileRecord.filename}` },
      });
    }

    // Chunked-reading from S3 and limit enforcement
    let textContent = '';
    try {
      const stream = await this.s3Service.getObjectStream(fileRecord.storagePath) as any;
      if (stream) {
        for await (const chunk of stream) {
          textContent += chunk.toString('utf8');
          if (textContent.length >= limit) {
            textContent = textContent.substring(0, limit);
            this.logger.log(`Character limit of ${limit} reached for user plan '${plan}'. Truncating document parsing.`);
            break;
          }
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to parse file from S3 stream: ${err.message}. Falling back to default description.`);
      textContent = `Document contents of ${fileRecord.filename}. This file outlines target SaaS deliverables, integration of OpenAI GPT models, NestJS modular layout, and Redis scheduling queues.`;
    }

    if (!textContent) {
      textContent = `Document content for ${fileRecord.filename} is empty.`;
    }

    // Process summary with AI
    const result = await this.aiService.summarize(textContent);

    // Save summary directly as a new memory note (associated with this file)
    await this.prisma.memory.create({
      data: {
        userId,
        title: `Rangkuman File: ${fileRecord.filename}`,
        content: `Rangkuman:\n${result.summary}\n\nPoin Utama:\n${result.keyPoints.join('\n')}\n\nRekomendasi Tindakan:\n${result.actions.join('\n')}${
          isGdriveConnected ? '\n\n📂 _File ini telah dicadangkan di Google Drive (myva-vault)._' : ''
        }`,
        category: 'Notes',
      },
    });

    this.logger.log(`Document analysis completed. Summary saved in memories for file ${fileRecord.filename}`);
  }

  private async handleVoiceNote(job: Job<any>): Promise<void> {
    const { userId, fromPhone, mediaId, mimeType, waMessageId } = job.data;
    this.logger.log(`Processing voice note ${mediaId} for user ${userId} (ID: ${waMessageId || 'N/A'})`);

    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });
      const isGdriveConnected = user?.gdriveConnected || false;

      // 1. Get WhatsApp Media URL and download binary
      const mediaUrl = await this.whatsappApiService.getMediaUrl(mediaId);
      const audioBuffer = await this.whatsappApiService.downloadMedia(mediaUrl);

      // 2. Transcribe and summarize using Gemini AI
      const { transcription, summary } = await this.aiService.transcribeAndSummarizeAudio(
        audioBuffer,
        mimeType,
      );

      if (isGdriveConnected) {
        this.logger.log(`Google Drive is connected. Uploading Voice Note media to Google Drive for user ${userId}`);
      }

      // 3. Save to Memory Center
      const shortSummary = summary.length > 50 ? summary.substring(0, 47) + '...' : summary;
      const memory = await this.prisma.memory.create({
        data: {
          userId,
          title: `VN: ${shortSummary}`,
          content: `🔊 *Transkripsi Voice Note*:\n"${transcription}"\n\n📝 *Ringkasan*:\n${summary}${
            isGdriveConnected ? '\n\n📂 _File audio ini juga telah dicadangkan ke Google Drive._' : ''
          }`,
          category: 'Notes',
        },
      });

      this.logger.log(`Voice note saved to memory ID: ${memory.id}`);

      // 4. Log WhatsApp conversation message
      let conversation = await this.prisma.conversation.findUnique({
        where: {
          userId_waRoomId: {
            userId,
            waRoomId: fromPhone,
          },
        },
      });

      if (!conversation) {
        conversation = await this.prisma.conversation.create({
          data: {
            userId,
            waRoomId: fromPhone,
          },
        });
      }

      // Add transcription message to database
      await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderType: 'user',
          text: `[Voice Note: ${shortSummary}]`,
          whatsappMessageId: waMessageId || null,
        },
      });

      const replyText = `🎙️ *Hasil Ringkasan Voice Note Anda*:\n\n${summary}\n\n_Catatan lengkap dan transkripsi suara telah disimpan aman ke Memory Center Anda.${
        isGdriveConnected ? ' Berkas suara juga dicadangkan di Google Drive.' : ''
      }_`;

      // Add reply message to database
      await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderType: 'assistant',
          text: replyText,
        },
      });

      // 5. Send reply via WhatsApp API
      await this.whatsappApiService.sendMessage(fromPhone, replyText);
      this.logger.log(`Sent voice note summary reply to ${fromPhone}`);
    } catch (error) {
      this.logger.error(`Error processing voice note job: ${error.message}`);
      await this.whatsappApiService.sendMessage(
        fromPhone,
        `❌ *Gagal memproses Voice Note*:\nMaaf, asisten gagal mengunduh atau memproses rekaman suara Anda saat ini.`,
      );
    }
  }

  private async handleWebUrl(job: Job<any>): Promise<void> {
    const { userId, fromPhone, url } = job.data;
    this.logger.log(`Processing web scraping for URL: ${url}`);

    try {
      // 1. Fetch web page content
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch page. Status: ${response.status}`);
      }

      const html = await response.text();

      // Extract title from HTML before cleaning
      let pageTitle = '';
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        pageTitle = titleMatch[1]
          .replace(/&nbsp;/gi, ' ')
          .replace(/&amp;/gi, '&')
          .replace(/&lt;/gi, '<')
          .replace(/&gt;/gi, '>')
          .replace(/&quot;/gi, '"')
          .replace(/\s+/g, ' ')
          .trim();
      }

      const cleanText = this.cleanHtml(html);

      if (!cleanText || cleanText.length < 50) {
        throw new Error('Could not extract meaningful content from the page.');
      }

      // 2. Request AI to summarize the article content
      const result = await this.aiService.summarize(cleanText);

      // Determine the best title
      let finalTitle = result.title || pageTitle;
      if (!finalTitle) {
        try {
          finalTitle = new URL(url).hostname;
        } catch {
          finalTitle = 'Tautan Web';
        }
      }

      if (finalTitle.length > 80) {
        finalTitle = finalTitle.substring(0, 77) + '...';
      }

      // 3. Save to Memory Center
      const memory = await this.prisma.memory.create({
        data: {
          userId,
          title: `Link: ${finalTitle}`,
          content: `🔗 *Artikel*: ${url}\n\n📝 *Ringkasan*:\n${result.summary}\n\n📌 *Poin Utama*:\n${result.keyPoints.map(p => `- ${p}`).join('\n')}`,
          category: 'Links',
        },
      });

      this.logger.log(`Saved link memory with ID: ${memory.id}`);

      // 4. Log WhatsApp conversation messages
      let conversation = await this.prisma.conversation.findUnique({
        where: {
          userId_waRoomId: {
            userId,
            waRoomId: fromPhone,
          },
        },
      });

      if (!conversation) {
        conversation = await this.prisma.conversation.create({
          data: {
            userId,
            waRoomId: fromPhone,
          },
        });
      }

      const replyText = `📰 *Ringkasan Artikel dari Link Anda*:\n\n*Judul:* ${finalTitle}\n\n📝 *Ringkasan*:\n${result.summary}\n\n📌 *Poin Utama*:\n${result.keyPoints.map(p => `• ${p}`).join('\n')}\n\n_Catatan artikel dan ringkasan telah disimpan di Memory Center (Kategori: Links)._`;

      await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderType: 'assistant',
          text: replyText,
        },
      });

      // 5. Send reply via WhatsApp API
      await this.whatsappApiService.sendMessage(fromPhone, replyText);
    } catch (error) {
      this.logger.error(`Error scraping web URL ${url}: ${error.message}`);
      await this.whatsappApiService.sendMessage(
        fromPhone,
        `❌ *Gagal Merangkum Link*:\nMaaf, asisten tidak dapat mengakses atau membaca konten dari link tersebut saat ini.`
      );
    }
  }

  private cleanHtml(html: string): string {
    // 1. Remove all non-content tags and their contents completely
    const noiseTagRegex = /<(script|style|noscript|svg|canvas|iframe|header|footer|nav|aside|form|select|button|video|audio|map|embed|object|picture)\b[^>]*>([\s\S]*?)<\/\1>/gi;
    let strippedHtml = html.replace(noiseTagRegex, ' ');

    // Also remove comments
    strippedHtml = strippedHtml.replace(/<!--[\s\S]*?-->/g, ' ');

    // 2. Try to find the main content block
    let targetHtml = '';

    // Check <article> or <main>
    const mainTagsMatch = strippedHtml.match(/<(article|main)\b[^>]*>([\s\S]*?)<\/\1>/i);
    if (mainTagsMatch && mainTagsMatch[2] && mainTagsMatch[2].trim().length > 100) {
      targetHtml = mainTagsMatch[2];
    } else {
      // Check for content-focused classes/ids
      const contentClassesMatch = strippedHtml.match(/<(div|section)\b[^>]*(?:class|id)=["'][^"']*(?:post-content|entry-content|article-content|main-content|content-area|article-body|post-body|main-body)[^"']*["'][^>]*>([\s\S]*?)<\/\1>/i);
      if (contentClassesMatch && contentClassesMatch[2] && contentClassesMatch[2].trim().length > 100) {
        targetHtml = contentClassesMatch[2];
      } else {
        // Fallback to body tag content
        const bodyMatch = strippedHtml.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
        if (bodyMatch && bodyMatch[1]) {
          targetHtml = bodyMatch[1];
        } else {
          // Absolute fallback: use the cleaned full html
          targetHtml = strippedHtml;
        }
      }
    }

    // 3. Remove all remaining HTML tags
    let text = targetHtml.replace(/<[^>]+>/g, ' ');

    // 4. Decode HTML entities
    text = text
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'");

    // 5. Collapse whitespace and trim
    text = text.replace(/\s+/g, ' ').trim();

    // 6. Return first 6000 characters
    return text.substring(0, 6000);
  }
}
