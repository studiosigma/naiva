import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AIService {
  private readonly openai: OpenAI;
  private readonly logger = new Logger(AIService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY') || 'mock-api-key';
    this.openai = new OpenAI({ apiKey });
  }

  async chat(messages: OpenAI.Chat.ChatCompletionMessageParam[], persona?: string): Promise<string> {
    try {
      let finalMessages = [...messages];
      if (persona) {
        const systemPrompt = this.getPersonaSystemPrompt(persona);
        // Prepend persona system prompt
        finalMessages = [
          { role: 'system', content: systemPrompt },
          ...finalMessages,
        ];
      }

      const response = await this.openai.chat.completions.create({
        model: this.configService.get<string>('OPENAI_CHAT_MODEL') || 'gpt-4o-mini',
        messages: finalMessages,
        temperature: 0.7,
      });
      return response.choices[0]?.message?.content || 'No response from assistant.';
    } catch (error) {
      this.logger.error(`OpenAI Chat Error: ${error.message}`);
      return `[AI Error]: Could not generate chat response.`;
    }
  }

  private getPersonaSystemPrompt(persona: string): string {
    const prompts: Record<string, string> = {
      friendly: 'You are NAIVA, a personal AI assistant and second brain inside WhatsApp. Persona: Friendly. Be warm, empathetic, conversational, and highly helpful. Keep answers concise, and use the user\'s language.',
      professional: 'You are NAIVA, a personal AI assistant and second brain inside WhatsApp. Persona: Professional. Be polite, maintain an executive tone, keep replies brief, and remain business-focused. Use the user\'s language.',
      islamic: 'You are NAIVA, a personal AI assistant and second brain inside WhatsApp. Persona: Islamic Assistant. Incorporate Islamic values, prayer reminders, and daily wisdom where appropriate. Use the user\'s language.',
      business_partner: 'You are NAIVA, a personal AI assistant and second brain inside WhatsApp. Persona: Business Partner. Be analytical, critical, strategic, and ROI-focused. Discuss ideas constructively but critically, offering insights on business growth. Use the user\'s language.',
      grumpy_boss: 'You are NAIVA, a personal AI assistant and second brain inside WhatsApp. Persona: Grumpy Boss. Be strict, demanding, direct, and impatient. Demands efficiency, gets straight to the point, and pushes the user to stop procrastinating. Use the user\'s language.',
      romantic_partner: 'You are NAIVA, a personal AI assistant and second brain inside WhatsApp. Persona: Romantic Partner / Pasangan atau Pacar. Anda adalah pasangan (pacar) yang hangat, ramah, dan sangat suportif. Tanyakan kabar user dengan penuh perhatian, gunakan bahasa yang santai and penuh empati, serta berikan semangat dalam aktivitas sehari-hari. Gunakan panggilan sayang seperti "sayang" atau "beb" ketika berbicara dengan user.',
    };
    return prompts[persona] || prompts.professional;
  }

  async summarize(content: string): Promise<{ title?: string; summary: string; keyPoints: string[]; actions: string[] }> {
    try {
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

      const response = await this.openai.chat.completions.create({
        model: this.configService.get<string>('OPENAI_CHAT_MODEL') || 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const jsonStr = response.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(jsonStr);
      return {
        title: parsed.title || '',
        summary: parsed.summary || '',
        keyPoints: parsed.keyPoints || [],
        actions: parsed.actions || [],
      };
    } catch (error) {
      this.logger.error(`OpenAI Summary Error: ${error.message}`);
      return {
        title: '',
        summary: 'Error summarizing document.',
        keyPoints: [],
        actions: [],
      };
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
      });
      return response.data[0].embedding;
    } catch (error) {
      this.logger.error(`OpenAI Embedding Error: ${error.message}`);
      // Fallback dummy embedding vector
      return Array(1536).fill(0);
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
    const geminiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!geminiKey || geminiKey === 'your-gemini-api-key-here') {
      this.logger.warn('GEMINI_API_KEY is not configured. Falling back to mock transcription.');
      return {
        transcription: 'Ini adalah transkripsi simulasi karena GEMINI_API_KEY belum dikonfigurasi.',
        summary: 'Ringkasan simulasi: Harap tambahkan GEMINI_API_KEY ke environment .env untuk mengaktifkan transkripsi suara nyata.',
      };
    }

    try {
      this.logger.log(`Sending audio file (${audioBuffer.length} bytes, mimeType: ${mimeType}) to Gemini API`);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
      
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
}
