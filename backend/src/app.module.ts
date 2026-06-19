import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';
import { MemoryModule } from './modules/memory/memory.module';
import { ReminderModule } from './modules/reminder/reminder.module';
import { TaskModule } from './modules/task/task.module';
import { ContactModule } from './modules/contact/contact.module';
import { FileModule } from './modules/file/file.module';
import { AIModule } from './modules/ai/ai.module';
import { QueuesModule } from './queues/queues.module';
import { ExpenseModule } from './modules/expense/expense.module';
import { SubscriptionModule } from './modules/subscription/subscription.module';
import { AffiliateModule } from './modules/affiliate/affiliate.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    // Database Global
    DatabaseModule,

    // Core Queues & Workers
    QueuesModule,

    // Domain Modules
    AuthModule,
    UsersModule,
    WhatsAppModule,
    MemoryModule,
    ReminderModule,
    TaskModule,
    ContactModule,
    FileModule,
    AIModule,
    ExpenseModule,
    SubscriptionModule,
    AffiliateModule,
    AdminModule,
  ],
})
export class AppModule {}
