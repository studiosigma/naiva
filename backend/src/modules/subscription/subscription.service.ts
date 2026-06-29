import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async createCheckoutLink(userId: string | null, plan: 'basic' | 'pro'): Promise<string> {
    let user = userId ? await this.prisma.user.findUnique({ where: { id: userId } }) : null;
    if (!user) {
      user = await this.prisma.user.findFirst();
      if (!user) {
        user = await this.prisma.user.create({
          data: {
            email: 'muis@myva.ai',
            name: 'Muis',
            waNumber: '6281234567890',
            plan: 'free',
            status: 'active',
          },
        });
      }
    }

    const merchantCode = this.configService.get<string>('DUITKU_MERCHANT_CODE') || 'D1234';
    const apiKey = this.configService.get<string>('DUITKU_API_KEY') || 'sandbox_api_key_here';
    const isSandbox = this.configService.get<string>('DUITKU_SANDBOX') !== 'false';
    const appUrl = this.configService.get<string>('APP_URL') || 'http://localhost:5173';
    const backendUrl = this.configService.get<string>('BACKEND_URL') || 'http://localhost:3000';

    const baseUrl = isSandbox
      ? 'https://sandbox.duitku.com/webapi/api/merchant/v2/inquiry'
      : 'https://passport.duitku.com/webapi/api/merchant/v2/inquiry';

    const price = plan === 'basic' ? 25000 : 49000;
    const refId = `${user.id}_${plan}_${Date.now()}`;

    // Signature MD5: merchantCode + merchantOrderId + paymentAmount + apiKey
    const signature = crypto
      .createHash('md5')
      .update(merchantCode + refId + price.toString() + apiKey)
      .digest('hex');

    const body = {
      merchantCode,
      paymentAmount: price.toString(),
      merchantOrderId: refId,
      productDetails: `Langganan MyVA Paket ${plan.toUpperCase()}`,
      email: user.email,
      phoneNumber: user.waNumber || '081234567890',
      callbackUrl: `${backendUrl}/subscription/webhook`,
      returnUrl: `${appUrl}/#settings`,
      signature,
    };

    this.logger.log(`Requesting Duitku checkout link for plan ${plan}. Ref: ${refId}`);

    try {
      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json() as any;

      if (!response.ok || !data.paymentUrl) {
        this.logger.error(`Duitku checkout creation failed: ${JSON.stringify(data)}`);
        throw new BadRequestException(
          data.statusMessage || 'Failed to create payment link with Duitku',
        );
      }

      this.logger.log(`Successfully created Duitku link: ${data.paymentUrl}`);
      return data.paymentUrl;
    } catch (error) {
      this.logger.error(`Error connecting to Duitku: ${error.message}`);
      throw new BadRequestException('Payment gateway connection error');
    }
  }

  async handleWebhook(body: any): Promise<boolean> {
    const apiKey = this.configService.get<string>('DUITKU_API_KEY') || 'sandbox_api_key_here';
    const bypass = this.configService.get<string>('DUITKU_BYPASS_SIGNATURE') === 'true';

    this.logger.log(`Received Duitku webhook callback: ${JSON.stringify(body)}`);

    const { merchantCode, amount, merchantOrderId, signature, resultCode } = body;
    if (!merchantOrderId) {
      this.logger.warn('Webhook callback does not contain merchantOrderId');
      return false;
    }

    // Verify Duitku signature MD5: merchantCode + amount + merchantOrderId + apiKey
    if (!bypass && signature) {
      const generated = crypto
        .createHash('md5')
        .update(merchantCode + amount + merchantOrderId + apiKey)
        .digest('hex');

      if (generated !== signature) {
        this.logger.warn(`Invalid Duitku signature. Payload: ${signature}, Generated: ${generated}`);
        return false;
      }
    }

    // Duitku success resultCode is '00'
    if (resultCode === '00') {
      const parts = merchantOrderId.split('_');
      if (parts.length >= 2) {
        const userId = parts[0];
        const plan = parts[1] as 'basic' | 'pro';

        this.logger.log(`Upgrading user ${userId} to plan ${plan} based on webhook payment`);
        
        await this.prisma.user.update({
          where: { id: userId },
          data: { plan },
        });

        // Check if user was referred by someone
        const userDetails = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { referredById: true },
        });

        if (userDetails && userDetails.referredById) {
          const paymentAmount = parseFloat(amount);
          
          // Count previous commissions generated by this user to determine if it is their first payment
          const existingCommissionCount = await this.prisma.commissionLog.count({
            where: { referredUserId: userId }
          });
          
          const isFirstPayment = existingCommissionCount === 0;
          const percentage = isFirstPayment ? 30 : 10;
          const commissionAmount = paymentAmount * (percentage / 100);

          // Update referrer's balances
          await this.prisma.user.update({
            where: { id: userDetails.referredById },
            data: {
              affiliateBalance: { increment: commissionAmount },
              affiliateTotalEarned: { increment: commissionAmount },
            }
          });

          // Log the commission transaction
          await this.prisma.commissionLog.create({
            data: {
              referrerId: userDetails.referredById,
              referredUserId: userId,
              amount: commissionAmount,
              paymentAmount: paymentAmount,
              percentage: percentage,
            }
          });

          this.logger.log(`Affiliate commission of ${percentage}% (${commissionAmount}) granted to referrer ${userDetails.referredById} for user ${userId}`);
        }

        // Log the upgrade action in UsageLog
        await this.prisma.usageLog.create({
          data: {
            userId,
            actionType: 'PLAN_UPGRADE',
            description: `Upgraded subscription to ${plan.toUpperCase()}`,
          },
        });

        return true;
      }
    }

    this.logger.log(`Transaction status is not successful: resultCode = ${resultCode}`);
    return false;
  }
}

