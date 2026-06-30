import { Controller, Get, Patch, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { UpdatePayoutDto } from './dto/update-payout.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { SetFlagDto } from './dto/set-flag.dto';
import { UpdatePromptDto } from './dto/update-prompt.dto';
import { SendBroadcastDto } from './dto/send-broadcast.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // Payout Endpoints
  @Get('payout-requests')
  @ApiOperation({ summary: 'Dapatkan semua permintaan penarikan' })
  async getAllPayoutRequests() {
    return this.adminService.getAllPayoutRequests();
  }

  @Patch('payout-requests/:id')
  @ApiOperation({ summary: 'Perbarui status permintaan penarikan' })
  async updatePayoutStatus(@Param('id') id: string, @Body() dto: UpdatePayoutDto) {
    return this.adminService.updatePayoutStatus(id, dto);
  }

  // Dashboard KPI Endpoints
  @Get('dashboard-stats')
  @ApiOperation({ summary: 'Dapatkan statistik ringkasan dashboard pendiri' })
  async getDashboardStats() {
    return this.adminService.getDashboardStats();
  }

  @Get('platform-activity')
  @ApiOperation({ summary: 'Dapatkan metrik aktivitas volume platform hari ini' })
  async getPlatformActivity() {
    return this.adminService.getPlatformActivity();
  }

  @Get('recent-events')
  @ApiOperation({ summary: 'Dapatkan timeline kejadian terbaru (registrasi, upgrade, payout)' })
  async getRecentEvents() {
    return this.adminService.getRecentEvents();
  }

  // Users Management Endpoints
  @Get('users')
  @ApiOperation({ summary: 'Dapatkan daftar pengguna secara paginasi dan filter' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'plan', required: false })
  @ApiQuery({ name: 'status', required: false })
  async getUsersList(
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('plan') plan?: string,
    @Query('status') status?: string,
  ) {
    const pNum = page ? Number(page) : 1;
    const lNum = limit ? Number(limit) : 10;
    return this.adminService.getUsersList(search, pNum, lNum, plan, status);
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Dapatkan detail lengkap pengguna beserta aktivitas dan integrasinya' })
  async getUserDetails(@Param('id') id: string) {
    return this.adminService.getUserDetails(id);
  }

  @Patch('users/:id/status')
  @ApiOperation({ summary: 'Suspend atau aktifkan kembali pengguna' })
  async updateUserStatus(@Param('id') id: string, @Body() dto: UpdateUserStatusDto) {
    return this.adminService.updateUserStatus(id, dto);
  }

  @Post('users/:id/reset-trial')
  @ApiOperation({ summary: 'Reset kuota/plan trial pengguna kembali ke free' })
  async resetUserTrial(@Param('id') id: string) {
    return this.adminService.resetUserTrial(id);
  }

  @Post('users/:id/impersonate')
  @ApiOperation({ summary: 'Dapatkan token akses impersonasi atas nama pengguna tertentu' })
  async impersonateUser(@Param('id') id: string) {
    return this.adminService.impersonateUser(id);
  }

  // AI Cost Center Endpoints
  @Get('ai-costs')
  @ApiOperation({ summary: 'Dapatkan ringkasan biaya AI dan daftar pengguna termahal' })
  async getAiCostCenter() {
    return this.adminService.getAiCostCenter();
  }

  // WhatsApp Monitor Endpoints
  @Get('whatsapp-monitor')
  @ApiOperation({ summary: 'Dapatkan metrik monitor Cloud API WhatsApp dan webhook' })
  async getWhatsAppMonitor() {
    return this.adminService.getWhatsAppMonitor();
  }

  // Queue Monitor Endpoints
  @Get('queue-stats')
  @ApiOperation({ summary: 'Dapatkan detail metrik antrean BullMQ (AI, email, file, pengingat)' })
  async getQueueStats() {
    return this.adminService.getQueueStats();
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Dapatkan metrik observabilitas sistem, CPU, memori, dan kegagalan job antrean' })
  async getAnalytics() {
    return this.adminService.getAnalytics();
  }

  // Feature Flags Endpoints
  @Get('feature-flags')
  @ApiOperation({ summary: 'Dapatkan status feature flags sistem' })
  async getFeatureFlags() {
    return this.adminService.getFeatureFlags();
  }

  @Post('feature-flags')
  @ApiOperation({ summary: 'Simpan / ubah toggle feature flag sistem' })
  async setFeatureFlag(@Body() dto: SetFlagDto) {
    return this.adminService.setFeatureFlag(dto);
  }

  // Prompt Studio Endpoints
  @Get('prompts')
  @ApiOperation({ summary: 'Dapatkan semua konfigurasi prompt perilaku AI' })
  async getPrompts() {
    return this.adminService.getPrompts();
  }

  @Post('prompts')
  @ApiOperation({ summary: 'Simpan / perbarui template prompt sistem' })
  async updatePrompt(@Body() dto: UpdatePromptDto) {
    return this.adminService.updatePrompt(dto);
  }

  // Broadcast Center Endpoint
  @Post('broadcast')
  @ApiOperation({ summary: 'Kirim notifikasi massal lewat WhatsApp atau Email' })
  async sendBroadcast(@Body() dto: SendBroadcastDto) {
    return this.adminService.sendBroadcast(dto);
  }

  // System Health Endpoint
  @Get('system-health')
  @ApiOperation({ summary: 'Periksa status kesehatan database, Redis, API, WhatsApp API, dll.' })
  async getSystemHealth() {
    return this.adminService.getSystemHealth();
  }
}
