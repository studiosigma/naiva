import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { S3Service } from './s3.service';
import { WhatsAppApiService } from './whatsapp-api.service';
import { GoogleApiService } from './google-api.service';

@Module({
  imports: [ConfigModule],
  providers: [S3Service, WhatsAppApiService, GoogleApiService],
  exports: [S3Service, WhatsAppApiService, GoogleApiService],
})
export class IntegrationsModule {}
