import { IsString, IsNotEmpty, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum MemoryCategory {
  NOTES = 'Notes',
  LINKS = 'Links',
  IDEAS = 'Ideas',
  BUSINESS = 'Business',
  CONTACTS = 'Contacts',
}

export class CreateMemoryDto {
  @ApiProperty({ example: 'WhatsApp Marketing Strategy', description: 'Title of the memory note' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'Use personal broadcast lists instead of groups to keep it personal.', description: 'Content body of the memory' })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({ example: 'Business', enum: MemoryCategory, description: 'Categorization tag for filtering' })
  @IsEnum(MemoryCategory)
  category: MemoryCategory;
}
