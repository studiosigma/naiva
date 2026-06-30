import { Controller, Post, Body, Get, UseGuards, Req, Res, Query, HttpException, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { GoogleApiService } from '../../integrations/google-api.service';
import { PrismaService } from '../../database/prisma.service';
import { UsersService } from '../users/users.service';
import * as jwt from 'jsonwebtoken';
import { encrypt } from '../../common/utils/crypto-utils';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly googleApiService: GoogleApiService,
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  @Post('signup')
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiResponse({ status: 201, description: 'User successfully created.' })
  @ApiResponse({ status: 400, description: 'Invalid payload.' })
  @ApiResponse({ status: 499, description: 'Email address already in use.' })
  async signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Successfully logged in.' })
  @ApiResponse({ status: 401, description: 'Invalid email or password.' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('dev-login')
  @ApiOperation({ summary: 'Auto-login or register a default dev user' })
  async devLogin() {
    return this.authService.devLogin();
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh JWT Access Token using Refresh Token' })
  @ApiResponse({ status: 200, description: 'Tokens successfully refreshed.' })
  @ApiResponse({ status: 401, description: 'Invalid refresh token.' })
  async refresh(@Body() dto: RefreshDto) {
    return this.authService.refreshToken(dto.refreshToken);
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Initiate Google OAuth flow' })
  async googleAuth(@Req() req) {}

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google OAuth callback handler' })
  async googleAuthRedirect(@Req() req, @Res() res) {
    const data = await this.authService.googleLogin(req.user);
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
    return res.redirect(`${frontendUrl}/?accessToken=${data.accessToken}&refreshToken=${data.refreshToken}`);
  }

  @Get('google/connect')
  @ApiOperation({ summary: 'Redirect to Google OAuth connection page' })
  async googleConnect(@Query('token') token: string, @Res() res) {
    if (!token) {
      throw new HttpException('Token is required', HttpStatus.BAD_REQUEST);
    }
    try {
      const secret = this.configService.get<string>('JWT_SECRET') || 'default-jwt-secret-key-12345';
      const payload: any = jwt.verify(token, secret);
      const userId = payload.sub;
      const url = this.googleApiService.getConnectionUrl(userId);
      return res.redirect(url);
    } catch (err) {
      throw new HttpException('Invalid or expired authentication token', HttpStatus.UNAUTHORIZED);
    }
  }

  @Get('google/callback/connect')
  @ApiOperation({ summary: 'Callback handler for connecting Google account' })
  async googleConnectCallback(
    @Query('code') code: string,
    @Query('state') userId: string,
    @Res() res,
  ) {
    if (!code || !userId) {
      throw new HttpException('Code and state (userId) are required', HttpStatus.BAD_REQUEST);
    }

    try {
      const oauth2Client = this.googleApiService.getOAuthClient();
      const { tokens } = await oauth2Client.getToken(code);

      if (!tokens.access_token) {
        throw new HttpException('Failed to obtain Google access token', HttpStatus.BAD_REQUEST);
      }

      const encryptedAccessToken = encrypt(tokens.access_token);
      const encryptedRefreshToken = tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined;

      await this.prisma.user.update({
        where: { id: userId },
        data: {
          googleAccessToken: encryptedAccessToken,
          ...(encryptedRefreshToken ? { googleRefreshToken: encryptedRefreshToken } : {}),
          gcalConnected: true,
          gdriveConnected: true,
          gmailConnected: true,
          contactsSyncEnabled: true,
        },
      });

      await this.usersService.invalidateCache(userId);

      const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
      return res.redirect(`${frontendUrl}/index.html#settings?google_connect=success`);
    } catch (error) {
      console.error('Google connect callback error:', error);
      const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
      return res.redirect(`${frontendUrl}/index.html#settings?google_connect=error`);
    }
  }
}
