import { Test, TestingModule } from '@nestjs/testing';
import { AiService } from './ai.service';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, GatewayTimeoutException, ServiceUnavailableException } from '@nestjs/common';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('AiService', () => {
  let service: AiService;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
    configService = module.get(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('redactUuids', () => {
    it('should replace single and multiple UUIDs with [REDACTED_ID]', () => {
      const input = 'User 12345678-abcd-1234-abcd-1234567890ab belongs to group 87654321-4321-4321-4321-1234567890cd.';
      const expected = 'User [REDACTED_ID] belongs to group [REDACTED_ID].';
      expect(service.redactUuids(input)).toBe(expected);
    });

    it('should leave normal text and other IDs unmodified', () => {
      const input = 'My expense id is short-id-123 and currency is USD.';
      expect(service.redactUuids(input)).toBe(input);
    });

    it('should return empty string if input is empty', () => {
      expect(service.redactUuids('')).toBe('');
    });
  });

  describe('callOpenAiProxy', () => {
    it('should throw BadRequestException if OPENAI_API_KEY is missing', async () => {
      // Setup ConfigService to return undefined API key
      configService.get.mockReturnValue(undefined);
      // Re-instantiate service to read the new config value
      const testService = new AiService(configService);

      await expect(testService.callOpenAiProxy('hello')).rejects.toThrow(BadRequestException);
      try {
        await testService.callOpenAiProxy('hello');
      } catch (err: any) {
        expect(err.getResponse().errorCode).toBe('AI_CONFIG_ERROR');
      }
    });

    it('should throw BadRequestException if prompt is empty', async () => {
      configService.get.mockReturnValue('sk-key123');
      const testService = new AiService(configService);

      await expect(testService.callOpenAiProxy('')).rejects.toThrow(BadRequestException);
      await expect(testService.callOpenAiProxy('   ')).rejects.toThrow(BadRequestException);
    });

    it('should call OpenAI API, redact inputs, and return content reply successfully', async () => {
      configService.get.mockReturnValue('sk-key123');
      const testService = new AiService(configService);

      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                content: 'Here is your receipt category: Food.',
              },
            },
          ],
        },
      };
      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      const prompt = 'Analyze group 12345678-abcd-1234-abcd-1234567890ab receipt.';
      const systemInstruction = 'You are a bot helper for user 87654321-4321-4321-4321-1234567890cd.';

      const result = await testService.callOpenAiProxy(prompt, systemInstruction, 'gpt-4');

      expect(result.text).toBe('Here is your receipt category: Food.');
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4',
          messages: [
            { role: 'system', content: 'You are a bot helper for user [REDACTED_ID].' },
            { role: 'user', content: 'Analyze group [REDACTED_ID] receipt.' },
          ],
        },
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer sk-key123',
          }),
        })
      );
    });

    it('should handle OpenAI API errors and map to BadRequestException', async () => {
      configService.get.mockReturnValue('sk-key123');
      const testService = new AiService(configService);

      const mockErrorResponse = {
        response: {
          status: 401,
          data: {
            error: {
              message: 'Invalid API key provided.',
            },
          },
        },
      };
      mockedAxios.post.mockRejectedValueOnce(mockErrorResponse);

      try {
        await testService.callOpenAiProxy('valid prompt');
        fail('Should have thrown BadRequestException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(BadRequestException);
        expect(err.getResponse().errorCode).toBe('AI_PROVIDER_ERROR');
        expect(err.getResponse().message).toContain('401');
      }
    });

    it('should handle OpenAI API timeout and map to GatewayTimeoutException', async () => {
      configService.get.mockReturnValue('sk-key123');
      const testService = new AiService(configService);

      const mockTimeoutError = new Error('timeout of 10000ms exceeded');
      mockedAxios.post.mockRejectedValueOnce(mockTimeoutError);

      try {
        await testService.callOpenAiProxy('valid prompt');
        fail('Should have thrown GatewayTimeoutException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(GatewayTimeoutException);
        expect(err.getResponse().errorCode).toBe('SYS_TIMEOUT');
        expect(err.getResponse().message).toContain('timed out');
      }
    });

    it('should handle OpenAI API network failure and map to ServiceUnavailableException', async () => {
      configService.get.mockReturnValue('sk-key123');
      const testService = new AiService(configService);

      const mockNetworkError = new Error('Network Error');
      mockedAxios.post.mockRejectedValueOnce(mockNetworkError);

      try {
        await testService.callOpenAiProxy('valid prompt');
        fail('Should have thrown ServiceUnavailableException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(ServiceUnavailableException);
        expect(err.getResponse().errorCode).toBe('SYS_SERVICE_UNAVAILABLE');
        expect(err.getResponse().message).toContain('Network Error');
      }
    });
  });
});
