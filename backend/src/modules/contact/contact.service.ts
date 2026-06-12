import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { Contact } from '@prisma/client';

@Injectable()
export class ContactService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateContactDto): Promise<Contact> {
    return this.prisma.contact.create({
      data: {
        userId,
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        instagram: dto.instagram,
        company: dto.company,
        notes: dto.notes,
      },
    });
  }

  async findAll(userId: string, search?: string): Promise<Contact[]> {
    const whereClause: any = { userId };

    if (search) {
      whereClause.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.contact.findMany({
      where: whereClause,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(userId: string, id: string): Promise<Contact> {
    const contact = await this.prisma.contact.findFirst({
      where: { id, userId },
    });

    if (!contact) {
      throw new NotFoundException(`Contact with ID ${id} not found.`);
    }

    return contact;
  }

  async update(userId: string, id: string, dto: UpdateContactDto): Promise<Contact> {
    await this.findOne(userId, id); // isolation check

    return this.prisma.contact.update({
      where: { id },
      data: dto,
    });
  }

  async remove(userId: string, id: string): Promise<{ success: boolean }> {
    await this.findOne(userId, id); // isolation check

    await this.prisma.contact.delete({
      where: { id },
    });

    return { success: true };
  }
}
