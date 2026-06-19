import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePromptDto {
  @ApiProperty({ example: 'prompt:global' })
  @IsString()
  key: string;

  @ApiProperty({ example: 'Kamu adalah asisten MyVA...' })
  @IsString()
  value: string;
}
