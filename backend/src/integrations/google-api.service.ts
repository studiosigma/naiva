import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { encrypt, decrypt } from '../common/utils/crypto-utils';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class GoogleApiService {
  private readonly logger = new Logger(GoogleApiService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly callbackUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    this.clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
    
    // Custom redirect URI for connection
    const baseUrl = this.configService.get<string>('API_BASE_URL') || 'http://localhost:3000/api';
    this.callbackUrl = `${baseUrl}/auth/google/callback/connect`;
  }

  getOAuthClient() {
    return new google.auth.OAuth2(
      this.clientId,
      this.clientSecret,
      this.callbackUrl,
    );
  }

  getConnectionUrl(userId: string): string {
    const oauth2Client = this.getOAuthClient();
    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/gmail.modify',
    ];

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: scopes,
      state: userId,
    });
  }

  async getClientForUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.googleAccessToken) {
      throw new Error('Google account not connected for this user.');
    }

    const oauth2Client = this.getOAuthClient();
    const accessToken = decrypt(user.googleAccessToken);
    const refreshToken = user.googleRefreshToken ? decrypt(user.googleRefreshToken) : undefined;

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    // Listen for automatic token refresh event
    oauth2Client.on('tokens', async (tokens) => {
      if (tokens.access_token) {
        await this.prisma.user.update({
          where: { id: userId },
          data: {
            googleAccessToken: encrypt(tokens.access_token),
            ...(tokens.refresh_token ? { googleRefreshToken: encrypt(tokens.refresh_token) } : {}),
          },
        });
        this.logger.log(`Google access token automatically refreshed and saved for user: ${userId}`);
      }
    });

    return oauth2Client;
  }
}
