import { Controller, Post, Body, UseGuards, Headers, HttpCode, HttpStatus, Header } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Subscription')
@Controller('subscription')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Post('checkout')
  @ApiOperation({ summary: 'Create a new subscription checkout link via Duitku' })
  @ApiResponse({ status: 200, description: 'Checkout link successfully generated.' })
  async createCheckout(
    @Body() dto: CreateCheckoutDto,
    @Headers('authorization') authHeader?: string,
  ) {
    let userId = dto.userId || null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
          if (payload && payload.id) {
            userId = payload.id;
          }
        }
      } catch (err) {
        // ignore errors and fallback
      }
    }

    const url = await this.subscriptionService.createCheckoutLink(userId, dto.plan);
    return {
      success: true,
      url,
    };
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'text/plain')
  @ApiOperation({ summary: 'Duitku callback webhook listener' })
  async handleWebhook(
    @Body() body: any,
  ): Promise<string> {
    const processed = await this.subscriptionService.handleWebhook(body);
    return processed ? 'SUCCESS' : 'FAILED';
  }
}

