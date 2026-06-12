import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateMemoryDto } from './dto/create-memory.dto';
import { UpdateMemoryDto } from './dto/update-memory.dto';
import { Memory } from '@prisma/client';

@Injectable()
export class MemoryService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateMemoryDto): Promise<Memory> {
    return this.prisma.memory.create({
      data: {
        userId,
        title: dto.title,
        content: dto.content,
        category: dto.category,
      },
    });
  }

  async findAll(userId: string, search?: string, category?: string): Promise<Memory[]> {
    const whereClause: any = { userId };

    if (category) {
      whereClause.category = category;
    }

    if (search) {
      whereClause.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.memory.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string): Promise<Memory> {
    const memory = await this.prisma.memory.findFirst({
      where: { id, userId },
    });

    if (!memory) {
      throw new NotFoundException(`Memory entry with ID ${id} not found.`);
    }

    return memory;
  }

  async update(userId: string, id: string, dto: UpdateMemoryDto): Promise<Memory> {
    // Ensure existence
    await this.findOne(userId, id);

    return this.prisma.memory.update({
      where: { id },
      data: dto,
    });
  }

  async remove(userId: string, id: string): Promise<{ success: boolean }> {
    // Ensure existence
    await this.findOne(userId, id);

    await this.prisma.memory.delete({
      where: { id },
    });

    return { success: true };
  }
}
