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

    const va = this.configService.get<string>('IPAYMU_VA') || '0000002416172605';
    const apiKey = this.configService.get<string>('IPAYMU_API_KEY') || 'sandbox_api_key_here';
    const isSandbox = this.configService.get<string>('IPAYMU_SANDBOX') !== 'false';
    const appUrl = this.configService.get<string>('APP_URL') || 'http://localhost:5173';
    const backendUrl = this.configService.get<string>('BACKEND_URL') || 'http://localhost:3000';

    const baseUrl = isSandbox
      ? 'https://sandbox.ipaymu.com/api/v2/payment'
      : 'https://my.ipaymu.com/api/v2/payment';

    const price = plan === 'basic' ? 25000 : 49000;
    const refId = `${user.id}:${plan}:${Date.now()}`;

    const body = {
      name: user.name || 'MYVA User',
      email: user.email,
      phone: user.waNumber || '081234567890',
      amount: price.toString(),
      notifyUrl: `${backendUrl}/subscription/webhook`,
      returnUrl: `${appUrl}/#settings`,
      cancelUrl: `${appUrl}/#settings`,
      referenceId: refId,
      comment: `Langganan MYVA Paket ${plan.toUpperCase()}`,
    };

    const timestamp = this.getTimestamp();
    const signature = this.generateSignature('POST', va, body, apiKey);

    this.logger.log(`Requesting iPaymu checkout link for plan ${plan}. Ref: ${refId}`);

    try {
      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          va: va,
          signature: signature,
          timestamp: timestamp,
        },
        body: JSON.stringify(body),
      });

      const data = await response.json() as any;

      if (!response.ok || data.Status !== 200) {
        this.logger.error(`iPaymu checkout creation failed: ${JSON.stringify(data)}`);
        throw new BadRequestException(
          data.Message || 'Failed to create payment link with iPaymu',
        );
      }

      this.logger.log(`Successfully created iPaymu link: ${data.Data?.Url}`);
      return data.Data?.Url;
    } catch (error) {
      this.logger.error(`Error connecting to iPaymu: ${error.message}`);
      throw new BadRequestException('Payment gateway connection error');
    }
  }

  async handleWebhook(body: any, signature: string): Promise<boolean> {
    const apiKey = this.configService.get<string>('IPAYMU_API_KEY') || 'sandbox_api_key_here';
    const bypass = this.configService.get<string>('IPAYMU_BYPASS_SIGNATURE') !== 'false';

    this.logger.log(`Received iPaymu webhook callback: ${JSON.stringify(body)}`);

    // Verify signature
    if (!bypass && signature) {
      const bodyString = JSON.stringify(body);
      const generated = crypto
        .createHmac('sha256', apiKey)
        .update(bodyString)
        .digest('hex');

      if (generated !== signature) {
        this.logger.warn(`Invalid iPaymu signature. Header: ${signature}, Generated: ${generated}`);
        return false;
      }
    }

    const { referenceId, status_code, status } = body;
    if (!referenceId) {
      this.logger.warn('Webhook callback does not contain referenceId');
      return false;
    }

    // Only process successful payments (status_code = 1, status = 'berhasil' or similar)
    if (status_code === '1' || status_code === 1 || status?.toLowerCase() === 'berhasil') {
      const parts = referenceId.split(':');
      if (parts.length >= 2) {
        const userId = parts[0];
        const plan = parts[1] as 'basic' | 'pro';

        this.logger.log(`Upgrading user ${userId} to plan ${plan} based on webhook payment`);
        
        await this.prisma.user.update({
          where: { id: userId },
          data: { plan },
        });

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

    this.logger.log(`Transaction status is not successful: ${status} (code: ${status_code})`);
    return false;
  }

  private generateSignature(method: string, va: string, body: any, apiKey: string): string {
    const bodyHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(body))
      .digest('hex')
      .toLowerCase();

    const stringToSign = `${method.toUpperCase()}:${va}:${bodyHash}:${apiKey}`;
    return crypto
      .createHmac('sha256', apiKey)
      .update(stringToSign)
      .digest('hex');
  }

  private getTimestamp(): string {
    const date = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return (
      date.getFullYear() +
      pad(date.getMonth() + 1) +
      pad(date.getDate()) +
      pad(date.getHours()) +
      pad(date.getMinutes()) +
      pad(date.getSeconds())
    );
  }
}
