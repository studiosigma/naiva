import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../database/prisma.service';
import { WhatsAppApiService } from '../../integrations/whatsapp-api.service';

@Processor('reminder_queue')
export class ReminderProcessor extends WorkerHost {
  private readonly logger = new Logger(ReminderProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappApiService: WhatsAppApiService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { reminderId, userId } = job.data;
    this.logger.log(`Processing reminder job ${job.id} for reminder ID ${reminderId}`);

    const reminder = await this.prisma.reminder.findUnique({
      where: { id: reminderId },
      include: { user: true },
    });

    if (!reminder) {
      this.logger.warn(`Reminder ${reminderId} not found in database.`);
      return;
    }

    if (reminder.status === 'cancelled' || reminder.status === 'sent') {
      this.logger.warn(`Reminder ${reminderId} has already been sent or is cancelled.`);
      return;
    }

    const waNumber = reminder.user.waNumber;
    if (!waNumber) {
      this.logger.warn(`User ${userId} does not have a registered WhatsApp number.`);
      await this.prisma.reminder.update({
        where: { id: reminderId },
        data: { status: 'failed' },
      });
      return;
    }

    // Send interactive button message
    const messageText = `⏰ *MYVA Reminder!*\n\n*${reminder.title}*\n${reminder.description || ''}`;
    const buttons = [
      { id: `complete_reminder_${reminder.id}`, title: 'Selesai' },
      { id: `snooze_reminder_${reminder.id}`, title: 'Tunda 10 Menit' },
    ];
    const sent = await this.whatsappApiService.sendInteractiveButtons(waNumber, messageText, buttons);

    if (sent) {
      this.logger.log(`Reminder notification successfully dispatched to ${waNumber}`);
      await this.prisma.reminder.update({
        where: { id: reminderId },
        data: { status: 'sent' },
      });

      // Handle Repeat Schedules
      if (reminder.repeatType !== 'once') {
        await this.scheduleNextOccurrence(reminder);
      }
    } else {
      this.logger.error(`Failed to send reminder to ${waNumber}`);
      await this.prisma.reminder.update({
        where: { id: reminderId },
        data: { status: 'failed' },
      });
    }
  }

  private async scheduleNextOccurrence(reminder: any): Promise<void> {
    const nextDate = new Date(reminder.scheduledAt);
    
    switch (reminder.repeatType) {
      case 'daily':
        nextDate.setDate(nextDate.getDate() + 1);
        break;
      case 'weekly':
        nextDate.setDate(nextDate.getDate() + 7);
        break;
      case 'monthly':
        nextDate.setMonth(nextDate.getMonth() + 1);
        break;
      case 'yearly':
        nextDate.setFullYear(nextDate.getFullYear() + 1);
        break;
    }

    this.logger.log(`Scheduling next recurring occurrence for reminder ${reminder.id} at ${nextDate}`);

    // Create a new reminder record with status pending
    await this.prisma.reminder.create({
      data: {
        userId: reminder.userId,
        title: reminder.title,
        description: reminder.description,
        scheduledAt: nextDate,
        repeatType: reminder.repeatType,
        status: 'pending',
      },
    });
  }
}
