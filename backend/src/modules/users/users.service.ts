import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma, User } from '@prisma/client';
import { normalizePhoneNumber } from '../../common/utils/phone-utils';
import { CacheService } from '../cache/cache.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  private getUserCacheKey(id: string): string {
    return `user:id:${id}`;
  }

  private getUserWaCacheKey(waNumber: string): string {
    return `user:wa:${normalizePhoneNumber(waNumber)}`;
  }

  async findOneByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findOneById(id: string): Promise<User | null> {
    const cacheKey = this.getUserCacheKey(id);
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (user) {
      await this.cache.set(cacheKey, JSON.stringify(user), 3600); // 1 hour TTL
    }
    return user;
  }

  async findOneByGoogleId(googleId: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { googleId } });
  }

  async findOneByWaNumber(waNumber: string): Promise<User | null> {
    const normalized = normalizePhoneNumber(waNumber);
    const cacheKey = this.getUserWaCacheKey(normalized);
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
    const user = await this.prisma.user.findUnique({ where: { waNumber: normalized } });
    if (user) {
      await this.cache.set(cacheKey, JSON.stringify(user), 3600); // 1 hour TTL
    }
    return user;
  }

  async findOneByReferralCode(referralCode: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { referralCode } });
  }

  async create(data: Prisma.UserCreateInput): Promise<User> {
    const existing = await this.findOneByEmail(data.email);
    if (existing) {
      throw new ConflictException('Email address already in use.');
    }
    if (data.waNumber) {
      data.waNumber = normalizePhoneNumber(data.waNumber);
      const existingWa = await this.findOneByWaNumber(data.waNumber);
      if (existingWa) {
        throw new ConflictException('WhatsApp number already in use.');
      }
    }
    if (data.email === 'studio6ma@gmail.com') {
      data.role = 'admin';
    }
    return this.prisma.user.create({ data });
  }

  async update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    try {
      if (data.waNumber && typeof data.waNumber === 'string') {
        data.waNumber = normalizePhoneNumber(data.waNumber);
      }

      // Fetch old user to get the old waNumber for cache invalidation
      const oldUser = await this.prisma.user.findUnique({ where: { id } });
      const oldWa = oldUser?.waNumber;

      const updated = await this.prisma.user.update({
        where: { id },
        data,
      });

      // Invalidate cache keys
      await this.cache.del(this.getUserCacheKey(id));
      if (oldWa) {
        await this.cache.del(this.getUserWaCacheKey(oldWa));
      }
      if (updated.waNumber) {
        await this.cache.del(this.getUserWaCacheKey(updated.waNumber));
      }

      return updated;
    } catch (error) {
      throw new NotFoundException(`User with ID ${id} not found.`);
    }
  }

  async invalidateCache(id: string): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({ where: { id } });
      if (user) {
        await this.cache.del(this.getUserCacheKey(id));
        if (user.waNumber) {
          await this.cache.del(this.getUserWaCacheKey(user.waNumber));
        }
      }
    } catch (err) {
      // Ignore
    }
  }
}

