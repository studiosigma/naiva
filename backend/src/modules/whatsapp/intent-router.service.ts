import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { MemoryService } from '../memory/memory.service';
import { ReminderService } from '../reminder/reminder.service';
import { TaskService } from '../task/task.service';
import { TaskPriority } from '../task/dto/create-task.dto';
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
  private pendingActions = new Map<string, {
    intent: 'CREATE_REMINDER' | 'CREATE_CALENDAR_EVENT' | 'CREATE_TASK' | 'TRACK_EXPENSE' | 'RESCHEDULE_EVENT';
    extracted: any;
    timestamp: number;
  }>();

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

    // Check for pending actions first
    const now = Date.now();
    const pending = this.pendingActions.get(userId);
    if (pending && (now - pending.timestamp < 5 * 60 * 1000)) {
      if (/(batal|cancel|tidak jadi|gak jadi)/i.test(cleanText)) {
        this.pendingActions.delete(userId);
        if (pending.intent === 'RESCHEDULE_EVENT') {
          return `❌ Penjadwalan ulang acara telah dibatalkan. Acara tetap pada waktu semula.`;
        }
        return `❌ Pembuatan ${pending.intent === 'TRACK_EXPENSE' ? 'catatan pengeluaran' : 'pengingat/agenda'} telah dibatalkan.`;
      }
      this.pendingActions.delete(userId);
      return this.resolvePendingAction(userId, text, pending);
    }

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

    // Retrieve conversation history from DB for classification context
    const conversation = await this.prisma.conversation.findFirst({
      where: { userId },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 6,
        },
      },
    });

    const history = conversation
      ? conversation.messages
          .map((m) => ({
            role: m.senderType === 'user' ? ('user' as const) : ('assistant' as const),
            content: m.text || '',
          }))
          .reverse()
      : [];

    // Call Gemini 2.5 Flash for smart intent classification
    const classification = await this.aiService.classifyIntent(text, history);
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
        const title = extracted?.title || text;
        if (!extracted?.scheduledAt) {
          this.pendingActions.set(userId, {
            intent: 'CREATE_REMINDER',
            extracted: {
              title: title || 'WhatsApp Reminder',
              description: extracted?.description || '',
            },
            timestamp: Date.now(),
          });
          return `Siap! Kapan Anda ingin diingatkan untuk *"${title || 'WhatsApp Reminder'}"*? (contoh: "besok jam 10 pagi", "nanti malam jam 8")`;
        }

        const scheduledAt = new Date(`${extracted.scheduledAt}+07:00`);
        const isGcalConnected = user?.gcalConnected || false;
        const reminder = await this.reminderService.create(userId, {
          title: title || 'WhatsApp Reminder',
          scheduledAt: scheduledAt.toISOString(),
        });

        let syncError = false;
        if (isGcalConnected) {
          try {
            const oauth2Client = await this.googleApiService.getClientForUser(userId);
            const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
            const endDateTime = new Date(scheduledAt.getTime() + 30 * 60 * 1000);

            await calendar.events.insert({
              calendarId: 'primary',
              requestBody: {
                summary: reminder.title,
                description: `WhatsApp Reminder (MyVA)`,
                start: {
                  dateTime: scheduledAt.toISOString(),
                  timeZone: 'Asia/Jakarta',
                },
                end: {
                  dateTime: endDateTime.toISOString(),
                  timeZone: 'Asia/Jakarta',
                },
              },
            });
            this.logger.log(`Successfully synced reminder "${reminder.title}" to Google Calendar.`);
          } catch (error) {
            this.logger.error(`Error syncing reminder to Google Calendar: ${error.message}`);
            syncError = true;
          }
        }

        if (isGcalConnected && !syncError) {
          return `⏰ Reminder berhasil dibuat & disinkronkan ke Google Calendar!\n\n*Reminder:* ${reminder.title}\n*Waktu:* ${reminder.scheduledAt.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`;
        } else if (syncError) {
          return `⏰ Reminder berhasil dibuat secara lokal! (Koneksi Google Bermasalah)\n\n*Reminder:* ${reminder.title}\n*Waktu:* ${reminder.scheduledAt.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\n\n_Catatan: Gagal menyinkronkan ke Google Calendar. Silakan hubungkan kembali akun Google Anda di dasbor Settings._`;
        }
        return `⏰ Reminder berhasil dibuat secara lokal!\n\n*Reminder:* ${reminder.title}\n*Waktu:* ${reminder.scheduledAt.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`;
      }

      // 2.5. INTENT: CREATE CALENDAR EVENT
      if (intent === 'CREATE_CALENDAR_EVENT') {
        if (plan === 'free') {
          return `⚠️ *Fitur Penjadwalan Terbatas* ⚠️\n\nFitur pembuatan event & Google Meet link via WhatsApp hanya tersedia pada paket *Basic* atau *Pro*. Silakan upgrade paket Anda di dasbor MyVA! 🗓️`;
        }
        const title = extracted?.title || text;
        const isMeeting = extracted?.isMeeting || false;

        if (!extracted?.scheduledAt) {
          this.pendingActions.set(userId, {
            intent: 'CREATE_CALENDAR_EVENT',
            extracted: {
              title: title || 'Acara Kalender',
              description: extracted?.description || '',
              isMeeting,
            },
            timestamp: Date.now(),
          });
          return `Baik! Kapan jadwal acara *"${title || 'Acara Kalender'}"* tersebut? (contoh: "jumat depan jam 2 siang", "besok jam 9 pagi")`;
        }

        const scheduledAt = new Date(`${extracted.scheduledAt}+07:00`);
        const reminder = await this.reminderService.create(userId, {
          title: `[Calendar] ${title || 'Acara Kalender'}`,
          scheduledAt: scheduledAt.toISOString(),
        });

        const isGcalConnected = user?.gcalConnected || false;
        let generatedMeetLink = null;
        let syncError = false;
        let gcalEventId = null;

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

            gcalEventId = response.data?.id || null;
            generatedMeetLink = response.data.conferenceData?.entryPoints?.find(
              ep => ep.entryPointType === 'video'
            )?.uri || null;
            
            this.logger.log(`Successfully synced event "${title}" to Google Calendar. Meet: ${generatedMeetLink}`);
          } catch (error) {
            this.logger.error(`Error syncing event to Google Calendar: ${error.message}`);
            syncError = true;
          }
        }

        // Check for calendar conflicts
        const conflictCheck = await this.checkCalendarConflict(
          userId,
          scheduledAt,
          title || 'Acara Kalender',
          isGcalConnected,
        );

        if (conflictCheck.hasConflict) {
          this.pendingActions.set(userId, {
            intent: 'RESCHEDULE_EVENT',
            extracted: {
              reminderId: reminder.id,
              gcalEventId,
              title: title || 'Acara Kalender',
            },
            timestamp: Date.now(),
          });

          let responsePrefix = '';
          if (isGcalConnected && !syncError) {
            responsePrefix = `🗓️ *Event Berhasil Dibuat & Disinkronkan ke Google Calendar!*\n\n*Acara:* ${title || 'Acara Kalender'}\n*Waktu:* ${reminder.scheduledAt.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}${
              generatedMeetLink ? `\n*Google Meet:* ${generatedMeetLink}` : ''
            }\n\n`;
          } else if (syncError) {
            responsePrefix = `🗓️ *Event Berhasil Dibuat secara Lokal!* (Koneksi Google Bermasalah)\n\n*Acara:* ${title || 'Acara Kalender'}\n*Waktu:* ${reminder.scheduledAt.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\n\n`;
          } else {
            responsePrefix = `🗓️ *Event Berhasil Dibuat secara Lokal!*\n\n*Acara:* ${title || 'Acara Kalender'}\n*Waktu:* ${reminder.scheduledAt.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\n\n`;
          }

          return responsePrefix + conflictCheck.message;
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
        const priority = (extracted?.priority || 'medium') as TaskPriority;
        const deadlineStr = extracted?.deadline || null;

        const task = await this.taskService.create(userId, {
          title,
          priority,
          deadline: deadlineStr || undefined,
        });

        const priorityEmoji = priority === 'high' ? '🔴' : priority === 'low' ? '🟢' : '🟡';
        const priorityLabel = priority === 'high' ? 'Tinggi' : priority === 'low' ? 'Rendah' : 'Sedang';

        let deadlineInfo = '';
        if (task.deadline) {
          const dl = new Date(task.deadline);
          const dateStr = dl.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Jakarta' });
          const timeStr = dl.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
          deadlineInfo = `\n*Deadline:* ${dateStr} pukul ${timeStr} WIB`;
        }

        return `📋 *Task Berhasil Ditambahkan!*\n\n*Task:* ${task.title}\n*Status:* To-Do\n*Prioritas:* ${priorityEmoji} ${priorityLabel}${deadlineInfo}\n\n_Tugas Anda telah ditambahkan ke To-Do List._`;
      }

      // 3.5. INTENT: SMART EXPENSE TRACKER
      if (intent === 'TRACK_EXPENSE') {
        const amount = extracted?.amount || 0;
        const description = extracted?.description || text;
        const category = extracted?.category || 'Other';

        if (amount <= 0) {
          this.pendingActions.set(userId, {
            intent: 'TRACK_EXPENSE',
            extracted: {
              description,
              category,
            },
            timestamp: Date.now(),
          });
          return `Siap! Berapa nominal pengeluaran untuk *"${description}"*? (contoh: "25rb", "150.000")`;
        }

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

        // Fetch monthly summary stats for enhanced user response
        const monthlyTotal = await this.expenseService.getMonthlyTotal(userId);
        const categoryTotal = await this.expenseService.getMonthlyCategoryTotal(userId, category);

        const formattedMonthlyTotal = new Intl.NumberFormat('id-ID', {
          style: 'currency',
          currency: 'IDR',
          maximumFractionDigits: 0
        }).format(monthlyTotal);

        const formattedCategoryTotal = new Intl.NumberFormat('id-ID', {
          style: 'currency',
          currency: 'IDR',
          maximumFractionDigits: 0
        }).format(categoryTotal);

        return `💸 *Pengeluaran Berhasil Dicatat!*\n\n*Deskripsi:* ${expense.description}\n*Jumlah:* ${formattedAmount}\n*Kategori:* ${expense.category}\n\n📈 *Rekap Bulan Ini*:\n• Total Kategori *${expense.category}*: ${formattedCategoryTotal}\n• Total Semua Pengeluaran: ${formattedMonthlyTotal}\n\n_Catatan keuangan Anda telah diperbarui di dashboard._`;
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

        let syncError = false;
        if (isContactsSyncEnabled) {
          try {
            const oauth2Client = await this.googleApiService.getClientForUser(userId);
            const people = google.people({ version: 'v1', auth: oauth2Client });
            await people.people.createContact({
              requestBody: {
                names: [{ givenName: name }],
                phoneNumbers: [{ value: phone }],
              },
            });
            this.logger.log(`Successfully synced contact "${name}" to Google Contacts.`);
          } catch (error) {
            this.logger.error(`Error syncing contact to Google Contacts: ${error.message}`);
            syncError = true;
          }
        }

        if (isContactsSyncEnabled && !syncError) {
          return `👤 Kontak berhasil disimpan & disinkronkan ke Google Contacts!\n\n*Nama:* ${contact.name}\n*No. HP:* ${contact.phone}`;
        } else if (syncError) {
          return `👤 Kontak berhasil disimpan secara lokal! (Koneksi Google Bermasalah)\n\n*Nama:* ${contact.name}\n*No. HP:* ${contact.phone}\n\n_Catatan: Gagal menyinkronkan ke Google Contacts. Silakan hubungkan kembali akun Google Anda di dasbor Settings._`;
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

        try {
          const oauth2Client = await this.googleApiService.getClientForUser(userId);
          const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
          const query = extracted?.query || '';
          
          const listRes = await gmail.users.messages.list({
            userId: 'me',
            maxResults: 3,
            q: query || 'label:INBOX',
          });

          const messages = listRes.data.messages || [];
          if (messages.length === 0) {
            return query 
              ? `📧 *Gmail Assistant*\n\nTidak ditemukan email yang cocok dengan pencarian "${query}".`
              : `📧 *Gmail Assistant*\n\nKotak masuk Anda bersih! Tidak ada email baru.`;
          }

          const emailItems = [];
          for (const msg of messages) {
            const detail = await gmail.users.messages.get({
              userId: 'me',
              id: msg.id,
              format: 'metadata',
              metadataHeaders: ['From', 'Subject', 'Date'],
            });

            const headers = detail.data.payload?.headers || [];
            const fromHeader = headers.find(h => h.name?.toLowerCase() === 'from')?.value || 'Unknown';
            const subjectHeader = headers.find(h => h.name?.toLowerCase() === 'subject')?.value || '(No Subject)';
            const dateHeader = headers.find(h => h.name?.toLowerCase() === 'date')?.value || '';
            const snippet = detail.data.snippet || '';

            // Clean up the from address for cleaner display
            const cleanFrom = fromHeader.replace(/<[^>]*>/, '').trim();
            const dateStr = dateHeader ? new Date(dateHeader).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) : '';

            emailItems.push({
              from: cleanFrom,
              subject: subjectHeader,
              time: dateStr ? `${dateStr} WIB` : '',
              snippet,
            });
          }

          const formattedList = emailItems
            .map((item, idx) => `${idx + 1}. *Dari:* ${item.from}\n   *Subjek:* ${item.subject}${item.time ? ` (${item.time})` : ''}\n   *Snippet:* ${item.snippet}`)
            .join('\n\n');

          return query
            ? `📧 *Hasil Pencarian Gmail untuk "${query}"*:\n\n${formattedList}\n\n_Asisten berhasil menyaring email terpenting Anda._`
            : `📧 *Email Terpenting Hari Ini (Gmail)*:\n\n${formattedList}`;
        } catch (error) {
          this.logger.error(`Error fetching real emails from Gmail: ${error.message}`);
          return `📧 *Gmail Assistant*\n\nGagal membaca email dari akun Gmail Anda. Silakan hubungkan kembali integrasi Gmail Anda di dasbor Settings.`;
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

    // 7. FALLBACK: AI ASSISTANT CHAT (with dynamic contexts & conversation history)
    // Retrieve relevant memories for RAG context
    const memories = await this.aiService.semanticSearch(userId, text);

    // Gather required contexts dynamically
    const requestedContexts = classification.requiredContexts || [];

    // Fallback: simple keyword checks for fail-safe context loading
    const isExpenseQuery = /(pengeluaran|jajan|belanja|keuangan|finansial|biaya|expense|spend|transaksi|beli|saldo|duit|uang|outlay)/i.test(text);
    if (isExpenseQuery && !requestedContexts.includes('expenses')) {
      requestedContexts.push('expenses');
    }
    const isTaskQuery = /(tugas|todo|list tugas|kerjaan|task)/i.test(text);
    if (isTaskQuery && !requestedContexts.includes('tasks')) {
      requestedContexts.push('tasks');
    }
    const isReminderQuery = /(reminder|pengingat|jadwal|agenda|janji|acara|calendar|kalender|event|meet)/i.test(text);
    if (isReminderQuery && !requestedContexts.includes('reminders')) {
      requestedContexts.push('reminders');
    }
    const isMemoryQuery = /(catat|ingat|note|memori|second brain)/i.test(text);
    if (isMemoryQuery && !requestedContexts.includes('memories')) {
      requestedContexts.push('memories');
    }

    let compiledContext = '';

    // 1. MEMORIES CONTEXT
    if (requestedContexts.includes('memories') || memories.length > 0) {
      const contextItems = memories.slice(0, 5).map((m, idx) => {
        return `[Memori #${idx + 1}] Kategori: ${m.category}\nJudul: ${m.title}\nKonten:\n${m.content}`;
      }).join('\n\n');
      compiledContext += `\n\n[Data Memori/Catatan Pengguna (Second Brain)]\n${contextItems}\n\nInstruksi: Gunakan data di atas jika relevan untuk menjawab pertanyaan/instruksi catatan pengguna.`;
    }

    // 2. EXPENSES CONTEXT
    if (requestedContexts.includes('expenses')) {
      const expenses = await this.expenseService.findAll(userId);
      const monthlyTotal = await this.expenseService.getMonthlyTotal(userId);
      const monthlyStats = await this.expenseService.getMonthlyStats(userId);

      const formattedMonthlyTotal = new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0
      }).format(monthlyTotal);

      const statsList = monthlyStats.map(s => {
        const formattedTotal = new Intl.NumberFormat('id-ID', {
          style: 'currency',
          currency: 'IDR',
          maximumFractionDigits: 0
        }).format(s.total);
        return `- Kategori ${s.category}: ${formattedTotal}`;
      }).join('\n');

      if (expenses && expenses.length > 0) {
        const expenseList = expenses.slice(0, 50).map(e => {
          const dateStr = new Date(e.createdAt).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' });
          return `- Tanggal: ${dateStr}, Deskripsi: ${e.description}, Kategori: ${e.category}, Jumlah: Rp ${e.amount.toLocaleString('id-ID')}`;
        }).join('\n');

        compiledContext += `\n\n[Data Keuangan/Pengeluaran Pengguna]
Berikut adalah ringkasan pengeluaran BULAN INI:
• Total Pengeluaran Bulan Ini: ${formattedMonthlyTotal}
• Breakdown Kategori Bulan Ini:
${statsList || '- Belum ada data per kategori.'}

Berikut adalah riwayat 50 transaksi pengeluaran terbaru:
${expenseList}

Instruksi: Gunakan data keuangan di atas untuk menjawab pertanyaan pengguna dengan sangat akurat. Berikan rekap bulanan yang terstruktur, visualisasikan perbandingan antar kategori secara sederhana menggunakan emoji atau bullet points, dan bantu lakukan analisis keuangan (misalnya kategori apa yang paling boros, atau saran hemat) jika diminta.`;
      } else {
        compiledContext += `\n\n[Data Keuangan/Pengeluaran Pengguna]\nPengguna belum mencatat pengeluaran apa pun.`;
      }
    }

    // 3. TASKS CONTEXT
    if (requestedContexts.includes('tasks')) {
      const tasks = await this.taskService.findAll(userId);
      if (tasks && tasks.length > 0) {
        const taskList = tasks.map(t => {
          const deadlineStr = t.deadline ? new Date(t.deadline).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' }) : 'Tidak ada';
          return `- Tugas: ${t.title}, Deskripsi: ${t.description || 'Tidak ada'}, Status: ${t.status}, Prioritas: ${t.priority}, Deadline: ${deadlineStr}`;
        }).join('\n');

        compiledContext += `\n\n[Data Daftar Tugas/To-Do List Pengguna]\nBerikut adalah daftar tugas pengguna:\n${taskList}\n\nInstruksi: Gunakan data tugas di atas untuk menjawab pertanyaan mengenai tugas, pekerjaan, atau To-Do list pengguna secara akurat.`;
      } else {
        compiledContext += `\n\n[Data Daftar Tugas/To-Do List Pengguna]\nPengguna tidak memiliki tugas dalam daftar.`;
      }
    }

    // 4. REMINDERS/CALENDAR CONTEXT
    if (requestedContexts.includes('reminders')) {
      const reminders = await this.reminderService.findAll(userId);
      if (reminders && reminders.length > 0) {
        const reminderList = reminders.map(r => {
          const timeStr = new Date(r.scheduledAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
          return `- Pengingat/Acara: ${r.title}, Deskripsi: ${r.description || 'Tidak ada'}, Waktu: ${timeStr}, Status: ${r.status}`;
        }).join('\n');

        compiledContext += `\n\n[Data Pengingat & Acara Kalender Pengguna]\nBerikut adalah daftar pengingat/jadwal acara pengguna:\n${reminderList}\n\nInstruksi: Gunakan data di atas untuk menginformasikan agenda, jadwal, janji temu, atau pengingat pengguna secara tepat.`;
      } else {
        compiledContext += `\n\n[Data Pengingat & Acara Kalender Pengguna]\nPengguna tidak memiliki jadwal/pengingat saat ini.`;
      }
    }

    let contextPrompt = '';
    if (compiledContext) {
      contextPrompt = `Sistem memberikan Anda data internal pengguna berikut untuk membantu menjawab chat secara cerdas dan kontekstual:\n${compiledContext.trim()}\n\nHarap sesuaikan jawaban Anda berdasarkan data di atas dengan gaya bahasa asisten (sangat singkat, padat, dan ramah).`;
    }

    // Retrieve conversation history
    const fallbackConversation = await this.prisma.conversation.findFirst({
      where: { userId },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 10, // last 10 messages for context
        },
      },
    });

    const recentMessages = fallbackConversation?.messages ? [...fallbackConversation.messages].reverse() : [];

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
        this.logger.log(`DuckDuckGo returned no results. Trying Wikipedia search as fallback...`);
        try {
          const wikiUrl = `https://id.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanSearchQuery)}&utf8=&format=json&origin=*`;
          const response = await fetch(wikiUrl);
          if (response.ok) {
            const data = await response.json() as any;
            const wikiResults = data.query?.search || [];
            for (const item of wikiResults.slice(0, 3)) {
              results.push({
                title: item.title,
                url: `https://id.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/\s+/g, '_'))}`,
                snippet: item.snippet ? item.snippet.replace(/<[^>]+>/g, '').trim() : '',
              });
            }
          }
        } catch (wikiErr) {
          this.logger.warn(`Wikipedia fallback search failed: ${wikiErr.message}`);
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

  private async resolvePendingAction(
    userId: string,
    text: string,
    pending: { intent: string; extracted: any; timestamp: number }
  ): Promise<string> {
    this.logger.log(`Resolving pending action for user ${userId}: intent=${pending.intent}`);
    
    // Call Gemini to extract the clarified/missing parameter based on reply text
    const clarified = await this.aiService.extractClarifiedParameter(pending.intent, pending.extracted, text);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (pending.intent === 'CREATE_REMINDER') {
      const scheduledAtStr = clarified?.scheduledAt;
      if (!scheduledAtStr) {
        return `Format waktu tidak dipahami. Batal membuat pengingat. Silakan coba lagi dengan format yang lebih jelas.`;
      }
      
      const scheduledAt = new Date(`${scheduledAtStr}+07:00`);
      const isGcalConnected = user?.gcalConnected || false;
      
      const reminder = await this.reminderService.create(userId, {
        title: pending.extracted.title,
        scheduledAt: scheduledAt.toISOString(),
      });

      if (isGcalConnected) {
        try {
          const oauth2Client = await this.googleApiService.getClientForUser(userId);
          const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
          await calendar.events.insert({
            calendarId: 'primary',
            requestBody: {
              summary: reminder.title,
              description: `WhatsApp Reminder (MyVA)`,
              start: { dateTime: scheduledAt.toISOString() },
              end: { dateTime: new Date(scheduledAt.getTime() + 30 * 60 * 1000).toISOString() },
            },
          });
        } catch (err) {
          this.logger.error(`Google Calendar sync failed: ${err.message}`);
        }
      }

      const timeStr = scheduledAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
      const dateStr = scheduledAt.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Jakarta' });
      return `⏰ *Pengingat Berhasil Dibuat!*\n\n*Judul:* ${reminder.title}\n*Waktu:* ${dateStr} pukul ${timeStr} WIB\n\n_Asisten akan mengirimkan notifikasi tepat pada waktunya._`;
    }

    if (pending.intent === 'CREATE_CALENDAR_EVENT') {
      const scheduledAtStr = clarified?.scheduledAt;
      if (!scheduledAtStr) {
        return `Format waktu tidak dipahami. Batal membuat agenda kalender. Silakan coba lagi dengan format yang lebih jelas.`;
      }
      
      const scheduledAt = new Date(`${scheduledAtStr}+07:00`);
      const isGcalConnected = user?.gcalConnected || false;
      const isMeeting = pending.extracted.isMeeting || false;

      const reminder = await this.reminderService.create(userId, {
        title: pending.extracted.title,
        scheduledAt: scheduledAt.toISOString(),
      });

      let gcalLink = '';
      let gcalEventId = null;
      if (isGcalConnected) {
        try {
          const oauth2Client = await this.googleApiService.getClientForUser(userId);
          const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
          const eventBody: any = {
            summary: reminder.title,
            description: `WhatsApp Scheduled Event (MyVA)`,
            start: { dateTime: scheduledAt.toISOString() },
            end: { dateTime: new Date(scheduledAt.getTime() + 60 * 60 * 1000).toISOString() },
          };

          if (isMeeting) {
            eventBody.conferenceData = {
              createRequest: {
                requestId: `meet-${reminder.id}`,
                conferenceSolutionKey: { type: 'hangoutsMeet' },
              },
            };
          }

          const event = await calendar.events.insert({
            calendarId: 'primary',
            requestBody: eventBody,
            conferenceDataVersion: isMeeting ? 1 : 0,
          });

          gcalLink = event.data.htmlLink || '';
          gcalEventId = event.data.id || null;
        } catch (err) {
          this.logger.error(`Google Calendar Event sync failed: ${err.message}`);
        }
      }

      // Check for calendar conflicts
      const conflictCheck = await this.checkCalendarConflict(
        userId,
        scheduledAt,
        pending.extracted.title,
        isGcalConnected,
      );

      if (conflictCheck.hasConflict) {
        this.pendingActions.set(userId, {
          intent: 'RESCHEDULE_EVENT',
          extracted: {
            reminderId: reminder.id,
            gcalEventId,
            title: pending.extracted.title,
          },
          timestamp: Date.now(),
        });

        const timeStr = scheduledAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
        const dateStr = scheduledAt.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Jakarta' });

        return `📅 *Acara Kalender Dibuat!*\n\n*Judul:* ${reminder.title}\n*Waktu:* ${dateStr} pukul ${timeStr} WIB\n\n` + conflictCheck.message;
      }

      const timeStr = scheduledAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
      const dateStr = scheduledAt.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Jakarta' });
      
      return `📅 *Acara Kalender Dibuat!*\n\n*Judul:* ${reminder.title}\n*Waktu:* ${dateStr} pukul ${timeStr} WIB\n${
        isGcalConnected ? `\n🔗 *Google Calendar:* Terhubung\n` : ''
      }_Agenda berhasil ditambahkan ke jadwal Anda._`;
    }

    if (pending.intent === 'RESCHEDULE_EVENT') {
      const clarified = await this.aiService.extractClarifiedParameter('CREATE_CALENDAR_EVENT', {}, text);
      const scheduledAtStr = clarified?.scheduledAt;
      if (!scheduledAtStr) {
        return `Format waktu tidak dipahami. Batal menggeser jadwal acara. Silakan coba lagi dengan format yang lebih jelas (contoh: "geser ke jam 3 sore").`;
      }

      const newScheduledAt = new Date(`${scheduledAtStr}+07:00`);

      // Update local reminder
      if (pending.extracted.reminderId) {
        await this.prisma.reminder.update({
          where: { id: pending.extracted.reminderId },
          data: { scheduledAt: newScheduledAt.toISOString() },
        });
      }

      // Update Google Calendar Event if connected
      const isGcalConnected = user?.gcalConnected || false;
      if (isGcalConnected && pending.extracted.gcalEventId) {
        try {
          const oauth2Client = await this.googleApiService.getClientForUser(userId);
          const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
          
          await calendar.events.patch({
            calendarId: 'primary',
            eventId: pending.extracted.gcalEventId,
            requestBody: {
              start: {
                dateTime: newScheduledAt.toISOString(),
                timeZone: 'Asia/Jakarta',
              },
              end: {
                dateTime: new Date(newScheduledAt.getTime() + 60 * 60 * 1000).toISOString(),
                timeZone: 'Asia/Jakarta',
              },
            },
          });
        } catch (err) {
          this.logger.error(`Failed to reschedule Google Calendar event: ${err.message}`);
        }
      }

      const timeStr = newScheduledAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
      const dateStr = newScheduledAt.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Jakarta' });
      return `🔄 *Jadwal Acara Berhasil Diperbarui!*\n\n*Acara:* ${pending.extracted.title}\n*Waktu Baru:* ${dateStr} pukul ${timeStr} WIB\n\n_Jadwal Anda telah dipindahkan ke slot waktu baru._`;
    }

    if (pending.intent === 'TRACK_EXPENSE') {
      const amount = clarified?.amount;
      if (!amount || isNaN(amount)) {
        return `Format nominal uang tidak dipahami. Batal mencatat pengeluaran.`;
      }

      const expense = await this.expenseService.create(userId, {
        amount,
        description: pending.extracted.description,
        category: pending.extracted.category,
      });

      const formattedAmount = new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0
      }).format(expense.amount);

      return `💸 *Pengeluaran Berhasil Dicatat!*\n\n*Deskripsi:* ${expense.description}\n*Jumlah:* ${formattedAmount}\n*Kategori:* ${expense.category}\n\n_Catatan keuangan Anda telah diperbarui._`;
    }

    return `Maaf, instruksi sebelumnya tidak bisa dilanjutkan.`;
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

  private async checkCalendarConflict(
    userId: string,
    scheduledAt: Date,
    title: string,
    isGcalConnected: boolean,
  ): Promise<{ hasConflict: boolean; message: string; alternatives?: Date[] }> {
    const eventDurationMs = 60 * 60 * 1000;
    const newEventStart = scheduledAt;
    const newEventEnd = new Date(scheduledAt.getTime() + eventDurationMs);

    // 1. Check local DB for overlapping events
    const localOverlaps = await this.prisma.reminder.findMany({
      where: {
        userId,
        title: {
          startsWith: '[Calendar]',
        },
        status: 'pending',
        scheduledAt: {
          gt: new Date(newEventStart.getTime() - eventDurationMs),
          lt: new Date(newEventStart.getTime() + eventDurationMs),
        },
      },
    });

    const overlappingLocal = localOverlaps.filter(e => {
      const eStart = new Date(e.scheduledAt);
      const eEnd = new Date(eStart.getTime() + eventDurationMs);
      return eStart < newEventEnd && newEventStart < eEnd;
    });

    // 2. Check Google Calendar for overlapping events
    let overlappingGcal: any[] = [];
    let gcalEvents: any[] = [];
    if (isGcalConnected) {
      try {
        const oauth2Client = await this.googleApiService.getClientForUser(userId);
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
        
        const timeMin = new Date(newEventStart.getTime() - 24 * 60 * 60 * 1000).toISOString();
        const timeMax = new Date(newEventStart.getTime() + 24 * 60 * 60 * 1000).toISOString();
        
        const eventsRes = await calendar.events.list({
          calendarId: 'primary',
          timeMin,
          timeMax,
          singleEvents: true,
          orderBy: 'startTime',
        });
        
        gcalEvents = eventsRes.data.items || [];
        overlappingGcal = gcalEvents.filter(e => {
          const startStr = e.start?.dateTime || e.start?.date;
          const endStr = e.end?.dateTime || e.end?.date;
          if (!startStr || !endStr) return false;
          
          const eStart = new Date(startStr);
          const eEnd = new Date(endStr);
          return eStart < newEventEnd && newEventStart < eEnd;
        });
      } catch (err) {
        this.logger.error(`Error querying Google Calendar for conflicts: ${err.message}`);
      }
    }

    const hasConflict = overlappingLocal.length > 0 || overlappingGcal.length > 0;
    if (!hasConflict) {
      return { hasConflict: false, message: '' };
    }

    // Identify the conflicting event title/time
    let conflictTitle = 'Acara Lain';
    let conflictTimeStr = '';
    if (overlappingGcal.length > 0) {
      const first = overlappingGcal[0];
      conflictTitle = first.summary || 'Rapat/Acara Kalender';
      const start = new Date(first.start?.dateTime || first.start?.date);
      const end = new Date(first.end?.dateTime || first.end?.date);
      conflictTimeStr = `${start.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })} - ${end.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })}`;
    } else if (overlappingLocal.length > 0) {
      const first = overlappingLocal[0];
      conflictTitle = first.title.replace(/^\[Calendar\]\s*/, '');
      const start = new Date(first.scheduledAt);
      const end = new Date(start.getTime() + eventDurationMs);
      conflictTimeStr = `${start.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })} - ${end.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })}`;
    }

    // Find alternatives
    const alternatives = this.findAlternativeSlots(scheduledAt, localOverlaps, gcalEvents);

    const alternativeLines = alternatives.map(alt => {
      const timeStr = alt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
      const dayStr = alt.toLocaleDateString('id-ID', { weekday: 'long', timeZone: 'Asia/Jakarta' });
      return `- ${dayStr} pukul ${timeStr} WIB`;
    }).join('\n');

    const warningMessage = `⚠️ *Jadwal Bentrok Terdeteksi!* ⚠️\n\nJadwal baru Anda bertabrakan dengan agenda lain:\n- *"${conflictTitle}"* (${conflictTimeStr} WIB)\n\n💡 *Saran Slot Waktu Alternatif:*\n${alternativeLines || '- Tidak ada slot alternatif yang dekat'}\n\nApakah Anda ingin memindahkan acara baru ini? Balas dengan slot waktu baru (contoh: *"geser ke jam 3 sore"*, *"pindahkan ke jam 5 sore"*) atau ketik *"batal"* untuk membatalkan.`;

    return { hasConflict: true, message: warningMessage, alternatives };
  }

  private findAlternativeSlots(baseDate: Date, localOverlaps: any[], gcalEvents: any[]): Date[] {
    const eventDurationMs = 60 * 60 * 1000;
    const alternatives: Date[] = [];
    
    // Check hourly slots starting from 1 to 8 hours after original scheduledAt
    for (let offsetHours = 1; offsetHours <= 8; offsetHours++) {
      const candidateStart = new Date(baseDate.getTime() + offsetHours * 60 * 60 * 1000);
      const candidateEnd = new Date(candidateStart.getTime() + eventDurationMs);
      
      const hasLocalOverlap = localOverlaps.some(e => {
        const eStart = new Date(e.scheduledAt);
        const eEnd = new Date(eStart.getTime() + eventDurationMs);
        return eStart < candidateEnd && candidateStart < eEnd;
      });
      
      const hasGcalOverlap = gcalEvents.some(e => {
        const startStr = e.start?.dateTime || e.start?.date;
        if (!startStr) return false;
        const eStart = new Date(startStr);
        const eEnd = e.end?.dateTime || e.end?.date ? new Date(e.end?.dateTime || e.end?.date) : new Date(eStart.getTime() + eventDurationMs);
        return eStart < candidateEnd && candidateStart < eEnd;
      });
      
      if (!hasLocalOverlap && !hasGcalOverlap) {
        alternatives.push(candidateStart);
        if (alternatives.length >= 2) break;
      }
    }
    
    if (alternatives.length < 2) {
      // Try next day starting from 09:00 AM
      const nextDay = new Date(baseDate.getTime() + 24 * 60 * 60 * 1000);
      nextDay.setHours(9, 0, 0, 0);
      
      for (let offsetHours = 0; offsetHours <= 8; offsetHours++) {
        const candidateStart = new Date(nextDay.getTime() + offsetHours * 60 * 60 * 1000);
        const candidateEnd = new Date(candidateStart.getTime() + eventDurationMs);
        
        const hasLocalOverlap = localOverlaps.some(e => {
          const eStart = new Date(e.scheduledAt);
          const eEnd = new Date(eStart.getTime() + eventDurationMs);
          return eStart < candidateEnd && candidateStart < eEnd;
        });
        
        const hasGcalOverlap = gcalEvents.some(e => {
          const startStr = e.start?.dateTime || e.start?.date;
          if (!startStr) return false;
          const eStart = new Date(startStr);
          const eEnd = e.end?.dateTime || e.end?.date ? new Date(e.end?.dateTime || e.end?.date) : new Date(eStart.getTime() + eventDurationMs);
          return eStart < candidateEnd && candidateStart < eEnd;
        });
        
        if (!hasLocalOverlap && !hasGcalOverlap) {
          alternatives.push(candidateStart);
          if (alternatives.length >= 2) break;
        }
      }
    }
    return alternatives;
  }
}
