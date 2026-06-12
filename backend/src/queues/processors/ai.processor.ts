import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { AIService } from '../../modules/ai/ai.service';

@Processor('ai_queue')
export class AIProcessor extends WorkerHost {
  private readonly logger = new Logger(AIProcessor.name);

  constructor(private readonly aiService: AIService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { prompt } = job.data;
    this.logger.log(`Processing AI request job ${job.id}`);

    const reply = await this.aiService.chat([{ role: 'user', content: prompt }]);
    this.logger.log(`AI worker processed reply: "${reply.substring(0, 30)}..."`);
    return { reply };
  }
}
