import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WhatsAppApiService {
  private readonly logger = new Logger(WhatsAppApiService.name);
  private readonly token: string;
  private readonly phoneNumberId: string;
  private readonly version: string;

  constructor(private readonly configService: ConfigService) {
    this.token = this.configService.get<string>('WHATSAPP_TOKEN') || 'mock-token';
    this.phoneNumberId = this.configService.get<string>('WHATSAPP_PHONE_NUMBER_ID') || 'mock-phone-id';
    this.version = this.configService.get<string>('WHATSAPP_VERSION') || 'v18.0';
  }

  async sendMessage(to: string, text: string): Promise<boolean> {
    const url = `https://graph.facebook.com/${this.version}/${this.phoneNumberId}/messages`;
    
    this.logger.log(`[WhatsApp API] Sending message to ${to}: "${text.substring(0, 60)}..."`);
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'text',
          text: { preview_url: false, body: text },
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        this.logger.error(`WhatsApp API Error: ${JSON.stringify(data)}`);
        return false;
      }
      this.logger.log(`WhatsApp message sent successfully. Message ID: ${(data as any)?.messages?.[0]?.id}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send WhatsApp message: ${error.message}`);
      return false;
    }
  }

  async getMediaUrl(mediaId: string): Promise<string> {
    const url = `https://graph.facebook.com/${this.version}/${mediaId}`;
    try {
      this.logger.log(`Fetching media URL for media ID: ${mediaId}`);
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.token}`,
        },
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch media metadata: ${response.statusText}`);
      }
      const data = (await response.json()) as any;
      return data.url;
    } catch (error) {
      this.logger.error(`Error fetching media metadata: ${error.message}`);
      return `https://graph.facebook.com/${this.version}/${mediaId}/mock_file`;
    }
  }

  async downloadMedia(mediaUrl: string): Promise<Buffer> {
    try {
      this.logger.log(`Downloading media binary from: ${mediaUrl}`);
      if (mediaUrl.includes('mock_file')) {
        return Buffer.from('mock audio content');
      }
      const response = await fetch(mediaUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.token}`,
        },
      });
      if (!response.ok) {
        throw new Error(`Failed to download media: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      this.logger.error(`Error downloading media: ${error.message}`);
      return Buffer.from('fallback audio binary data');
    }
  }

  async sendInteractiveButtons(
    to: string,
    text: string,
    buttons: { id: string; title: string }[],
  ): Promise<boolean> {
    const url = `https://graph.facebook.com/${this.version}/${this.phoneNumberId}/messages`;
    this.logger.log(`[WhatsApp API] Sending interactive buttons to ${to}: "${text.substring(0, 60)}..."`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: { text },
            action: {
              buttons: buttons.map((btn) => ({
                type: 'reply',
                reply: {
                  id: btn.id,
                  title: btn.title,
                },
              })),
            },
          },
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        this.logger.error(`WhatsApp Interactive API Error: ${JSON.stringify(data)}`);
        // Fallback to standard text message if interactive fails
        return this.sendMessage(to, text);
      }
      return true;
    } catch (error) {
      this.logger.error(`Failed to send interactive WhatsApp message: ${error.message}`);
      // Fallback to standard text message if interactive fails
      return this.sendMessage(to, text);
    }
  }

  async uploadMedia(buffer: Buffer, filename: string, mimeType: string): Promise<string | null> {
    const url = `https://graph.facebook.com/${this.version}/${this.phoneNumberId}/media`;
    
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
    formData.append('file', blob, filename);
    formData.append('type', mimeType);
    formData.append('messaging_product', 'whatsapp');

    try {
      this.logger.log(`Uploading media "${filename}" (${buffer.length} bytes) to WhatsApp...`);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
        },
        body: formData,
      });

      const data = await response.json() as any;
      if (!response.ok) {
        this.logger.error(`WhatsApp Media Upload Error: ${JSON.stringify(data)}`);
        return null;
      }
      this.logger.log(`WhatsApp media uploaded successfully. Media ID: ${data.id}`);
      return data.id;
    } catch (error) {
      this.logger.error(`Failed to upload WhatsApp media: ${error.message}`);
      return null;
    }
  }

  async sendAudio(to: string, mediaId: string): Promise<boolean> {
    const url = `https://graph.facebook.com/${this.version}/${this.phoneNumberId}/messages`;
    
    this.logger.log(`[WhatsApp API] Sending audio to ${to} (Media ID: ${mediaId})`);
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'audio',
          audio: { id: mediaId },
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        this.logger.error(`WhatsApp Send Audio Error: ${JSON.stringify(data)}`);
        return false;
      }
      this.logger.log(`WhatsApp audio sent successfully.`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send WhatsApp audio: ${error.message}`);
      return false;
    }
  }
}
