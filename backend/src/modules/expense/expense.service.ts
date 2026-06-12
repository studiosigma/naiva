import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { Expense } from '@prisma/client';

@Injectable()
export class ExpenseService {
  private readonly logger = new Logger(ExpenseService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateExpenseDto): Promise<Expense> {
    this.logger.log(`Recording expense of ${dto.amount} for user ${userId}`);
    return this.prisma.expense.create({
      data: {
        userId,
        amount: dto.amount,
        description: dto.description,
        category: dto.category || 'Lainnya',
      },
    });
  }

  async findAll(userId: string): Promise<Expense[]> {
    return this.prisma.expense.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getMonthlyStats(userId: string): Promise<{ category: string; total: number }[]> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const expenses = await this.prisma.expense.findMany({
      where: {
        userId,
        createdAt: {
          gte: startOfMonth,
        },
      },
    });

    const categoryMap: Record<string, number> = {};
    for (const exp of expenses) {
      const cat = exp.category || 'Lainnya';
      categoryMap[cat] = (categoryMap[cat] || 0) + exp.amount;
    }

    return Object.entries(categoryMap).map(([category, total]) => ({
      category,
      total,
    }));
  }
}
