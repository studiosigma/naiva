import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { UpdatePersonaDto } from './dto/update-persona.dto';
import { UpdateIntegrationsDto, UpdateBriefingDto } from './dto/update-settings.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('User Profile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Retrieve user profile settings' })
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully.' })
  async getProfile(@GetUser('id') userId: string) {
    const user = await this.usersService.findOneById(userId);
    const { passwordHash, ...sanitized } = user;
    return {
      success: true,
      user: sanitized,
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
