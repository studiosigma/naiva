import { Controller, Get, Patch, Post, Body, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { UpdatePersonaDto } from './dto/update-persona.dto';
import { UpdateIntegrationsDto, UpdateBriefingDto } from './dto/update-settings.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { normalizePhoneNumber } from '../../common/utils/phone-utils';
import { CacheService } from '../cache/cache.service';

@Controller('users')
@ApiTags('User Profile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly cache: CacheService,
  ) {}

  @Get('profile')
  @ApiOperation({ summary: 'Retrieve user profile settings' })
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully.' })
  async getProfile(@GetUser('id') userId: string) {
    let user = await this.usersService.findOneById(userId);
    if (!user.waVerified && !user.waVerificationCode) {
      const code = `MYVA-${Math.floor(1000 + Math.random() * 9000)}`;
      const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes TTL
      user = await this.usersService.update(userId, { 
        waVerificationCode: code,
        waVerificationExpires: expires
      });
    }
    const { passwordHash, ...sanitized } = user;
    return {
      success: true,
      user: sanitized,
    };
  }

  @Post('verification-code')
  @ApiOperation({ summary: 'Regenerate WhatsApp verification code' })
  @ApiResponse({ status: 200, description: 'New verification code generated successfully.' })
  async regenerateVerificationCode(@GetUser('id') userId: string) {
    const user = await this.usersService.findOneById(userId);
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
    if (user.waVerified) {
      throw new HttpException('WhatsApp number already verified', HttpStatus.BAD_REQUEST);
    }
    if (!user.waNumber) {
      throw new HttpException('WhatsApp number is not set', HttpStatus.BAD_REQUEST);
    }

    // Rate Limiting: max 3 requests per 5 minutes per user
    const rateLimitKey = `rate_limit:wa_verify_code:${userId}`;
    const requestCount = await this.cache.get(rateLimitKey);
    const count = requestCount ? parseInt(requestCount, 10) : 0;

    if (count >= 3) {
      throw new HttpException(
        'Batas permintaan verifikasi terlampaui. Silakan coba lagi dalam 5 menit.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (count === 0) {
      await this.cache.set(rateLimitKey, '1', 300); // 5 minutes TTL
    } else {
      await this.cache.incr(rateLimitKey);
    }

    const code = `MYVA-${Math.floor(1000 + Math.random() * 9000)}`;
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes TTL

    const updatedUser = await this.usersService.update(userId, {
      waVerificationCode: code,
      waVerificationExpires: expires,
    });

    return {
      success: true,
      message: 'Kode verifikasi baru berhasil dibuat.',
      verificationCode: code,
      expiresAt: expires,
    };
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update user name, phone number, or subscription plan' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully.' })
  async updateProfile(
    @GetUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    const updateData: any = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.waNumber !== undefined) updateData.waNumber = dto.waNumber;
    if (dto.plan !== undefined) updateData.plan = dto.plan;
    if (dto.avatar !== undefined) updateData.avatar = dto.avatar;
    if (dto.assistantName !== undefined) updateData.assistantName = dto.assistantName;
    if (dto.assistantEmoji !== undefined) updateData.assistantEmoji = dto.assistantEmoji;

    if (dto.waNumber !== undefined) {
      const current = await this.usersService.findOneById(userId);
      const normalizedNew = dto.waNumber ? normalizePhoneNumber(dto.waNumber) : '';
      const normalizedCurrent = current.waNumber ? normalizePhoneNumber(current.waNumber) : '';
      if (normalizedNew !== normalizedCurrent) {
        updateData.waVerified = false;
        const code = dto.waNumber ? `MYVA-${Math.floor(1000 + Math.random() * 9000)}` : null;
        const expires = dto.waNumber ? new Date(Date.now() + 15 * 60 * 1000) : null;
        updateData.waVerificationCode = code;
        updateData.waVerificationExpires = expires;
      }
    }

    const user = await this.usersService.update(userId, updateData);
    const { passwordHash, ...sanitized } = user;
    return {
      success: true,
      user: sanitized,
    };
  }

  @Patch('persona')
  @ApiOperation({ summary: 'Update assistant persona preference' })
  @ApiResponse({ status: 200, description: 'Persona updated successfully.' })
  async updatePersona(
    @GetUser('id') userId: string,
    @Body() dto: UpdatePersonaDto,
  ) {
    const user = await this.usersService.update(userId, { persona: dto.persona });
    const { passwordHash, ...sanitized } = user;
    return {
      success: true,
      user: sanitized,
    };
  }

  @Patch('integrations')
  @ApiOperation({ summary: 'Update Google integration preferences' })
  @ApiResponse({ status: 200, description: 'Integrations updated successfully.' })
  async updateIntegrations(
    @GetUser('id') userId: string,
    @Body() dto: UpdateIntegrationsDto,
  ) {
    const user = await this.usersService.update(userId, dto);
    const { passwordHash, ...sanitized } = user;
    return {
      success: true,
      user: sanitized,
    };
  }

  @Patch('briefing')
  @ApiOperation({ summary: 'Update Daily Briefing preferences' })
  @ApiResponse({ status: 200, description: 'Daily Briefing settings updated successfully.' })
  async updateBriefing(
    @GetUser('id') userId: string,
    @Body() dto: UpdateBriefingDto,
  ) {
    const user = await this.usersService.update(userId, {
      briefingEnabled: dto.briefingEnabled,
      briefingTime: dto.briefingTime,
      followupEnabled: dto.followupEnabled,
    });
    const { passwordHash, ...sanitized } = user;
    return {
      success: true,
      user: sanitized,
    };
  }
}
