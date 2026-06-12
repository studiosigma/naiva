import { PartialType, ApiProperty } from '@nestjs/swagger';
import { CreateReminderDto } from './create-reminder.dto';
import { IsOptional, IsString } from 'class-validator';

export class UpdateReminderDto extends PartialType(CreateReminderDto) {
  @ApiProperty({ example: 'completed', description: 'Reminder execution status', required: false })
  @IsString()
  @IsOptional()
  status?: string;
}
