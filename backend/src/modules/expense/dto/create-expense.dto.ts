import { IsString, IsNotEmpty, IsOptional, IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateExpenseDto {
  @ApiProperty({ example: 25000, description: 'Expense amount in IDR' })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ example: 'Beli kopi susu', description: 'Description of the expense' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ example: 'Makanan', description: 'Category of the expense', required: false })
  @IsString()
  @IsOptional()
  category?: string;
}
