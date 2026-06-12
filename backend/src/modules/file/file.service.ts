import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { S3Service } from '../../integrations/s3.service';
import { File } from '@prisma/client';

@Injectable()
export class FileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
  ) {}

  async uploadFile(
    userId: string,
    filename: string,
    buffer: Buffer,
    mimeType: string,
    size: number,
  ): Promise<File> {
    const key = `${userId}/${Date.now()}-${filename}`;
    
    // Upload to S3
    await this.s3Service.upload(key, buffer, mimeType);

    // Save record to DB
    return this.prisma.file.create({
      data: {
        userId,
        filename,
        mimeType,
        size,
        storagePath: key,
      },
    });
  }

  async findAll(userId: string): Promise<File[]> {
    return this.prisma.file.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string): Promise<File> {
    const fileRecord = await this.prisma.file.findFirst({
      where: { id, userId },
    });

    if (!fileRecord) {
      throw new NotFoundException(`File record with ID ${id} not found.`);
    }

    return fileRecord;
  }

  async remove(userId: string, id: string): Promise<{ success: boolean }> {
    const fileRecord = await this.findOne(userId, id); // isolation check

    // Delete from S3
    await this.s3Service.delete(fileRecord.storagePath);

    // Delete from DB
    await this.prisma.file.delete({
      where: { id },
    });

    return { success: true };
  }
}
