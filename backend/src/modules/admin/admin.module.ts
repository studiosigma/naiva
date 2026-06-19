import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { ConfigModule } from '@nestjs/config';
import { IntegrationsModule } from '../../integrations/integrations.module';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    ConfigModule,
    IntegrationsModule,
    BullModule.registerQueue(
      { name: 'reminder_queue' },
      { name: 'email_queue' },
      { name: 'file_processing_queue' },
      { name: 'ai_queue' },
    ),
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
