import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../database/prisma.service';

export interface IntentClassification {
  intent: 'HELP' | 'CREATE_TASK' | 'CREATE_REMINDER' | 'CREATE_CALENDAR_EVENT' | 'TRACK_EXPENSE' | 'CREATE_MEMORY' | 'SEARCH_MEMORIES' | 'CREATE_CONTACT' | 'READ_EMAIL' | 'SUMMARIZE_FILE' | 'WEB_SEARCH' | 'CHAT';
  confidence: number;
  extracted?: {
    title?: string;
    scheduledAt?: string;
    amount?: number;
    description?: string;
    category?: string;
    name?: string;
    phone?: string;
    query?: string;
    isMeeting?: boolean;
  };
}

@Injectable()
export class AIService {
  private readonly geminiApiKey: string;
  private readonly logger = new Logger(AIService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.geminiApiKey = this.configService.get<string>('GEMINI_API_KEY') || '';
  }

  async chat(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    persona?: string,
    assistantName: string = 'MyVA',
    feature?: string,
  ): Promise<string> {
    try {
      const apiKey = this.geminiApiKey;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not configured.');
      }

      let finalMessages = [...messages];

      // Filter out system instructions
      const systemMessages = finalMessages.filter(m => m.role === 'system');
      const chatMessages = finalMessages.filter(m => m.role !== 'system');

      let systemInstructionText = systemMessages.map(m => m.content).join('\n');
      if (persona) {
        const personaPrompt = await this.getPersonaSystemPrompt(persona, assistantName, feature);
        systemInstructionText = systemInstructionText
          ? `${personaPrompt}\n\n${systemInstructionText}`
          : personaPrompt;
      }

      // Inject dynamic temporal and political context so Gemini answers naturally and accurately
      const today = new Date();
      const currentYear = today.getFullYear();
      const dateString = today.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Jakarta' });
      const timeString = today.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });

      const timeContext = `[TEMPORAL CONTEXT]
- Hari/Tanggal saat ini: ${dateString}
- Waktu saat ini: ${timeString} WIB (Waktu Indonesia Barat)
- Tahun saat ini: ${currentYear} (Gunakan tahun ini untuk menjawab pertanyaan tentang waktu saat ini atau peristiwa terbaru)
- Presiden Republik Indonesia saat ini (tahun 2026): Bapak Prabowo Subianto (menjabat sejak 20 Oktober 2024, didampingi Wakil Presiden Gibran Rakabuming Raka)
[/TEMPORAL CONTEXT]`;

      systemInstructionText = systemInstructionText
        ? `${timeContext}\n\n${systemInstructionText}`
        : timeContext;

      // Convert messages to Gemini format (user and model roles)
      const contents = chatMessages.map(m => {
        const role = m.role === 'assistant' ? 'model' : 'user';
        const text = typeof m.content === 'string' ? m.content : '';
        return {
          role,
          parts: [{ text }]
        };
      });

      // If contents is empty, add a default user part to satisfy the API
      if (contents.length === 0) {
        contents.push({
          role: 'user',
          parts: [{ text: 'Hello' }]
        });
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      const payload: any = {
        contents,
      };

      if (systemInstructionText) {
        payload.systemInstruction = {
          parts: [{ text: systemInstructionText }]
        };
        payload.system_instruction = {
          parts: [{ text: systemInstructionText }]
        };
      }

      let response: Response;
      const maxAttempts = 3;
      let delay = 1000;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          });

          if (response.ok) {
            break;
          }

          if (response.status === 503 || response.status === 429 || response.status >= 500) {
            this.logger.warn(`Gemini API responded with status ${response.status} (Attempt ${attempt}/${maxAttempts}). Retrying in ${delay}ms...`);
            if (attempt < maxAttempts) {
              await new Promise((resolve) => setTimeout(resolve, delay));
              delay *= 2;
              continue;
            }
          }
          break;
        } catch (err) {
          this.logger.warn(`Fetch attempt ${attempt} failed: ${err.message}`);
          if (attempt < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, delay));
            delay *= 2;
            continue;
          }
          throw err;
        }
      }

      if (!response || !response.ok) {
        const statusStr = response ? `${response.status}: ${response.statusText}` : 'Network Error';
        throw new Error(`Gemini API responded with status ${statusStr}`);
      }

      const data = (await response.json()) as any;
      const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
      return textResponse || 'Maaf, saya tidak bisa merespons saat ini.';
    } catch (error) {
      this.logger.error(`Gemini Chat Error: ${error.message}`);
      return `🙏 *Mohon Maaf*\n\nSistem AI MyVA saat ini sedang sangat sibuk atau mengalami gangguan koneksi. Mohon tunggu beberapa menit dan coba kirim pesan Anda lagi ya.`;
    }
  }

  private async getPersonaSystemPrompt(
    persona: string,
    assistantName: string = 'MyVA',
    feature?: string,
  ): Promise<string> {
    const DEFAULT_GLOBAL_PROMPT = `Kamu adalah MyVA, asisten WhatsApp Second Brain yang cerdas. Bantu pengguna mencatat memori, menyusun tugas, mengatur pengingat, dan meringkas berkas.
PENTING:
- Jawablah dengan gaya chat WhatsApp yang sangat singkat, padat, dan natural (maksimal 2-3 kalimat atau 50-80 kata).
- Hindari basa-basi dan jangan gunakan salam pembuka/penutup yang berlebihan (seperti 'Halo', 'Bagaimana saya bisa membantu Anda?', atau salam keagamaan yang berulang-ulang kecuali diminta). Langsung ke inti pembicaraan.
- Gunakan poin-poin (bullet points) jika menyajikan daftar dan format tebal (*kata*) untuk istilah penting agar mudah dibaca di ponsel.`;

    const DEFAULT_PERSONA_PROMPTS: Record<string, string> = {
      friendly: 'Gaya bicara santai, bersahabat, alami, seperti teman dekat. Gunakan kata "kamu/aku" atau "saya/kamu", gunakan sesedikit mungkin emoji yang relevan. Jangan bertele-tele atau menggunakan sapaan formal.',
      professional: 'Gaya bicara profesional, sangat singkat, padat, langsung ke tujuan, dan fokus pada bisnis/tugas. Hindari basa-basi atau kata sapaan pembuka yang tidak penting.',
      islamic: 'Gaya bicara santun, tenang, dan berbasis nilai Islami. Cukup ucapkan salam pembuka ("Assalamu\'alaikum") di awal interaksi pertama saja. Jangan mengulang salam pembuka di setiap pesan balasan. Jawab langsung secara ringkas.',
      business_partner: 'Business Partner. Bersikap analitis, strategis, kritis, dan fokus pada bisnis. Berikan pendapat secara langsung, jujur, singkat, dan tanpa basa-basi.',
      grumpy_boss: 'Grumpy Boss. Tegas, menuntut efisiensi, dan sangat to-the-point. Jangan gunakan sapaan ramah atau salam. Langsung instruksikan pengguna dengan kalimat pendek.',
      romantic_partner: 'Romantic Partner. Bersikap hangat, penuh perhatian, dan sangat suportif. Panggil dengan sebutan "sayang" atau "beb" secara wajar, tanyakan kabar dengan sangat singkat, dan hindari salam formal yang kaku.',
    };

    const DEFAULT_FEATURE_PROMPTS: Record<string, string> = {
      daily_briefing: 'Halo {{name}}, berikut adalah ringkasan hari ini:\n\nTasks:\n{{tasks}}\n\nMeetings:\n{{meetings}}',
      reminder: 'Reminder: Bantu pengguna mencatat pengingat (alert/reminder). Pastikan mengonfirmasi nama pengingat dan waktu pengingat tersebut disetel.',
      memory: 'Memory/Second Brain: Bantu pengguna menyimpan catatan, informasi penting, atau ingatan jangka panjang. Konfirmasikan bahwa informasi tersebut telah disimpan aman dalam memori.',
      task: 'Task Management/To-Do: Bantu pengguna mengelola daftar tugas (To-Do List). Tampilkan tugas yang belum selesai atau konfirmasikan jika tugas baru berhasil ditambahkan.',
      calendar: 'Calendar: Bantu pengguna membuat janji temu, menjadwalkan meeting, atau membuat tautan Google Meet.',
      gmail: 'Gmail: Bantu pengguna membaca inbox email penting, meringkas isi pesan masuk, atau menyusun draf balasan.',
      gdrive: 'Google Drive: Bantu pengguna mencadangkan dokumen/media penting, mencari berkas tersimpan, atau mengunggah berkas.',
      file_summary: 'File Summary: Bantu pengguna membaca berkas dokumen yang diunggah dan menyajikan ringkasan poin-poin penting serta action items dari dokumen tersebut.',
      meeting_assistant: 'Meeting Assistant: Bantu mencatat notulen rapat secara otomatis, merangkum poin pembicaraan penting, dan menandai butir tindakan selanjutnya.',
      email_assistant: 'Email Assistant: Bantu menyusun draf email bisnis formal maupun kasual dengan tata bahasa yang profesional.',
      contact_manager: 'Contact Manager: Bantu mengelola buku alamat pengguna, mencari nomor WhatsApp, atau menyimpan info kontak baru.',
    };

    const globalConfig = await this.prisma.systemConfig.findUnique({
      where: { key: 'prompt:global' },
    });
    const personaConfig = await this.prisma.systemConfig.findUnique({
      where: { key: `prompt:personality:${persona}` },
    });

    let globalPrompt = globalConfig?.value || DEFAULT_GLOBAL_PROMPT;
    let personaPrompt = personaConfig?.value || DEFAULT_PERSONA_PROMPTS[persona] || DEFAULT_PERSONA_PROMPTS.professional;

    let featurePrompt = '';
    if (feature) {
      const featureConfig = await this.prisma.systemConfig.findUnique({
        where: { key: `prompt:feature:${feature}` },
      });
      if (feature === 'daily_briefing' && !featureConfig) {
        const legacyBriefing = await this.prisma.systemConfig.findUnique({
          where: { key: 'prompt:briefing' },
        });
        featurePrompt = legacyBriefing?.value || DEFAULT_FEATURE_PROMPTS.daily_briefing;
      } else {
        featurePrompt = featureConfig?.value || DEFAULT_FEATURE_PROMPTS[feature] || '';
      }
    }

    // Dynamically inject assistant name
    globalPrompt = globalPrompt
      .replace(/MyVA/g, assistantName)
      .replace(/\{assistantName\}/g, assistantName)
      .replace(/\{\{assistantName\}\}/g, assistantName);

    personaPrompt = personaPrompt
      .replace(/MyVA/g, assistantName)
      .replace(/\{assistantName\}/g, assistantName)
      .replace(/\{\{assistantName\}\}/g, assistantName);

    if (featurePrompt) {
      featurePrompt = featurePrompt
        .replace(/MyVA/g, assistantName)
        .replace(/\{assistantName\}/g, assistantName)
        .replace(/\{\{assistantName\}\}/g, assistantName);
    }

    let finalPrompt = `${globalPrompt}\n\nYOUR PERSONA:\n${personaPrompt}`;
    if (featurePrompt) {
      finalPrompt = `${finalPrompt}\n\nFEATURE INSTRUCTION:\n${featurePrompt}`;
    }

    return finalPrompt;
  }

  async summarize(content: string): Promise<{ title?: string; summary: string; keyPoints: string[]; actions: string[] }> {
    try {
      const apiKey = this.geminiApiKey;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not configured.');
      }

      const prompt = `
        Analyze and summarize the following document content.
        Provide the response in JSON format with exactly four fields:
        - "title": A clean, concise title for the content/article.
        - "summary": A short paragraph summarizing the content.
        - "keyPoints": An array of the top 3-5 key takeaways.
        - "actions": An array of action items or next steps found in the text.

        Content to summarize:
        ${content}
      `;

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      const payload = {
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          responseMimeType: 'application/json',
        },
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Gemini API responded with status ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as any;
      const jsonStr = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      const parsed = JSON.parse(jsonStr);
      return {
        title: parsed.title || '',
        summary: parsed.summary || '',
        keyPoints: parsed.keyPoints || [],
        actions: parsed.actions || [],
      };
    } catch (error) {
      this.logger.error(`Gemini Summary Error: ${error.message}`);
      return {
        title: '',
        summary: 'Error summarizing document.',
        keyPoints: [],
        actions: [],
      };
    }
  }

  async parseDateTime(text: string): Promise<{ title: string; scheduledAt: string | null }> {
    try {
      const apiKey = this.geminiApiKey;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not configured.');
      }

      const today = new Date();
      const formatter = new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });

      const parts = formatter.formatToParts(today);
      const year = parts.find(p => p.type === 'year')?.value;
      const month = parts.find(p => p.type === 'month')?.value;
      const day = parts.find(p => p.type === 'day')?.value;
      const hour = parts.find(p => p.type === 'hour')?.value;
      const minute = parts.find(p => p.type === 'minute')?.value;
      const second = parts.find(p => p.type === 'second')?.value;

      const jakartaTimeString = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
      const dayOfWeek = today.toLocaleDateString('id-ID', { weekday: 'long', timeZone: 'Asia/Jakarta' });

      const prompt = `You are a helper that extracts date, time, and title from a user request.
Reference date/time in timezone Asia/Jakarta (WIB) is: ${jakartaTimeString} (Day: ${dayOfWeek}).

User message: "${text}"

Instructions:
1. Extract the title/description of the event/reminder. Clean it from time-related words (like "besok", "nanti", "jam 3", "hari jumat").
2. Calculate the exact scheduled date and time based on the reference time.
3. Return the result in JSON format:
{
  "title": "Cleaned Event Title",
  "scheduledAt": "YYYY-MM-DDTHH:mm:ss" 
}
Do NOT include timezone offset in scheduledAt string. Keep it in local Asia/Jakarta date/time format (YYYY-MM-DDTHH:mm:ss). If no time is specified, default to 1 hour from the reference time.
`;

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      const payload = {
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          responseMimeType: 'application/json',
        },
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Gemini API responded with status ${response.status}`);
      }

      const data = (await response.json()) as any;
      const jsonStr = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      const parsed = JSON.parse(jsonStr);

      if (parsed.scheduledAt) {
        const isoStringWithOffset = parsed.scheduledAt.includes('+') || parsed.scheduledAt.endsWith('Z')
          ? parsed.scheduledAt
          : `${parsed.scheduledAt}+07:00`;

        return {
          title: parsed.title || text,
          scheduledAt: new Date(isoStringWithOffset).toISOString(),
        };
      }

      return {
        title: text,
        scheduledAt: null,
      };
    } catch (error) {
      this.logger.error(`Gemini ParseDateTime Error: ${error.message}`);
      return {
        title: text,
        scheduledAt: null,
      };
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const apiKey = this.geminiApiKey;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not configured.');
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;
      const payload = {
        content: {
          parts: [{ text }]
        }
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Gemini API responded with status ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as any;
      return data.embedding?.values || Array(768).fill(0);
    } catch (error) {
      this.logger.error(`Gemini Embedding Error: ${error.message}`);
      // Fallback dummy embedding vector
      return Array(768).fill(0);
    }
  }

  private tokenizeAndFilter(text: string): string[] {
    const indonesianStopWords = new Set([
      'di', 'dan', 'yang', 'untuk', 'dari', 'dengan', 'ke', 'ini', 'itu', 'adalah',
      'pada', 'bahwa', 'oleh', 'akan', 'secara', 'dalam', 'juga', 'telah', 'bagi',
      'saya', 'anda', 'kami', 'mereka', 'dia', 'kita', 'apa', 'siapa', 'mana', 'ada',
      'bisa', 'dapat', 'karena', 'seperti', 'atau', 'saja', 'hanya', 'tentang',
      'kembali', 'serta', 'sebagai', 'saat', 'sebelum', 'setelah', 'tersebut', 'ialah',
      'yaitu'
    ]);

    const englishStopWords = new Set([
      'the', 'and', 'of', 'to', 'in', 'is', 'that', 'for', 'on', 'with', 'as', 'at',
      'by', 'an', 'be', 'this', 'which', 'or', 'from', 'but', 'not', 'your', 'our',
      'my', 'you', 'we', 'they', 'he', 'she', 'it', 'who', 'what', 'where', 'when',
      'why', 'how', 'are', 'was', 'were', 'been', 'has', 'have', 'had', 'do', 'does',
      'did', 'about', 'also', 'their', 'some', 'than', 'then', 'very', 'only'
    ]);

    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => {
        return word.length > 1 && !indonesianStopWords.has(word) && !englishStopWords.has(word);
      });
  }

  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async semanticSearch(userId: string, query: string): Promise<any[]> {
    try {
      // Fetch user's memories
      const memories = await this.prisma.memory.findMany({
        where: { userId },
      });

      if (memories.length === 0) return [];

      const cleanQuery = query.toLowerCase().trim();
      const queryTokens = this.tokenizeAndFilter(cleanQuery);

      if (queryTokens.length === 0) {
        // Fallback to basic case-insensitive matching if the query only consists of stop words
        const basicWords = cleanQuery.split(/\s+/).filter(w => w.length > 0);
        if (basicWords.length === 0) return [];
        return memories
          .map((mem) => {
            const text = `${mem.title} ${mem.content} ${mem.category}`.toLowerCase();
            let score = 0;
            basicWords.forEach((word) => {
              if (text.includes(word)) {
                score += 1;
                if (mem.title.toLowerCase().includes(word)) score += 2;
              }
            });
            return { ...mem, score };
          })
          .filter((mem) => mem.score > 0)
          .sort((a, b) => b.score - a.score)
          .map(({ score, ...mem }) => mem);
      }

      const N = memories.length;

      // Calculate Document Frequency (DF) for each query token
      const dfMap: Record<string, number> = {};
      queryTokens.forEach((token) => {
        let count = 0;
        memories.forEach((mem) => {
          const text = `${mem.title} ${mem.content} ${mem.category}`.toLowerCase();
          if (text.includes(token)) {
            count++;
          }
        });
        dfMap[token] = count;
      });

      const scoredMemories = memories.map((mem) => {
        const titleLower = mem.title.toLowerCase();
        const contentLower = mem.content.toLowerCase();
        const categoryLower = mem.category.toLowerCase();
        const fullText = `${titleLower} ${contentLower} ${categoryLower}`;

        let score = 0;

        // 1. Exact phrase matches bonus
        if (fullText.includes(cleanQuery)) {
          score += 10;
          if (titleLower.includes(cleanQuery)) {
            score += 15; // Extra bonus for exact phrase in title
          }
        }

        // 2. TF-IDF for individual tokens
        queryTokens.forEach((token) => {
          // Count occurrences in title, content, category
          const titleMatches = (titleLower.match(new RegExp(this.escapeRegExp(token), 'g')) || []).length;
          const contentMatches = (contentLower.match(new RegExp(this.escapeRegExp(token), 'g')) || []).length;
          const categoryMatches = (categoryLower.match(new RegExp(this.escapeRegExp(token), 'g')) || []).length;

          const tf = (titleMatches * 4.0) + contentMatches + (categoryMatches * 1.5);

          if (tf > 0) {
            const df = dfMap[token] || 0;
            // IDF using standard smooth formula
            const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
            score += tf * idf;
          }
        });

        // 3. Length Normalization
        // Normalize to prevent longer documents from naturally scoring higher
        const normScore = score / (1.0 + 0.0005 * mem.content.length);

        return { ...mem, score: normScore };
      });

      // Filter and sort by relevance score
      return scoredMemories
        .filter((mem) => mem.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(({ score, ...mem }) => mem);
    } catch (error) {
      this.logger.error(`Semantic search failed: ${error.message}`);
      return [];
    }
  }

  async transcribeAndSummarizeAudio(
    audioBuffer: Buffer,
    mimeType: string,
  ): Promise<{ transcription: string; summary: string }> {
    const geminiKey = this.geminiApiKey;
    if (!geminiKey) {
      this.logger.warn('GEMINI_API_KEY is not configured. Falling back to mock transcription.');
      return {
        transcription: 'Ini adalah transkripsi simulasi karena GEMINI_API_KEY belum dikonfigurasi.',
        summary: 'Ringkasan simulasi: Harap tambahkan GEMINI_API_KEY ke environment .env untuk mengaktifkan transkripsi suara nyata.',
      };
    }

    try {
      this.logger.log(`Sending audio file (${audioBuffer.length} bytes, mimeType: ${mimeType}) to Gemini API`);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;

      const payload = {
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: audioBuffer.toString('base64'),
                },
              },
              {
                text: 'Tolong buatkan transkripsi lengkap dari file audio ini, kemudian buatkan juga ringkasan yang sangat singkat dan padat (1-2 paragraf) dalam bahasa yang sama dengan pembicara. Format respons harus berupa JSON dengan struktur persis seperti ini: {\n  "transcription": "teks transkripsi lengkap di sini",\n  "summary": "ringkasan singkat di sini"\n}',
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
        },
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Gemini API responded with status ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as any;
      const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!responseText) {
        throw new Error('Empty response from Gemini API.');
      }

      const parsed = JSON.parse(responseText);
      return {
        transcription: parsed.transcription || 'No transcription found.',
        summary: parsed.summary || 'No summary found.',
      };
    } catch (error) {
      this.logger.error(`Gemini Audio Processing Error: ${error.message}`);
      return {
        transcription: `[Gagal mentranskripsi audio: ${error.message}]`,
        summary: 'Gagal memproses ringkasan audio.',
      };
    }
  }

  async classifyIntent(text: string): Promise<IntentClassification> {
    try {
      const apiKey = this.geminiApiKey;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not configured.');
      }

      const today = new Date();
      const formatter = new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });

      const parts = formatter.formatToParts(today);
      const year = parts.find(p => p.type === 'year')?.value;
      const month = parts.find(p => p.type === 'month')?.value;
      const day = parts.find(p => p.type === 'day')?.value;
      const hour = parts.find(p => p.type === 'hour')?.value;
      const minute = parts.find(p => p.type === 'minute')?.value;
      const second = parts.find(p => p.type === 'second')?.value;

      const jakartaTimeString = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
      const dayOfWeek = today.toLocaleDateString('id-ID', { weekday: 'long', timeZone: 'Asia/Jakarta' });

      const prompt = `You are an AI Intent Classifier and Parameter Extractor for MyVA (WhatsApp personal assistant).
Reference date/time in timezone Asia/Jakarta (WIB) is: ${jakartaTimeString} (Day: ${dayOfWeek}).

User message: "${text}"

Instructions:
1. Classify the user's intent into exactly one of these categories:
- "HELP": The user explicitly asks for help, manual, guidance, or list of commands (e.g. "help", "bantuan", "menu", "panduan", "/help", "apa yang bisa kamu lakukan").
- "CREATE_TASK": The user wants to add or create a to-do task (e.g. "todo beli susu", "task siapkan presentasi", "tolong catat tugas buat laporan", "buat todo cuci piring", "tambah task olahraga").
- "CREATE_REMINDER": The user wants to create a reminder (e.g. "ingetin jemput adik besok jam 5 sore", "reminder minum obat nanti malam jam 8", "ingatkan telpon Budi 2 jam lagi").
- "CREATE_CALENDAR_EVENT": The user wants to schedule a meeting, event, or calendar entry (e.g. "jadwal meeting koordinasi besok jam 1 siang", "pertemuan dengan klien hari jumat jam 9 pagi", "buat janji makan siang nanti jam 12").
- "TRACK_EXPENSE": The user wants to log an expense (e.g. "catat beli kopi 25rb", "pengeluaran bayar listrik 150ribu", "tadi jajan bakso 15.000").
- "CREATE_MEMORY": The user wants to save a note, fact, password, or information for long term memory (e.g. "catat nomor seri laptop kantor LPT-9988", "ingat bahwa warna favorit istri saya adalah biru", "tulis catatan password wifi adalah 12345").
- "SEARCH_MEMORIES": The user wants to find, look up, or search stored notes (e.g. "cari nomor seri laptop", "search password wifi", "kemarin saya catat apa tentang resep nasi goreng?").
- "CREATE_CONTACT": The user wants to save a contact (e.g. "kontak John Doe +628991234567", "simpan kontak Budi 081234567").
- "READ_EMAIL": The user wants to read, check, or search emails (e.g. "cek email terbaru", "cari email dari Sarah", "baca inbox gmail").
- "SUMMARIZE_FILE": The user is asking to summarize a document (e.g. "ringkas file ini", "rangkum dokumen di atas").
- "WEB_SEARCH": The user wants to search the internet/web for real-time information (e.g. "cari di internet harga emas hari ini", "browsing pemenang piala dunia", "tanya web berita terbaru").
- "CHAT": Any general conversational message, greeting, or question that doesn't fit the above specific database-mutating intents (e.g. "halo", "apa kabar?", "siapa presiden Indonesia?", "bagaimana menurutmu?").

2. Extract parameters if applicable in the "extracted" object:
- "title": Clean title for tasks/reminders/calendar events (strip time-relative words like "besok", "nanti", "jam 5").
- "scheduledAt": Calculate the exact ISO-8601 date-time string (YYYY-MM-DDTHH:mm:ss) based on the reference time for reminders/events. Do NOT include offset/timezone (e.g. "2026-06-30T17:00:00"). If relative time is given, calculate it.
- "amount": Extract numeric value of money for TRACK_EXPENSE (e.g. "25rb" -> 25000, "1.5 juta" -> 1500000).
- "description": Description of expense (e.g. "beli kopi", "bayar listrik").
- "category": Category of expense (e.g. "Food", "Bills", "Transportation", "Other") or category of memory (default to "Notes").
- "name": Contact name.
- "phone": Contact phone number.
- "query": Query term for searches (email search, memory search, web search).
- "isMeeting": boolean flag for calendar events. Set to true if words like "meeting", "rapat", "pertemuan", "zoom", "meet" are present.

Return response strictly in this JSON format:
{
  "intent": "INTENT_NAME",
  "confidence": 0.0 to 1.0,
  "extracted": {
    "title": "...",
    "scheduledAt": "...",
    "amount": 0,
    "description": "...",
    "category": "...",
    "name": "...",
    "phone": "...",
    "query": "...",
    "isMeeting": false
  }
}
`;

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      const payload = {
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          responseMimeType: 'application/json',
        },
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Gemini API responded with status ${response.status}`);
      }

      const data = (await response.json()) as any;
      const jsonStr = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      const parsed = JSON.parse(jsonStr);

      return {
        intent: parsed.intent || 'CHAT',
        confidence: parsed.confidence || 1.0,
        extracted: parsed.extracted || {},
      };
    } catch (error) {
      this.logger.error(`Gemini ClassifyIntent Error: ${error.message}`);
      return {
        intent: 'CHAT',
        confidence: 0.0,
        extracted: {},
      };
    }
  }
}

