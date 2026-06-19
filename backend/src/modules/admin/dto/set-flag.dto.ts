import { IsString, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetFlagDto {
  @ApiProperty({ example: 'flag:gcal' })
  @IsString()
  key: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  value: boolean;
}
