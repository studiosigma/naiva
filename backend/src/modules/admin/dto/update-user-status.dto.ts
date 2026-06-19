import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserStatusDto {
  @ApiProperty({ example: 'suspended', enum: ['active', 'suspended'] })
  @IsEnum(['active', 'suspended'])
  status: 'active' | 'suspended';
}
