import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateIntegrationsDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  gcalConnected?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  gdriveConnected?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  contactsSyncEnabled?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  gmailConnected?: boolean;
}

export class UpdateBriefingDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  briefingEnabled?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  briefingTime?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  followupEnabled?: boolean;
}
