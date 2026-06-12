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
import { ContactService } from './contact.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';

@ApiTags('Contacts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Post()
  @ApiOperation({ summary: 'Save a new contact details' })
  @ApiResponse({ status: 201, description: 'Contact successfully saved.' })
  async create(@GetUser('id') userId: string, @Body() dto: CreateContactDto) {
    return this.contactService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Retrieve contact list' })
  @ApiQuery({ name: 'search', required: false, description: 'Search keywords in name, phone, notes' })
  async findAll(@GetUser('id') userId: string, @Query('search') search?: string) {
    return this.contactService.findAll(userId, search);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get details of a single contact profile' })
  async findOne(@GetUser('id') userId: string, @Param('id') id: string) {
    return this.contactService.findOne(userId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a contact profile' })
  async update(
    @GetUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateContactDto,
  ) {
    return this.contactService.update(userId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a contact profile' })
  async remove(@GetUser('id') userId: string, @Param('id') id: string) {
    return this.contactService.remove(userId, id);
  }
}
