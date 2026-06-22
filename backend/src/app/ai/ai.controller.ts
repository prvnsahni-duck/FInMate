import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiService } from './ai.service';
import { IsString, IsOptional, IsNotEmpty } from 'class-validator';
import { SuccessResponse } from '../common/response.util';

export class AiProxyDto {
  @IsString()
  @IsNotEmpty()
  prompt!: string;

  @IsString()
  @IsOptional()
  systemInstruction?: string;

  @IsString()
  @IsOptional()
  model?: string;
}

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('proxy')
  async callOpenAiProxy(@Body() dto: AiProxyDto) {
    const result = await this.aiService.callOpenAiProxy(
      dto.prompt,
      dto.systemInstruction,
      dto.model
    );
    return new SuccessResponse('AI response generated successfully', result);
  }
}
