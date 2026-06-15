import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';

describe('SubscriptionController', () => {
  let controller: SubscriptionController;
  let service: SubscriptionService;

  const mockSubscriptionService = {
    createCheckoutLink: jest.fn(),
    handleWebhook: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionController],
      providers: [
        {
          provide: SubscriptionService,
          useValue: mockSubscriptionService,
        },
      ],
    }).compile();

    controller = module.get<SubscriptionController>(SubscriptionController);
    service = module.get<SubscriptionService>(SubscriptionService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createCheckout', () => {
    it('should return checkout url', async () => {
      const dto: CreateCheckoutDto = { plan: 'basic', userId: 'user-123' };
      mockSubscriptionService.createCheckoutLink.mockResolvedValue('https://checkout.ipaymu.com/pay');

      const result = await controller.createCheckout(dto, 'Bearer token-123');

      expect(service.createCheckoutLink).toHaveBeenCalledWith('user-123', 'basic');
      expect(result).toEqual({
        success: true,
        url: 'https://checkout.ipaymu.com/pay',
      });
    });

    it('should decode bearer token if present', async () => {
      const dto: CreateCheckoutDto = { plan: 'pro' };
      // Encode dummy payload with id: "token-user"
      const payload = Buffer.from(JSON.stringify({ id: 'token-user' })).toString('base64');
      const token = `header.${payload}.signature`;
      mockSubscriptionService.createCheckoutLink.mockResolvedValue('https://checkout.ipaymu.com/pay');

      const result = await controller.createCheckout(dto, `Bearer ${token}`);

      expect(service.createCheckoutLink).toHaveBeenCalledWith('token-user', 'pro');
      expect(result).toEqual({
        success: true,
        url: 'https://checkout.ipaymu.com/pay',
      });
    });
  });

  describe('handleWebhook', () => {
    it('should process webhook and return status', async () => {
      const body = { referenceId: 'user-123:basic', status_code: 1 };
      mockSubscriptionService.handleWebhook.mockResolvedValue(true);

      const result = await controller.handleWebhook(body, 'sig-123');

      expect(service.handleWebhook).toHaveBeenCalledWith(body, 'sig-123');
      expect(result).toEqual({
        success: true,
        processed: true,
      });
    });
  });
});
