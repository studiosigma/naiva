import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ReminderProcessor } from './processors/reminder.processor';
import { FileProcessingProcessor } from './processors/file-processing.processor';
import { AIProcessor } from './processors/ai.processor';
import { EmailProcessor } from './processors/email.processor';
import { IntegrationsModule } from '../integrations/integrations.module';
import { AIModule } from '../modules/ai/ai.module';

@Module({
  imports: [
    IntegrationsModule,
    AIModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST') || 'localhost',
          port: configService.get<number>('REDIS_PORT') || 6379,
        },
      }),
    }),
    BullModule.registerQueue(
      { name: 'reminder_queue' },
      { name: 'email_queue' },
      { name: 'file_processing_queue' },
      { name: 'ai_queue' },
    ),
  ],
  providers: [
    ReminderProcessor,
    FileProcessingProcessor,
    AIProcessor,
    EmailProcessor,
  ],
  exports: [BullModule],
})
export class QueuesModule {}
