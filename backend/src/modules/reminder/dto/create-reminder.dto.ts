import { IsString, IsNotEmpty, IsOptional, IsEnum, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum RepeatType {
  ONCE = 'once',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

export class CreateReminderDto {
  @ApiProperty({ example: 'Call John coffee shipment', description: 'Reminder summary' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'Ask about Arabica Java Preanger stock levels', description: 'Detailed subnotes', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: '2026-06-12T10:00:00Z', description: 'Target trigger date and time' })
  @IsDateString()
  @IsNotEmpty()
  scheduledAt: string;

  @ApiProperty({ example: 'once', enum: RepeatType, description: 'Repeat frequency' })
  @IsEnum(RepeatType)
  @IsOptional()
  repeatType?: RepeatType;
}
