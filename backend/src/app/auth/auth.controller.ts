import {
  Controller,
  Post,
  Get,
  Body,
  Query,
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
  ChangePasswordDto,
} from '@finmate/data-models';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RequestWithUser } from '../common/interfaces/request-with-user.interface';
import { Request } from 'express';
import { SuccessResponse } from '../common/response.util';
import { ThrottleAs } from '../throttler/throttle-policy.decorator';
import { THROTTLE_PROFILES } from '../throttler/throttle.constants';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ThrottleAs(THROTTLE_PROFILES.REGISTER)
  async register(@Body() registerDto: RegisterDto) {
    const result = await this.authService.register(
      registerDto.email,
      registerDto.password,
      registerDto.displayName,
    );
    return new SuccessResponse('User registered successfully', result);
  }

  @Get('verify-email')
  @ThrottleAs(THROTTLE_PROFILES.OTP)
  async verifyEmail(@Query('token') token: string) {
    const result = await this.authService.verifyEmail(token);
    return new SuccessResponse('Email verified successfully', result);
  }

  @Post('login')
  @ThrottleAs(THROTTLE_PROFILES.LOGIN)
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
  @ThrottleAs(THROTTLE_PROFILES.REFRESH)
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
  @Post('change-password')
  @ThrottleAs(THROTTLE_PROFILES.RESET_PASSWORD)
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @Req() req: RequestWithUser,
  ) {
    const context = {
      ip:
        req.ip ||
        (req.headers['x-forwarded-for'] as string) ||
        req.socket.remoteAddress,
      userAgent: req.headers['user-agent'] as string,
    };
    await this.authService.changePassword(
      req.user.id,
      dto.currentPassword,
      dto.newPassword,
      dto.encryptedPrivateWrappingKey,
      dto.recoveryWrappedKey,
      context,
    );
    return new SuccessResponse(
      'Password changed successfully. Please sign in again.',
      {},
    );
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
  @ThrottleAs(THROTTLE_PROFILES.OTP)
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
  @ThrottleAs(THROTTLE_PROFILES.OTP)
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
