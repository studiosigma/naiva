import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ExpenseService } from './expense.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Expenses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('expenses')
export class ExpenseController {
  constructor(private readonly expenseService: ExpenseService) {}

  @Post()
  @ApiOperation({ summary: 'Save a new financial expense' })
  @ApiResponse({ status: 201, description: 'Expense recorded successfully.' })
  async create(@GetUser('id') userId: string, @Body() dto: CreateExpenseDto) {
    return this.expenseService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Retrieve expense tracking logs' })
  async findAll(@GetUser('id') userId: string) {
    return this.expenseService.findAll(userId);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get monthly category spending aggregations' })
  async getStats(@GetUser('id') userId: string) {
    return this.expenseService.getMonthlyStats(userId);
  }
}
