import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { UpdatePersonaDto } from './dto/update-persona.dto';
import { UpdateIntegrationsDto, UpdateBriefingDto } from './dto/update-settings.dto';
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
