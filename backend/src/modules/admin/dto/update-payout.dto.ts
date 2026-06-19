import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePayoutDto {
  @ApiProperty({ example: 'completed', enum: ['completed', 'rejected'] })
  @IsEnum(['completed', 'rejected'])
  status: 'completed' | 'rejected';
}
