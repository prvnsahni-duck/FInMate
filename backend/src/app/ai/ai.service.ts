import { Injectable, BadRequestException, GatewayTimeoutException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class AiService {
  private readonly apiKey: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('OPENAI_API_KEY');
  }

  /**
   * Redacts any UUID patterns (typical database keys like user_id, group_id, etc.)
   * from the text inputs before they are sent to external services.
   */
  redactUuids(text: string): string {
    if (!text) return '';
    const uuidPattern = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;
    return text.replace(uuidPattern, '[REDACTED_ID]');
  }

  /**
   * Calls the OpenAI Chat Completions endpoint ephemerally without storing plaintext in local DB.
   */
  async callOpenAiProxy(
    prompt: string,
    systemInstruction?: string,
    model = 'gpt-4'
  ): Promise<{ text: string }> {
    if (!this.apiKey) {
      throw new BadRequestException({
        errorCode: 'AI_CONFIG_ERROR',
        message: 'OpenAI API is not configured on the server. Please set OPENAI_API_KEY.',
      });
    }

    if (!prompt || prompt.trim() === '') {
      throw new BadRequestException('Prompt must not be empty');
    }

    // Sweep input for internal database keys (UUIDs)
    const sanitizedPrompt = this.redactUuids(prompt);
    const sanitizedSystemInstruction = systemInstruction ? this.redactUuids(systemInstruction) : undefined;

    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (sanitizedSystemInstruction) {
      messages.push({ role: 'system', content: sanitizedSystemInstruction });
    }
    messages.push({ role: 'user', content: sanitizedPrompt });

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: model,
          messages: messages,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          timeout: 10000,
        }
      );

      const reply = response.data?.choices?.[0]?.message?.content;
      if (!reply) {
        throw new ServiceUnavailableException('Failed to retrieve response from OpenAI');
      }

      return { text: reply };
    } catch (error: any) {
      if (error.response) {
        const status = error.response.status;
        const msg = error.response.data?.error?.message || 'OpenAI API Error';
        throw new BadRequestException({
          errorCode: 'AI_PROVIDER_ERROR',
          message: `OpenAI API returned status ${status}: ${msg}`,
        });
      } else if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        throw new GatewayTimeoutException({
          errorCode: 'SYS_TIMEOUT',
          message: 'Connection to OpenAI timed out. Please try again.',
        });
      } else {
        throw new ServiceUnavailableException({
          errorCode: 'SYS_SERVICE_UNAVAILABLE',
          message: `Failed to contact OpenAI: ${error.message}`,
        });
      }
    }
  }
}
