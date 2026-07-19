import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AiController, AiProxyDto } from './ai.controller';
import { AiService } from './ai.service';
import { UsersService } from '../users/users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SuccessResponse } from '../common/response.util';

describe('AiController', () => {
  let controller: AiController;
  let service: jest.Mocked<AiService>;
  let usersService: { findById: jest.Mock };

  const req = { user: { id: 'user-1' } } as any;

  beforeEach(async () => {
    const mockAiService = {
      callOpenAiProxy: jest.fn(),
    };
    const mockUsersService = {
      findById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiController],
      providers: [
        { provide: AiService, useValue: mockAiService },
        { provide: UsersService, useValue: mockUsersService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AiController>(AiController);
    service = module.get(AiService);
    usersService = module.get(UsersService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call callOpenAiProxy on the service with correctly mapped arguments when the user has opted in', async () => {
    const dto: AiProxyDto = {
      prompt: 'Hello AI',
      systemInstruction: 'Be nice',
      model: 'gpt-4',
    };

    usersService.findById.mockResolvedValueOnce({
      id: 'user-1',
      aiOptIn: true,
    });
    service.callOpenAiProxy.mockResolvedValueOnce({ text: 'Response' });

    const result = await controller.callOpenAiProxy(dto, req);
    expect(result).toEqual(
      new SuccessResponse('AI response generated successfully', {
        text: 'Response',
      }),
    );
    expect(service.callOpenAiProxy).toHaveBeenCalledWith(
      'Hello AI',
      'Be nice',
      'gpt-4',
    );
  });

  it('should reject the request when the user has not opted in (AI-001)', async () => {
    usersService.findById.mockResolvedValueOnce({
      id: 'user-1',
      aiOptIn: false,
    });

    await expect(
      controller.callOpenAiProxy({ prompt: 'Hello AI' } as AiProxyDto, req),
    ).rejects.toThrow(ForbiddenException);
    expect(service.callOpenAiProxy).not.toHaveBeenCalled();
  });

  it('should reject the request when the user record cannot be loaded', async () => {
    usersService.findById.mockResolvedValueOnce(null);

    await expect(
      controller.callOpenAiProxy({ prompt: 'Hello AI' } as AiProxyDto, req),
    ).rejects.toThrow(ForbiddenException);
    expect(service.callOpenAiProxy).not.toHaveBeenCalled();
  });
});
