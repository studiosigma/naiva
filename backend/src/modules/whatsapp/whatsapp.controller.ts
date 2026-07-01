import { Controller, Get, Post, Body, Query, HttpCode, HttpStatus, Logger, Req } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import * as crypto from 'crypto';

@ApiTags('WhatsApp Webhook')
@Controller('whatsapp')
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(
    private readonly whatsappService: WhatsAppService,
    private readonly configService: ConfigService,
  ) {}

  private validateSignature(req: any): boolean {
    const signature = req.headers['x-hub-signature-256'];
    const appSecret = this.configService.get<string>('WHATSAPP_APP_SECRET');

    if (!appSecret) {
      this.logger.warn('WHATSAPP_APP_SECRET is not configured. Webhook signature verification bypassed.');
      return true;
    }

    if (!signature) {
      this.logger.warn('x-hub-signature-256 header is missing.');
      return false;
    }

    const parts = signature.split('=');
    if (parts.length !== 2 || parts[0] !== 'sha256') {
      this.logger.warn('Invalid x-hub-signature-256 format.');
      return false;
    }

    const [, sigHash] = parts;
    const rawBody = req.rawBody;
    if (!rawBody) {
      this.logger.warn('Raw body is empty or not available. Signature validation failed.');
      return false;
    }

    const expectedHash = crypto
      .createHmac('sha256', appSecret)
      .update(rawBody)
      .digest('hex');

    if (sigHash.length !== expectedHash.length) {
      return false;
    }

    const isValid = crypto.timingSafeEqual(
      Buffer.from(sigHash, 'ascii'),
      Buffer.from(expectedHash, 'ascii'),
    );

    if (!isValid) {
      this.logger.error('Webhook signature mismatch! Potential spoofing attempt.');
    }

    return isValid;
  }

  @Get()
  @ApiOperation({ summary: 'Meta Webhook Verification' })
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    const expectedToken = this.configService.get<string>('WHATSAPP_VERIFY_TOKEN') || 'myva-verify-token-123';
    
    if (mode === 'subscribe' && token === expectedToken) {
      this.logger.log('Webhook verified successfully!');
      return challenge;
    }
    
    this.logger.warn('Webhook verification failed.');
    return 'Verification failed';
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive incoming WhatsApp events' })
  async handleWebhook(@Req() req: any, @Body() payload: any) {
    // 1. Verify webhook signature
    if (!this.validateSignature(req)) {
      return { success: false, error: 'Unauthorized signature' };
    }

    // 2. Check if it's a valid WhatsApp message event
    if (payload.object === 'whatsapp_business_account') {
      const entry = payload.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      const message = value?.messages?.[0];

      if (message) {
        const from = message.from;
        const type = message.type || 'text';
        const messageId = message.id;

        if (type === 'text' && message.text?.body) {
          await this.whatsappService.handleIncomingMessage(from, message.text.body, messageId);
        } else if (type === 'audio' && message.audio) {
          await this.whatsappService.handleIncomingAudio(from, message.audio, messageId);
        } else if (type === 'document' && message.document) {
          await this.whatsappService.handleIncomingDocument(from, message.document, messageId);
        } else if (type === 'image' && message.image) {
          await this.whatsappService.handleIncomingImage(from, message.image, messageId);
        } else if (type === 'interactive' && message.interactive?.type === 'button_reply') {
          const buttonId = message.interactive.button_reply.id;
          if (buttonId.startsWith('complete_reminder_') || buttonId.startsWith('snooze_reminder_')) {
            await this.whatsappService.handleReminderInteraction(from, buttonId);
          }
        }
      }
    }
    return { success: true };
  }

  @Post('simulate')
  @ApiOperation({ summary: 'Simulate a WhatsApp message and get the AI reply' })
  async simulateMessage(@Body() body: { message: string; from?: string }) {
    const from = body.from || '628212117810';
    const reply = await this.whatsappService.simulateMessage(from, body.message);
    return {
      success: true,
      reply,
    };
  }
}
