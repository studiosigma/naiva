import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { AffiliateService } from './affiliate.service';
import { PayoutRequestDto } from './dto/payout-request.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';

@ApiTags('Affiliate')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('affiliate')
export class AffiliateController {
  constructor(private readonly affiliateService: AffiliateService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Dapatkan statistik afiliasi, link referral, saldo, komisi, dan riwayat payout' })
  async getStats(@GetUser('id') userId: string) {
    return this.affiliateService.getStats(userId);
  }

  @Post('payout-request')
  @ApiOperation({ summary: 'Ajukan permintaan pencairan saldo komisi (min Rp 100.000)' })
  @ApiResponse({ status: 201, description: 'Permintaan penarikan berhasil disimpan.' })
  async requestPayout(@GetUser('id') userId: string, @Body() dto: PayoutRequestDto) {
    return this.affiliateService.requestPayout(userId, dto);
  }
}
