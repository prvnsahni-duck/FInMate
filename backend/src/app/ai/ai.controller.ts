import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiService } from './ai.service';
import { UsersService } from '../users/users.service';
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
  constructor(
    private readonly aiService: AiService,
    private readonly usersService: UsersService,
  ) {}

  @Post('proxy')
  async callOpenAiProxy(
    @Body() dto: AiProxyDto,
    @Req() req: Request & { user: { id: string } },
  ) {
    // AI opt-in is APPROVED as a server-enforced consent gate: no user data
    // may reach an AI provider without it, regardless of client state.
    const user = await this.usersService.findById(req.user.id);
    if (!user?.aiOptIn) {
      throw new ForbiddenException({
        errorCode: 'AI_OPT_IN_REQUIRED',
        message:
          'AI features require opt-in. Enable them in settings to continue.',
      });
    }

    const result = await this.aiService.callOpenAiProxy(
      dto.prompt,
      dto.systemInstruction,
      dto.model,
    );
    return new SuccessResponse('AI response generated successfully', result);
  }
}
