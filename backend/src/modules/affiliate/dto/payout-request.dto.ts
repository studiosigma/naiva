import { IsNumber, IsString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PayoutRequestDto {
  @ApiProperty({ example: 100000, description: 'Amount to withdraw (min 100000)' })
  @IsNumber()
  @Min(100000)
  amount: number;

  @ApiProperty({ example: 'BCA', description: 'Payment method (e.g. BCA, Mandiri, GoPay)' })
  @IsString()
  paymentMethod: string;

  @ApiProperty({ example: '1234567890', description: 'Destination account or phone number' })
  @IsString()
  accountNumber: string;

  @ApiProperty({ example: 'Nur Muis Masyuun', description: 'Full name on destination account' })
  @IsString()
  accountName: string;
}
