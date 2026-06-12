import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Reminder } from '@prisma/client';

@Injectable()
export class ReminderService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('reminder_queue') private readonly reminderQueue: Queue,
  ) {}

  async create(userId: string, dto: CreateReminderDto): Promise<Reminder> {
    const reminder = await this.prisma.reminder.create({
      data: {
        userId,
        title: dto.title,
        description: dto.description,
        scheduledAt: new Date(dto.scheduledAt),
        repeatType: dto.repeatType || 'once',
        status: 'pending',
      },
    });

    // Calculate delay (ms)
    const delay = new Date(dto.scheduledAt).getTime() - Date.now();
    
    // Add job to BullMQ
    await this.reminderQueue.add(
      'send_reminder',
      { reminderId: reminder.id, userId },
      { 
        delay: Math.max(0, delay), 
        jobId: reminder.id, // Using reminder ID as jobId makes it easy to update/remove
        removeOnComplete: true,
      },
    );

    return reminder;
  }

  async findAll(userId: string): Promise<Reminder[]> {
    return this.prisma.reminder.findMany({
      where: { userId },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  async findOne(userId: string, id: string): Promise<Reminder> {
    const reminder = await this.prisma.reminder.findFirst({
      where: { id, userId },
    });

    if (!reminder) {
      throw new NotFoundException(`Reminder with ID ${id} not found.`);
    }

    return reminder;
  }

  async update(userId: string, id: string, dto: UpdateReminderDto): Promise<Reminder> {
    await this.findOne(userId, id); // isolation validation

    const updated = await this.prisma.reminder.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        repeatType: dto.repeatType,
        status: dto.status,
      },
    });

    // If scheduledAt changed, reschedule the job
    if (dto.scheduledAt) {
      // Remove old scheduled job if it exists
      const job = await this.reminderQueue.getJob(id);
      if (job) {
        await job.remove();
      }

      const delay = new Date(dto.scheduledAt).getTime() - Date.now();
      await this.reminderQueue.add(
        'send_reminder',
        { reminderId: updated.id, userId },
        { 
          delay: Math.max(0, delay), 
          jobId: updated.id, 
          removeOnComplete: true,
        },
      );
    }

    return updated;
  }

  async remove(userId: string, id: string): Promise<{ success: boolean }> {
    await this.findOne(userId, id); // isolation validation

    // Remove pending job from BullMQ
    const job = await this.reminderQueue.getJob(id);
    if (job) {
      await job.remove();
    }

    await this.prisma.reminder.delete({
      where: { id },
    });

    return { success: true };
  }
}
