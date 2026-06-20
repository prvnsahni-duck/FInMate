import { Controller, Post, Body, UseGuards, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { RegisterDto, LoginDto, RefreshTokenDto, Verify2FaDto } from '@finmate/data-models';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RequestWithUser } from '../common/interfaces/request-with-user.interface';
import { Request } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(
      registerDto.email,
      registerDto.password,
      registerDto.displayName,
    );
  }

  @Post('login')
  async login(@Body() loginDto: LoginDto, @Req() req: Request) {
    const mfaCode = req.headers['x-mfa-code'] as string | undefined;
    return this.authService.login(loginDto.email, loginDto.password, mfaCode);
  }

  @Post('refresh')
  async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refresh(refreshTokenDto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() refreshTokenDto: RefreshTokenDto, @Req() req: RequestWithUser) {
    await this.authService.logout(refreshTokenDto.refreshToken, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/enable')
  async enable2Fa(@Req() req: RequestWithUser) {
    return this.authService.enable2Fa(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/verify')
  async verify2Fa(@Body() verify2FaDto: Verify2FaDto, @Req() req: RequestWithUser) {
    return this.authService.verify2Fa(req.user, verify2FaDto.code);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  async disable2Fa(@Body() verify2FaDto: Verify2FaDto, @Req() req: RequestWithUser) {
    return this.authService.disable2Fa(req.user, verify2FaDto.code);
  }
}
