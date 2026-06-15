import { Controller, Get, Post, Body, Query, HttpCode, HttpStatus, Logger, Req } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('WhatsApp Webhook')
@Controller('whatsapp')
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(
    private readonly whatsappService: WhatsAppService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Meta Webhook Verification' })
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    const expectedToken = this.configService.get<string>('WHATSAPP_VERIFY_TOKEN') || 'naiva-verify-token-123';
    
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
  async handleWebhook(@Body() payload: any) {
    // Check if it's a valid WhatsApp message event
    if (payload.object === 'whatsapp_business_account') {
      const entry = payload.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      const message = value?.messages?.[0];

      if (message) {
        const from = message.from;
        const type = message.type || 'text';

        if (type === 'text' && message.text?.body) {
          await this.whatsappService.handleIncomingMessage(from, message.text.body);
        } else if (type === 'audio' && message.audio) {
          await this.whatsappService.handleIncomingAudio(from, message.audio);
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
    const from = body.from || '6281234567890';
    const reply = await this.whatsappService.simulateMessage(from, body.message);
    return {
      success: true,
      reply,
    };
  }
}
