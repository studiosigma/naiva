import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TaskService } from './task.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';

@ApiTags('Tasks (Kanban)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('task')
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new task' })
  @ApiResponse({ status: 201, description: 'Task successfully created.' })
  async create(@GetUser('id') userId: string, @Body() dto: CreateTaskDto) {
    return this.taskService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Retrieve user tasks' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status (todo, doing, done)' })
  @ApiQuery({ name: 'priority', required: false, description: 'Filter by priority (low, medium, high)' })
  async findAll(
    @GetUser('id') userId: string,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
  ) {
    return this.taskService.findAll(userId, status, priority);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get details of a single task' })
  async findOne(@GetUser('id') userId: string, @Param('id') id: string) {
    return this.taskService.findOne(userId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a task' })
  async update(
    @GetUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.taskService.update(userId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a task' })
  async remove(@GetUser('id') userId: string, @Param('id') id: string) {
    return this.taskService.remove(userId, id);
  }
}
