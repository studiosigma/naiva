import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

@Processor('email_queue')
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  async process(job: Job<any, any, string>): Promise<any> {
    const { to, subject, template } = job.data;
    this.logger.log(`Processing transactional email job ${job.id} to ${to}`);
    // Simulate sending email
    this.logger.log(`[Email Service Output] Dispatched email: "${subject}" to ${to} using template: ${template}`);
    return { success: true };
  }
}
