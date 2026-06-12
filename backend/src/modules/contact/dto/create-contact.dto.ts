import { IsString, IsNotEmpty, IsOptional, IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateContactDto {
  @ApiProperty({ example: 'John Doe', description: 'Contact full name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: '+628991234567', description: 'Phone number' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ example: 'john@javacoffee.co', description: 'Email address', required: false })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ example: 'john_coffee', description: 'Instagram handle name', required: false })
  @IsString()
  @IsOptional()
  instagram?: string;

  @ApiProperty({ example: 'Java Beans Corp', description: 'Company name', required: false })
  @IsString()
  @IsOptional()
  company?: string;

  @ApiProperty({ example: 'Met John at coffee conference. Coffee importer.', description: 'Subnotes/metadata', required: false })
  @IsString()
  @IsOptional()
  notes?: string;
}
