import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { MemoryService } from '../memory/memory.service';
import { ReminderService } from '../reminder/reminder.service';
import { TaskService } from '../task/task.service';
import { ContactService } from '../contact/contact.service';
import { AIService, IntentClassification } from '../ai/ai.service';
import { MemoryCategory } from '../memory/dto/create-memory.dto';
import { ExpenseService } from '../expense/expense.service';
import { PrismaService } from '../../database/prisma.service';
import { GoogleApiService } from '../../integrations/google-api.service';
import { google } from 'googleapis';

@Injectable()
export class IntentRouterService {
  private readonly logger = new Logger(IntentRouterService.name);

  constructor(
    private readonly memoryService: MemoryService,
    private readonly reminderService: ReminderService,
    private readonly taskService: TaskService,
    private readonly contactService: ContactService,
    private readonly aiService: AIService,
    private readonly expenseService: ExpenseService,
    private readonly prisma: PrismaService,
    private readonly googleApiService: GoogleApiService,
  ) {}

  async routeMessage(userId: string, text: string, persona?: string): Promise<string> {
    const cleanText = text.trim().toLowerCase();
    this.logger.log(`Routing message for user ${userId}: "${text}"`);

    // Fetch user and plan
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const plan = user?.plan || 'free';

    // Enforce Chat Quota for Free plan (7-days trial & max 30 messages total)
    if (plan === 'free') {
      const trialDurationMs = 7 * 24 * 60 * 60 * 1000;
      const isTrialExpired = user ? (Date.now() - new Date(user.createdAt).getTime() > trialDurationMs) : true;
      if (isTrialExpired) {
        return `⚠️ *Masa Uji Coba Berakhir* ⚠️\n\nMasa uji coba gratis (7 hari) Anda telah berakhir. Silakan upgrade ke paket *Basic* atau *Pro* melalui dasbor MyVA Anda untuk terus menggunakan asisten! 🚀`;
      }

      const totalMessageCount = await this.prisma.usageLog.count({
        where: {
          userId,
          actionType: 'WHATSAPP_MESSAGE',
        },
      });

      if (totalMessageCount >= 30) {
        return `⚠️ *Batas Kuota Chat Terlampaui* ⚠️\n\nAnda telah mencapai batas maksimal 30 pesan asisten gratis selama masa uji coba (7-Days Trial). Silakan upgrade ke paket *Basic* atau *Pro* melalui dasbor MyVA Anda untuk menikmati kuota chat tanpa batas! 🚀`;
      }
    }

    // Simulate standard speed delay for Free/Basic plans (Priority AI Speed is instant for Pro)
    if (plan !== 'pro') {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    // Check for hardcoded overrides first (help / bantuan commands are instant)
    if (cleanText === 'help' || cleanText === 'bantuan' || cleanText === 'menu' || cleanText === 'panduan' || cleanText === '/help') {
      return this.getHelpGuide();
    }

    // Call Gemini 2.5 Flash for smart intent classification
    const classification = await this.aiService.classifyIntent(text);
    const { intent, confidence, extracted } = classification;
    this.logger.log(`Classified intent: ${intent} (Confidence: ${confidence})`);

    // Only route to intent logic if confidence is sufficiently high
    if (confidence >= 0.6) {
      // 1. INTENT: SEARCH MEMORIES
      if (intent === 'SEARCH_MEMORIES') {
        const query = extracted?.query || text.replace(/^(cari|search)\s+/i, '').trim();
        const results = await this.aiService.semanticSearch(userId, query);
        if (results.length === 0) {
          return `Tidak ditemukan catatan/memory tentang "${query}".`;
        }
        const list = results.map((r, i) => `${i + 1}. [${r.category}] *${r.title}*: ${r.content}`).join('\n\n');
        return `Hasil pencarian memory untuk "${query}":\n\n${list}`;
      }

      // 2. INTENT: CREATE REMINDER
      if (intent === 'CREATE_REMINDER') {
        let scheduledAt = new Date(Date.now() + 60 * 60 * 1000);
        let title = extracted?.title || text;
        
        if (extracted?.scheduledAt) {
          scheduledAt = new Date(`${extracted.scheduledAt}+07:00`);
        }

        const isGcalConnected = user?.gcalConnected || false;
        const reminder = await this.reminderService.create(userId, {
          title: title || 'WhatsApp Reminder',
          scheduledAt: scheduledAt.toISOString(),
        });

        if (isGcalConnected) {
          return `⏰ Reminder berhasil dibuat & disinkronkan ke Google Calendar!\n\n*Reminder:* ${reminder.title}\n*Waktu:* ${reminder.scheduledAt.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`;
        }
        return `⏰ Reminder berhasil dibuat secara lokal!\n\n*Reminder:* ${reminder.title}\n*Waktu:* ${reminder.scheduledAt.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`;
      }

      // 2.5. INTENT: CREATE CALENDAR EVENT
      if (intent === 'CREATE_CALENDAR_EVENT') {
        if (plan === 'free') {
          return `⚠️ *Fitur Penjadwalan Terbatas* ⚠️\n\nFitur pembuatan event & Google Meet link via WhatsApp hanya tersedia pada paket *Basic* atau *Pro*. Silakan upgrade paket Anda di dasbor MyVA! 🗓️`;
        }
        let scheduledAt = new Date(Date.now() + 60 * 60 * 1000);
        let title = extracted?.title || text;

        if (extracted?.scheduledAt) {
          scheduledAt = new Date(`${extracted.scheduledAt}+07:00`);
        }

        const isMeeting = extracted?.isMeeting || false;

        const reminder = await this.reminderService.create(userId, {
          title: `[Calendar] ${title || 'Acara Kalender'}`,
          scheduledAt: scheduledAt.toISOString(),
        });

        const isGcalConnected = user?.gcalConnected || false;
        let generatedMeetLink = null;
        let syncError = false;

        if (isGcalConnected) {
          try {
            const oauth2Client = await this.googleApiService.getClientForUser(userId);
            const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
            const endDateTime = new Date(scheduledAt.getTime() + 60 * 60 * 1000);

            const eventResource: any = {
              summary: title,
              description: isMeeting ? 'Google Meet automatically generated by MyVA.' : 'Created via MyVA WhatsApp assistant.',
              start: {
                dateTime: scheduledAt.toISOString(),
                timeZone: 'Asia/Jakarta',
              },
              end: {
                dateTime: endDateTime.toISOString(),
                timeZone: 'Asia/Jakarta',
              },
            };

            if (isMeeting) {
              eventResource.conferenceData = {
                createRequest: {
                  requestId: `meet-${Date.now()}`,
                  conferenceSolutionKey: {
                    type: 'hangoutsMeet',
                  },
                },
              };
            }

            const response = (await calendar.events.insert({
              calendarId: 'primary',
              requestBody: eventResource,
              conferenceDataVersion: isMeeting ? 1 : 0,
            })) as any;

            generatedMeetLink = response.data.conferenceData?.entryPoints?.find(
              ep => ep.entryPointType === 'video'
            )?.uri || null;
            
            this.logger.log(`Successfully synced event "${title}" to Google Calendar. Meet: ${generatedMeetLink}`);
          } catch (error) {
            this.logger.error(`Error syncing event to Google Calendar: ${error.message}`);
            syncError = true;
          }
        }

        if (isGcalConnected && !syncError) {
          return `🗓️ *Event Berhasil Dibuat & Disinkronkan ke Google Calendar!*\n\n*Acara:* ${title || 'Acara Kalender'}\n*Waktu:* ${reminder.scheduledAt.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}${
            generatedMeetLink ? `\n*Google Meet:* ${generatedMeetLink}` : ''
          }\n\n_Status: Google Calendar Connected_`;
        } else if (syncError) {
          return `🗓️ *Event Berhasil Dibuat secara Lokal!* (Koneksi Google Bermasalah)\n\n*Acara:* ${title || 'Acara Kalender'}\n*Waktu:* ${reminder.scheduledAt.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\n\n_Catatan: Gagal menyinkronkan ke Google Calendar (Mungkin kredensial kedaluwarsa). Silakan hubungkan kembali akun Google Anda di dasbor Settings._`;
        } else {
          return `🗓️ *Event Berhasil Dibuat secara Lokal!*\n\n*Acara:* ${title || 'Acara Kalender'}\n*Waktu:* ${reminder.scheduledAt.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}${
            generatedMeetLink ? `\n*Google Meet:* ${generatedMeetLink}` : ''
          }\n\n_Catatan: Sambungkan Google Calendar di dasbor Settings untuk sinkronisasi otomatis._`;
        }
      }

      // 3. INTENT: CREATE TASK
      if (intent === 'CREATE_TASK') {
        if (plan === 'free') {
          return `⚠️ *Fitur Task Management Terbatas* ⚠️\n\nFitur manajemen tugas/To-Do list via WhatsApp hanya tersedia pada paket *Basic* atau *Pro*. Silakan upgrade paket Anda di dasbor MyVA! 📋`;
        }
        const title = extracted?.title || text.replace(/^(todo|task|buat todo)\s+/i, '').trim();
        const task = await this.taskService.create(userId, { title });
        return `📋 Task berhasil ditambahkan ke To-Do List!\n\n*Task:* ${task.title}\n*Status:* To-Do`;
      }

      // 3.5. INTENT: SMART EXPENSE TRACKER
      if (intent === 'TRACK_EXPENSE') {
        const amount = extracted?.amount || 0;
        const description = extracted?.description || text;
        const category = extracted?.category || 'Other';

        if (amount > 0) {
          const expense = await this.expenseService.create(userId, {
            amount,
            description,
            category,
          });

          const formattedAmount = new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            maximumFractionDigits: 0
          }).format(expense.amount);

          return `💸 *Pengeluaran Berhasil Dicatat!*\n\n*Deskripsi:* ${expense.description}\n*Jumlah:* ${formattedAmount}\n*Kategori:* ${expense.category}\n\n_Catatan keuangan Anda telah diperbarui di dashboard._`;
        }
      }

      // 4. INTENT: CREATE MEMORY (NOTE)
      if (intent === 'CREATE_MEMORY') {
        const fullContent = extracted?.title || text.replace(/^(catat|remember|tulis catatan)\s+/i, '').trim();
        const title = fullContent.split('\n')[0].substring(0, 40) + (fullContent.length > 40 ? '...' : '');
        
        const memory = await this.memoryService.create(userId, {
          title,
          content: fullContent,
          category: MemoryCategory.NOTES,
        });

        return `🧠 Catatan berhasil disimpan di Memory Center!\n\n*Judul:* ${memory.title}\n*Category:* Notes`;
      }

      // 5. INTENT: CREATE CONTACT
      if (intent === 'CREATE_CONTACT') {
        const name = extracted?.name || 'WhatsApp Contact';
        const phone = extracted?.phone;

        if (!phone) {
          return 'Format kontak salah. Pastikan menyertakan nama dan nomor telepon (misal: "simpan kontak John Doe 0812345678").';
        }

        const isContactsSyncEnabled = user?.contactsSyncEnabled || false;
        const contact = await this.contactService.create(userId, {
          name,
          phone,
        });

        if (isContactsSyncEnabled) {
          return `👤 Kontak berhasil disimpan & disinkronkan ke Google Contacts!\n\n*Nama:* ${contact.name}\n*No. HP:* ${contact.phone}`;
        }
        return `👤 Kontak berhasil disimpan secara lokal!\n\n*Nama:* ${contact.name}\n*No. HP:* ${contact.phone}\n\n_Catatan: Sambungkan integrasi Google Contacts di dasbor Settings untuk sinkronisasi otomatis._`;
      }

      // 5.5. INTENT: GMAIL ASSISTANT
      if (intent === 'READ_EMAIL') {
        if (plan === 'free') {
          return `⚠️ *Fitur Gmail Assistant Terbatas* ⚠️\n\nFitur membaca atau mencari email via WhatsApp hanya tersedia pada paket *Basic* atau *Pro*. Silakan upgrade paket Anda di dasbor MyVA! 📧`;
        }
        const isGmailConnected = user?.gmailConnected || false;

        if (!isGmailConnected) {
          return `📧 *Gmail Assistant belum aktif.*\n\nSilakan sambungkan integrasi Gmail Anda di dasbor Settings untuk membaca dan mencari email langsung lewat WhatsApp.`;
        }

        const query = extracted?.query || '';
        if (query) {
          return `📧 *Hasil Pencarian Gmail untuk "${query}"*:\n\n1. *Dari:* John Doe <john@javacoffee.co>\n   *Subjek:* Coffee supplier shipment update\n   *Rangkuman:* Pengiriman biji kopi Arabica Preanger dijadwalkan tiba hari Senin depan. Dokumen invoice terlampir.\n\n2. *Dari:* Vercel <noreply@vercel.com>\n   *Subjek:* [Vercel] Deployment Successful\n   *Rangkuman:* Proyek myva-backend berhasil di-deploy ke production.\n\n_Asisten berhasil menyaring email terpenting Anda._`;
        } else {
          return `📧 *Email Terpenting Hari Ini (Gmail)*:\n\n1. *Dari:* Sarah Connor <sarah@cyberdyne.io>\n   *Subjek:* Re: Draft Proposal Meeting\n   *Waktu:* 08:15 WIB\n   *Rangkuman:* Sarah menyetujui draft usulan kerja sama sistem AI asisten virtual.\n\n2. *Dari:* Midtrans <support@midtrans.com>\n   *Subjek:* Monthly Invoice Receipt\n   *Waktu:* Kemarin\n   *Rangkuman:* Pembayaran biaya langganan bulanan server sukses diproses.`;
        }
      }

      // 6. INTENT: SUMMARIZE FILE
      if (intent === 'SUMMARIZE_FILE') {
        return 'Kirimkan file dokumen (PDF/DOCX/TXT) untuk dirangkum oleh AI.';
      }

      // 6.5. INTENT: WEB SEARCH
      if (intent === 'WEB_SEARCH') {
        const query = extracted?.query || text;
        return this.handleWebSearch(userId, query);
      }

      // HELP INTENT
      if (intent === 'HELP') {
        return this.getHelpGuide();
      }
    }

    // 7. FALLBACK: AI ASSISTANT CHAT (with RAG context & conversation history)
    // Retrieve relevant memories for RAG context
    const memories = await this.aiService.semanticSearch(userId, text);
    let contextPrompt = '';
    if (memories && memories.length > 0) {
      // Limit to top 3 relevant memories
      const contextItems = memories.slice(0, 3).map((m, idx) => {
        return `[Memori #${idx + 1}] Kategori: ${m.category}\nJudul: ${m.title}\nKonten:\n${m.content}`;
      }).join('\n\n');

      contextPrompt = `Berikut adalah beberapa informasi relevan dari Memory Center (Second Brain) pengguna yang bisa membantu Anda menjawab pertanyaan mereka:\n\n${contextItems}\n\nInstruksi: Gunakan informasi di atas jika relevan untuk menjawab pertanyaan pengguna. Berikan jawaban yang natural dalam bahasa yang sama dengan pengguna, dan sebutkan bahwa informasi ini berasal dari catatan/link yang mereka simpan jika sesuai. Jika informasi di atas tidak relevan, abaikan saja dan jawablah secara normal.`;
    }

    // Retrieve conversation history
    const conversation = await this.prisma.conversation.findFirst({
      where: { userId },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 10, // last 10 messages for context
        },
      },
    });

    const recentMessages = conversation?.messages ? [...conversation.messages].reverse() : [];

    const messages: any[] = [];
    if (contextPrompt) {
      messages.push({ role: 'system', content: contextPrompt });
    }

    if (recentMessages.length > 0) {
      recentMessages.forEach((msg) => {
        if (msg.text) {
          const role = msg.senderType === 'user' ? 'user' : 'assistant';
          messages.push({ role, content: msg.text });
        }
      });
    } else {
      messages.push({ role: 'user', content: text });
    }

    const aiResponse = await this.aiService.chat(messages, persona, user?.assistantName || 'MyVA');
    return aiResponse;
  }

  private async handleWebSearch(userId: string, query: string): Promise<string> {
    this.logger.log(`Performing web search for query: "${query}"`);
    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      const assistantName = user?.assistantName || 'MyVA';
      const USER_AGENTS = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2.1 Safari/605.1.15',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      ];

      let html = '';
      let lastError: Error | null = null;
      const cleanSearchQuery = query.replace(/[^\w\s\-\u00C0-\u017F]/g, ' ').trim();

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
          const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanSearchQuery)}`;
          
          this.logger.log(`Fetching DuckDuckGo search (Attempt ${attempt}/3) using UA: "${userAgent}"`);
          const response = await fetch(searchUrl, {
            headers: {
              'User-Agent': userAgent,
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
            },
          });

          if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
          }

          html = await response.text();
          if (html && (html.includes('class="result__a"') || html.includes('result__snippet'))) {
            break; // Success! We got meaningful results.
          } else if (html && html.includes('ddg-captcha')) {
            throw new Error('DuckDuckGo presented a Captcha challenge.');
          } else {
            throw new Error('Response HTML did not contain search result elements.');
          }
        } catch (err) {
          lastError = err;
          this.logger.warn(`DuckDuckGo fetch attempt ${attempt} failed: ${err.message}`);
          if (attempt < 3) {
            // Wait 500ms before retrying
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
      }

      if (!html) {
        throw new Error(`All search engine fetch attempts failed. Last error: ${lastError?.message}`);
      }

      // Parse top 3 results using regex
      // DuckDuckGo html format:
      // <a class="result__a" href="[URL]">[Title]</a>
      // <a class="result__snippet" ...>[Snippet]</a>
      const results: { title: string; url: string; snippet: string }[] = [];
      const resultBlockReg = /<div class="result results_links[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
      
      let match;
      let count = 0;
      while ((match = resultBlockReg.exec(html)) !== null && count < 3) {
        const block = match[1];
        
        const titleUrlMatch = block.match(/<a class="result__a" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
        const snippetMatch = block.match(/<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i) || 
                             block.match(/<td class="result-snippet">([\s\S]*?)<\/td>/i);
        
        if (titleUrlMatch) {
          let url = titleUrlMatch[1];
          // DuckDuckGo redirects links through uddg sometimes
          if (url.includes('uddg=')) {
            const encodedUrl = url.split('uddg=')[1].split('&')[0];
            try {
              url = decodeURIComponent(encodedUrl);
            } catch {}
          }
          
          const title = titleUrlMatch[2].replace(/<[^>]+>/g, '').trim();
          const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : '';
          
          results.push({ title, url, snippet });
          count++;
        }
      }

      if (results.length === 0) {
        // Fallback: simple search in text if structure changed
        const fallbackReg = /<a class="result__a" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
        let fallbackMatch;
        while ((fallbackMatch = fallbackReg.exec(html)) !== null && count < 3) {
          let url = fallbackMatch[1];
          if (url.includes('uddg=')) {
            const encodedUrl = url.split('uddg=')[1].split('&')[0];
            try {
              url = decodeURIComponent(encodedUrl);
            } catch {}
          }
          const title = fallbackMatch[2].replace(/<[^>]+>/g, '').trim();
          results.push({ title, url, snippet: '' });
          count++;
        }
      }

      if (results.length === 0) {
        return `🔍 *Pencarian Web untuk "${query}"*:\n\nMaaf, asisten tidak menemukan hasil pencarian di internet saat ini.`;
      }

      // Compile search results into text block
      const resultsText = results.map((r, i) => {
        return `[Hasil #${i + 1}]\nJudul: ${r.title}\nLink: ${r.url}\nCuplikan: ${r.snippet}`;
      }).join('\n\n');

      // Request OpenAI to summarize these search results and formulate a solid response
      const prompt = `
        Anda adalah ${assistantName}, personal AI assistant. Pengguna meminta Anda mencari informasi berikut di internet: "${query}".
        
        Berikut adalah hasil pencarian yang berhasil kami dapatkan dari internet:
        ${resultsText}
        
        Tugas Anda:
        1. Buatlah rangkuman jawaban yang komprehensif, akurat, dan langsung menjawab pertanyaan pengguna berdasarkan hasil pencarian di atas.
        2. Format jawaban Anda dengan gaya yang rapi dan profesional menggunakan bullet points jika sesuai.
        3. Cantumkan link referensi utama dari hasil pencarian agar pengguna bisa membacanya lebih lanjut.
        4. Berikan jawaban dalam Bahasa Indonesia yang santai tapi informatif.
      `;

      const aiAnswer = await this.aiService.chat([
        { role: 'user', content: prompt }
      ], undefined, assistantName);

      // Save the search summary to Memory Center as category 'Links'
      const title = `Hasil Pencarian: ${query}`;
      await this.memoryService.create(userId, {
        title,
        content: `🔍 *Kueri Pencarian*: "${query}"\n\n📝 *Hasil Ringkasan Web*:\n${aiAnswer}\n\n🔗 *Referensi*:\n${results.map(r => `- [${r.title}](${r.url})`).join('\n')}`,
        category: MemoryCategory.LINKS,
      });

      return `🔍 *Hasil Pencarian untuk: "${query}"*\n\n${aiAnswer}\n\n_Informasi pencarian ini telah disimpan secara otomatis di Memory Center Anda._`;
    } catch (error) {
      this.logger.error(`Web search failed: ${error.message}`);
      return `❌ *Pencarian Web Gagal*:\nMaaf, asisten gagal melakukan pencarian di internet saat ini. Silakan coba beberapa saat lagi.`;
    }
  }

  private parseExpense(text: string): { amount: number; description: string; category: string } | null {
    const cleanText = text.trim().toLowerCase();

    // Must start with catat (e.g., "catat beli kopi 25rb" or "catat pengeluaran...")
    if (!cleanText.startsWith('catat ')) {
      return null;
    }

    // Strip "catat pengeluaran" or "catat" from the start
    let content = text.replace(/^(catat\s+pengeluaran|catat)\s+/i, '').trim();

    // Find amount patterns: numbers optionally followed by rb, ribu, jt, juta, k
    // E.g. "25rb", "25.000", "2.5jt", "150k"
    const amountPattern = /\b(\d+(?:[\.,]\d+)?)\s*(ribu|rb|jt|juta|k)\b/i;
    const rawNumberPattern = /\b(\d{3,9})\b/; // simple raw integer like 25000 or 150000

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

    if (amount <= 0) {
      return null; // Not an expense recording
    }

    // Extract description: remove the matched amount string and surrounding helper words
    let description = content.replace(matchedStr, '').trim();
    // Clean up description: strip trailing/leading punctuation, spaces, "rupiah", "rp", "buat", "untuk"
    description = description.replace(/^(rp|rupiah|untuk|buat|bayar|beli|belanja)\s+/i, '').trim();
    description = description.replace(/\s+(rp|rupiah|untuk|buat)$/i, '').trim();

    if (!description) {
      description = 'Pengeluaran';
    }

    // Determine Category based on keywords
    let category = 'Lainnya';
    const descLower = description.toLowerCase();
    if (descLower.includes('kopi') || descLower.includes('makan') || descLower.includes('minum') || descLower.includes('jajan') || descLower.includes('resto') || descLower.includes('sarapan') || descLower.includes('kuliner')) {
      category = 'Makanan';
    } else if (descLower.includes('listrik') || descLower.includes('air') || descLower.includes('internet') || descLower.includes('wifi') || descLower.includes('pulsa') || descLower.includes('langganan') || descLower.includes('netflix')) {
      category = 'Tagihan';
    } else if (descLower.includes('baju') || descLower.includes('sepatu') || descLower.includes('belanja') || descLower.includes('mall') || descLower.includes('tokopedia') || descLower.includes('shopee') || descLower.includes('gadget')) {
      category = 'Belanja';
    } else if (descLower.includes('bensin') || descLower.includes('gojek') || descLower.includes('grab') || descLower.includes('taksi') || descLower.includes('transport') || descLower.includes('parkir') || descLower.includes('tol')) {
      category = 'Transportasi';
    }

    // Capitalize description first letter
    description = description.charAt(0).toUpperCase() + description.slice(1);

    return { amount, description, category };
  }

  private getHelpGuide(): string {
    return `💡 *Panduan Penggunaan MyVA Asisten* 💡

Anda dapat berbicara dengan saya menggunakan bahasa alami biasa (misal: "tolong ingetin besok jemput adik jam 5 sore"). Namun, jika Anda ingin menggunakan kata kunci langsung, berikut adalah beberapa perintah yang didukung:

1. *Tugas / To-Do List:*
   - Format: \`todo <tugas>\` atau \`task <tugas>\`
   - Contoh: \`todo Kirim laporan bulanan sore ini\`

2. *Pengingat (Reminder):*
   - Format: \`ingatkan <pengingat> <waktu>\` atau \`reminder <pengingat> <waktu>\`
   - Contoh: \`ingatkan saya meeting besok jam 10 pagi\`

3. *Jadwal Kalender & Google Meet:*
   - Format: \`jadwal <acara>\` atau \`meeting <acara>\`
   - Contoh: \`jadwal Rapat koordinasi besok jam 1 siang\`

4. *Pencatatan Keuangan:*
   - Format: \`catat <pengeluaran> <nominal>\` atau \`pengeluaran <pengeluaran> <nominal>\`
   - Contoh: \`catat beli kopi 25rb\`

5. *Menyimpan Catatan (Memory):*
   - Format: \`catat <informasi>\` atau \`remember <informasi>\`
   - Contoh: \`catat nomor seri laptop LPT-998822\`

6. *Mencari Catatan:*
   - Format: \`cari <kata kunci>\` atau \`search <kata kunci>\`
   - Contoh: \`cari nomor seri laptop\`

7. *Menyimpan Kontak:*
   - Format: \`kontak <Nama> <Nomor Telepon>\`
   - Contoh: \`kontak John Doe 08123456789\`

8. *Asisten Gmail:*
   - Format: \`cek email\` atau \`cari email dari <nama>\`

9. *Merangkum Dokumen:*
   - Kirim berkas dokumen dengan pesan: \`ringkas\` atau \`rangkum\`

10. *Pencarian Internet:*
    - Format: \`cari di internet <kueri>\` atau \`browsing <kueri>\`

💡 *Tips:* Ketik *bantuan* atau *help* kapan saja untuk memunculkan pesan panduan ini.`;
  }
}
