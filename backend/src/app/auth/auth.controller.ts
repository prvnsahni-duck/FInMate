import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  Verify2FaDto,
} from '@finmate/data-models';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RequestWithUser } from '../common/interfaces/request-with-user.interface';
import { Request } from 'express';
import { SuccessResponse } from '../common/response.util';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    const result = await this.authService.register(
      registerDto.email,
      registerDto.password,
      registerDto.displayName,
    );
    return new SuccessResponse('User registered successfully', result);
  }

  @Post('login')
  async login(@Body() loginDto: LoginDto, @Req() req: Request) {
    const mfaCode = req.headers['x-mfa-code'] as string | undefined;
    const context = {
      ip:
        req.ip ||
        (req.headers['x-forwarded-for'] as string) ||
        req.socket.remoteAddress,
      userAgent: req.headers['user-agent'] as string,
    };
    const result = await this.authService.login(
      loginDto.email,
      loginDto.password,
      mfaCode,
      context,
    );
    return new SuccessResponse('Login successful', result);
  }

  @Post('refresh')
  async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    const result = await this.authService.refresh(refreshTokenDto.refreshToken);
    return new SuccessResponse('Token refreshed successfully', result);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Body() refreshTokenDto: RefreshTokenDto,
    @Req() req: RequestWithUser,
  ) {
    await this.authService.logout(refreshTokenDto.refreshToken, req.user.id);
    return new SuccessResponse('Logged out successfully', {});
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/enable')
  async enable2Fa(@Req() req: RequestWithUser) {
    const context = {
      ip:
        req.ip ||
        (req.headers['x-forwarded-for'] as string) ||
        req.socket.remoteAddress,
      userAgent: req.headers['user-agent'] as string,
    };
    const result = await this.authService.enable2Fa(req.user, context);
    return new SuccessResponse('2FA setup initiated', result);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/verify')
  async verify2Fa(
    @Body() verify2FaDto: Verify2FaDto,
    @Req() req: RequestWithUser,
  ) {
    const context = {
      ip:
        req.ip ||
        (req.headers['x-forwarded-for'] as string) ||
        req.socket.remoteAddress,
      userAgent: req.headers['user-agent'] as string,
    };
    const result = await this.authService.verify2Fa(
      req.user,
      verify2FaDto.code,
      context,
    );
    return new SuccessResponse('2FA verified and enabled successfully', result);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/disable')
  @HttpCode(HttpStatus.OK)
  async disable2Fa(
    @Body() verify2FaDto: Verify2FaDto,
    @Req() req: RequestWithUser,
  ) {
    const context = {
      ip:
        req.ip ||
        (req.headers['x-forwarded-for'] as string) ||
        req.socket.remoteAddress,
      userAgent: req.headers['user-agent'] as string,
    };
    await this.authService.disable2Fa(req.user, verify2FaDto.code, context);
    return new SuccessResponse('2FA disabled successfully', {});
  }
}
