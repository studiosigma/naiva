import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { ReminderService } from './reminder.service';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Reminders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reminder')
export class ReminderController {
  constructor(private readonly reminderService: ReminderService) {}

  @Post()
  @ApiOperation({ summary: 'Create and schedule a new reminder' })
  @ApiResponse({ status: 201, description: 'Reminder successfully scheduled.' })
  async create(@GetUser('id') userId: string, @Body() dto: CreateReminderDto) {
    return this.reminderService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Retrieve scheduled reminders list' })
  async findAll(@GetUser('id') userId: string) {
    return this.reminderService.findAll(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get details of a single reminder' })
  async findOne(@GetUser('id') userId: string, @Param('id') id: string) {
    return this.reminderService.findOne(userId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a reminder' })
  async update(
    @GetUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateReminderDto,
  ) {
    return this.reminderService.update(userId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Cancel/Delete a reminder schedule' })
  async remove(@GetUser('id') userId: string, @Param('id') id: string) {
    return this.reminderService.remove(userId, id);
  }
}
