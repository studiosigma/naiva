import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SignupDto {
  @ApiProperty({ example: 'user@example.com', description: 'User email address' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecurePassword123', description: 'User password (min 6 characters)' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 'Muis', description: 'User full name', required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ example: '628212117810', description: 'WhatsApp phone number with country code', required: false })
  @IsString()
  @IsOptional()
  waNumber?: string;

  @ApiProperty({ example: 'muis123', description: 'Referral code of the user who invited them', required: false })
  @IsString()
  @IsOptional()
  referralCode?: string;
}
