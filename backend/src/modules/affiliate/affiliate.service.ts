import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { PayoutRequestDto } from './dto/payout-request.dto';

@Injectable()
export class AffiliateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async getStats(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        referralCode: true,
        affiliateBalance: true,
        affiliateTotalEarned: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const referralsCount = await this.prisma.user.count({
      where: { referredById: userId },
    });

    const commissions = await this.prisma.commissionLog.findMany({
      where: { referrerId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        referredUser: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    const payouts = await this.prisma.payoutRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    const appUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
    const referralLink = `${appUrl}/?ref=${user.referralCode || ''}`;

    return {
      referralCode: user.referralCode,
      referralLink,
      affiliateBalance: user.affiliateBalance,
      affiliateTotalEarned: user.affiliateTotalEarned,
      referralsCount,
      commissions: commissions.map((c) => ({
        id: c.id,
        amount: c.amount,
        paymentAmount: c.paymentAmount,
        percentage: c.percentage,
        createdAt: c.createdAt,
        referredUser: {
          name: c.referredUser.name || 'User Baru',
          email: c.referredUser.email,
        },
      })),
      payouts,
    };
  }

  async requestPayout(userId: string, dto: PayoutRequestDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { affiliateBalance: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.affiliateBalance < dto.amount) {
      throw new BadRequestException('Saldo tidak mencukupi untuk melakukan penarikan.');
    }

    // Use a transaction to update user balance and create the payout request safely
    const [_, payoutRequest] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          affiliateBalance: { decrement: dto.amount },
        },
      }),
      this.prisma.payoutRequest.create({
        data: {
          userId,
          amount: dto.amount,
          paymentMethod: dto.paymentMethod,
          accountNumber: dto.accountNumber,
          accountName: dto.accountName,
          status: 'pending',
        },
      }),
    ]);

    return {
      success: true,
      message: 'Permintaan penarikan berhasil diajukan.',
      payoutRequest,
    };
  }
}
