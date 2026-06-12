import { IsString, IsNotEmpty, IsOptional, IsEnum, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum TaskStatus {
  TODO = 'todo',
  DOING = 'doing',
  DONE = 'done',
}

export enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export class CreateTaskDto {
  @ApiProperty({ example: 'Finalize Landing Page Copy', description: 'Title of the task' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'Draft copy for main features and subscription tables', description: 'Detailed subnotes', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 'todo', enum: TaskStatus, description: 'Current status column' })
  @IsEnum(TaskStatus)
  @IsOptional()
  status?: TaskStatus;

  @ApiProperty({ example: 'medium', enum: TaskPriority, description: 'Task priority level' })
  @IsEnum(TaskPriority)
  @IsOptional()
  priority?: TaskPriority;

  @ApiProperty({ example: '2026-06-12T17:00:00Z', description: 'Target completion timestamp', required: false })
  @IsDateString()
  @IsOptional()
  deadline?: string;
}
