import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum UserPersona {
  FRIENDLY = 'friendly',
  PROFESSIONAL = 'professional',
  ISLAMIC = 'islamic',
  BUSINESS_PARTNER = 'business_partner',
  GRUMPY_BOSS = 'grumpy_boss',
  ROMANTIC_PARTNER = 'romantic_partner',
}

export class UpdatePersonaDto {
  @ApiProperty({
    example: 'friendly',
    enum: UserPersona,
    description: 'Selected assistant persona',
  })
  @IsEnum(UserPersona)
  @IsNotEmpty()
  persona: UserPersona;
}
