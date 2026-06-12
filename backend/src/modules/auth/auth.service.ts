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
    
    const user = await this.usersService.create({
      email: dto.email,
      passwordHash,
      name: dto.name,
      waNumber: dto.waNumber,
    });

    const tokens = await this.generateTokens(user);
    return {
      success: true,
      user: this.sanitizeUser(user),
      ...tokens,
    };
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
          name: `${profile.name.givenName} ${profile.name.familyName}`,
          avatar: profile.photos[0]?.value,
          status: 'active',
        });
      }
    }

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
