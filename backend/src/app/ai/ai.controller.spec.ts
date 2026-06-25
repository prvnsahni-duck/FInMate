import { Test, TestingModule } from '@nestjs/testing';
import { AiController, AiProxyDto } from './ai.controller';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SuccessResponse } from '../common/response.util';

describe('AiController', () => {
  let controller: AiController;
  let service: jest.Mocked<AiService>;

  beforeEach(async () => {
    const mockAiService = {
      callOpenAiProxy: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiController],
      providers: [{ provide: AiService, useValue: mockAiService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AiController>(AiController);
    service = module.get(AiService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call callOpenAiProxy on the service with correctly mapped arguments', async () => {
    const dto: AiProxyDto = {
      prompt: 'Hello AI',
      systemInstruction: 'Be nice',
      model: 'gpt-4',
    };

    service.callOpenAiProxy.mockResolvedValueOnce({ text: 'Response' });

    const result = await controller.callOpenAiProxy(dto);
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
});
