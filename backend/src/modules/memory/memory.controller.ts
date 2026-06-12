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
import { MemoryService } from './memory.service';
import { CreateMemoryDto } from './dto/create-memory.dto';
import { UpdateMemoryDto } from './dto/update-memory.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';

@ApiTags('Memories (Second Brain)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('memory')
export class MemoryController {
  constructor(private readonly memoryService: MemoryService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new memory note or link' })
  @ApiResponse({ status: 201, description: 'Memory successfully saved.' })
  async create(@GetUser('id') userId: string, @Body() dto: CreateMemoryDto) {
    return this.memoryService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Retrieve all memories (supports search and filter)' })
  @ApiQuery({ name: 'search', required: false, description: 'Search keywords in title/content' })
  @ApiQuery({ name: 'category', required: false, description: 'Filter by category' })
  async findAll(
    @GetUser('id') userId: string,
    @Query('search') search?: string,
    @Query('category') category?: string,
  ) {
    return this.memoryService.findAll(userId, search, category);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific memory note details' })
  async findOne(@GetUser('id') userId: string, @Param('id') id: string) {
    return this.memoryService.findOne(userId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an existing memory entry' })
  async update(
    @GetUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateMemoryDto,
  ) {
    return this.memoryService.update(userId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a memory entry' })
  async remove(@GetUser('id') userId: string, @Param('id') id: string) {
    return this.memoryService.remove(userId, id);
  }
}
