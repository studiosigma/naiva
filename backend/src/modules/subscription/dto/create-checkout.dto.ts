import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCheckoutDto {
  @IsEnum(['basic', 'pro'])
  @IsNotEmpty()
  plan: 'basic' | 'pro';

  @IsString()
  @IsOptional()
  userId?: string;
}
