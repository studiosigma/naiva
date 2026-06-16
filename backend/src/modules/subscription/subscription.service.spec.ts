import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionService } from './subscription.service';
import { PrismaService } from '../../database/prisma.service';
import { ConfigService } from '@nestjs/config';

describe('SubscriptionService', () => {
  let service: SubscriptionService;
  let prisma: PrismaService;
  let config: ConfigService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    usageLog: {
      create: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'IPAYMU_VA') return 'va-123';
      if (key === 'IPAYMU_API_KEY') return 'key-123';
      if (key === 'IPAYMU_SANDBOX') return 'true';
      if (key === 'IPAYMU_BYPASS_SIGNATURE') return 'true';
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<SubscriptionService>(SubscriptionService);
    prisma = module.get<PrismaService>(PrismaService);
    config = module.get<ConfigService>(ConfigService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createCheckoutLink', () => {
    it('should create payment link successfully', async () => {
      const mockUser = { id: 'user-123', email: 'test@myva.ai', name: 'Test User', waNumber: '123' };
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      // Mock global fetch
      const mockFetchResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          Status: 200,
          Data: { Url: 'https://checkout.ipaymu.com/pay' },
        }),
      };
      global.fetch = jest.fn().mockResolvedValue(mockFetchResponse);

      const url = await service.createCheckoutLink('user-123', 'basic');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'user-123' } });
      expect(global.fetch).toHaveBeenCalled();
      expect(url).toBe('https://checkout.ipaymu.com/pay');
    });

    it('should fallback to first user if userId is not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      const mockUser = { id: 'fallback-123', email: 'fallback@myva.ai', name: 'Fallback User', waNumber: '456' };
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);

      const mockFetchResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          Status: 200,
          Data: { Url: 'https://checkout.ipaymu.com/pay' },
        }),
      };
      global.fetch = jest.fn().mockResolvedValue(mockFetchResponse);

      const url = await service.createCheckoutLink('non-existent', 'pro');

      expect(prisma.user.findFirst).toHaveBeenCalled();
      expect(url).toBe('https://checkout.ipaymu.com/pay');
    });
  });

  describe('handleWebhook', () => {
    it('should update user plan on success', async () => {
      const body = {
        referenceId: 'user-123:pro:timestamp',
        status_code: 1,
        status: 'berhasil',
      };

      const result = await service.handleWebhook(body, 'sig-123');

      expect(result).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { plan: 'pro' },
      });
      expect(prisma.usageLog.create).toHaveBeenCalled();
    });
  });
});
