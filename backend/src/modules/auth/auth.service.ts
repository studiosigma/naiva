import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import * as argon2 from 'argon2';
import { User } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async signup(dto: SignupDto) {
    const existingUser = await this.usersService.findOneByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('A user with this email address already exists.');
    }

    const passwordHash = await argon2.hash(dto.password);

    // Check if registered via referral code
    let referredById: string | null = null;
    if (dto.referralCode) {
      const referrer = await this.usersService.findOneByReferralCode(dto.referralCode);
      if (referrer) {
        referredById = referrer.id;
      }
    }

    // Generate unique referral code for the new user
    const baseName = dto.name || dto.email.split('@')[0];
    const generatedReferralCode = await this.generateUniqueReferralCode(baseName);
    
    const user = await this.usersService.create({
      email: dto.email,
      passwordHash,
      name: dto.name,
      waNumber: dto.waNumber,
      referralCode: generatedReferralCode,
      referredBy: referredById ? { connect: { id: referredById } } : undefined,
    });

    const tokens = await this.generateTokens(user);
    return {
      success: true,
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  private async generateUniqueReferralCode(baseName: string): Promise<string> {
    const cleanName = baseName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().substring(0, 10);
    let attempts = 0;
    while (attempts < 10) {
      const randomPart = Math.random().toString(36).substring(2, 6);
      const code = `${cleanName}${randomPart}`;
      const existing = await this.usersService.findOneByReferralCode(code);
      if (!existing) {
        return code;
      }
      attempts++;
    }
    return Math.random().toString(36).substring(2, 10);
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findOneByEmail(dto.email);
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const isPasswordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    // Auto-promote admin email on every login (handles pre-existing users)
    const updatedUser = await this.ensureAdminRole(user);

    const tokens = await this.generateTokens(updatedUser);
    return {
      success: true,
      user: this.sanitizeUser(updatedUser),
      ...tokens,
    };
  }

  async devLogin() {
    let user = await this.usersService.findOneByEmail('muis@myva.ai');
    if (!user) {
      user = await this.usersService.create({
        email: 'muis@myva.ai',
        name: 'Muis',
        waNumber: '6281234567890',
        plan: 'free',
        status: 'active',
      });
    }
    const tokens = await this.generateTokens(user);
    return {
      success: true,
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  async googleLogin(profile: any) {
    let user = await this.usersService.findOneByGoogleId(profile.id);

    if (!user) {
      user = await this.usersService.findOneByEmail(profile.emails[0].value);
      if (user) {
        // Link google account to existing user
        user = await this.usersService.update(user.id, { googleId: profile.id });
      } else {
        // Provision new user
        user = await this.usersService.create({
          email: profile.emails[0].value,
          googleId: profile.id,
          name: profile.name ? `${profile.name.givenName || ''} ${profile.name.familyName || ''}`.trim() : 'Google User',
          avatar: profile.photos?.[0]?.value,
          status: 'active',
        });
      }
    }

    // Auto-promote admin email on every login (handles pre-existing users)
    user = await this.ensureAdminRole(user);

    const tokens = await this.generateTokens(user);
    return {
      success: true,
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  async refreshToken(token: string) {
    try {
      const payload = this.jwtService.verify(token);
      const user = await this.usersService.findOneById(payload.sub);
      if (!user) {
        throw new UnauthorizedException('User not found.');
      }
      const tokens = await this.generateTokens(user);
      return {
        success: true,
        ...tokens,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }
  }

  private async ensureAdminRole(user: User): Promise<User> {
    if (user.email === 'studio6ma@gmail.com' && user.role !== 'admin') {
      return this.usersService.update(user.id, { role: 'admin' });
    }
    return user;
  }

  private async generateTokens(user: User) {
    const payload = { email: user.email, sub: user.id };
    const accessToken = this.jwtService.sign(payload, { expiresIn: '1h' });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });
    return {
      accessToken,
      refreshToken,
    };
  }

  private sanitizeUser(user: User) {
    const { passwordHash, ...sanitized } = user;
    return sanitized;
  }
}
