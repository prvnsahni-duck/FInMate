import { Injectable, UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { RedisService } from '../redis/redis.service';
import { User } from '@finmate/data-models';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { generateSecret, verifyTotp } from './utils/totp.util';

@Injectable()
export class AuthService {
  private readonly jwtSecret: string;
  private readonly jwtRefreshSecret: string;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.jwtSecret = this.configService.get<string>('JWT_SECRET') || 'default_jwt_secret';
    this.jwtRefreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET') || 'default_jwt_refresh_secret';
  }

  async register(email: string, passwordPlain: string, displayName?: string) {
    const savedUser = await this.usersService.createUser(email, passwordPlain, displayName);
    return this.serializeUser(savedUser);
  }

  async login(email: string, passwordPlain: string, mfaCode?: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== 'active') {
      throw new UnauthorizedException('User account is not active');
    }

    const isPasswordCorrect = await argon2.verify(user.passwordHash, passwordPlain);
    if (!isPasswordCorrect) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check Multi-Factor Authentication
    if (user.isTwoFactorEnabled) {
      if (!mfaCode) {
        throw new ForbiddenException({
          errorCode: 'AUTH_MFA_REQUIRED',
          message: 'MFA verification required',
        });
      }

      const isMfaValid = verifyTotp(user.twoFactorSecret || '', mfaCode);
      if (!isMfaValid) {
        throw new BadRequestException({
          errorCode: 'AUTH_MFA_INVALID',
          message: 'The provided 2FA verification code is invalid',
        });
      }
    }

    const refreshId = randomUUID();
    const accessToken = this.generateAccessToken(user.id, user.email);
    const refreshToken = this.generateRefreshToken(user.id, refreshId);

    // Save active session in Redis (7 days TTL)
    const sevenDaysInSeconds = 7 * 24 * 60 * 60;
    await this.redisService.set(`refresh_token:${user.id}:${refreshId}`, 'active', sevenDaysInSeconds);

    // Update last login
    user.lastLoginAt = new Date();
    await this.usersService.updateUser(user);

    return {
      accessToken,
      refreshToken,
      user: this.serializeUser(user),
    };
  }

  async enable2Fa(user: User) {
    const secret = generateSecret();
    user.twoFactorSecret = secret;
    user.isTwoFactorEnabled = false; // pending verification
    await this.usersService.updateUser(user);

    const qrCodeUrl = `otpauth://totp/FinMate:${user.email}?secret=${secret}&issuer=FinMate`;
    return {
      secret,
      qrCodeUrl,
    };
  }

  async verify2Fa(user: User, code: string) {
    if (!user.twoFactorSecret) {
      throw new BadRequestException({
        errorCode: 'VAL_INVALID_INPUT',
        message: '2FA setup not initiated',
      });
    }

    const isValid = verifyTotp(user.twoFactorSecret, code);
    if (!isValid) {
      throw new BadRequestException({
        errorCode: 'AUTH_MFA_INVALID',
        message: 'The provided 6-digit TOTP code failed verification',
      });
    }

    user.isTwoFactorEnabled = true;
    await this.usersService.updateUser(user);
    return { success: true };
  }

  async disable2Fa(user: User, code: string) {
    if (!user.isTwoFactorEnabled || !user.twoFactorSecret) {
      throw new BadRequestException({
        errorCode: 'VAL_INVALID_INPUT',
        message: '2FA is not enabled on this account',
      });
    }

    const isValid = verifyTotp(user.twoFactorSecret, code);
    if (!isValid) {
      throw new BadRequestException({
        errorCode: 'AUTH_MFA_INVALID',
        message: 'The provided 6-digit TOTP code failed verification',
      });
    }

    user.isTwoFactorEnabled = false;
    user.twoFactorSecret = undefined;
    await this.usersService.updateUser(user);
    return { success: true };
  }

  async refresh(refreshToken: string) {
    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.jwtRefreshSecret,
      });
    } catch (err: any) {
      if (err?.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Token expired');
      }
      throw new UnauthorizedException('Invalid token');
    }

    if (!payload || !payload.userId || !payload.refreshId) {
      throw new UnauthorizedException('Invalid token');
    }

    const { userId, refreshId } = payload;
    const redisKey = `refresh_token:${userId}:${refreshId}`;
    const status = await this.redisService.get(redisKey);

    if (status !== 'active') {
      throw new UnauthorizedException('Invalid token');
    }

    // Revoke old refresh token (token rotation)
    await this.redisService.del(redisKey);

    // Get user details
    const user = await this.usersService.findById(userId);
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('Invalid token');
    }

    // Generate new token pair
    const newRefreshId = randomUUID();
    const newAccessToken = this.generateAccessToken(user.id, user.email);
    const newRefreshToken = this.generateRefreshToken(user.id, newRefreshId);

    // Store new active refresh token
    const sevenDaysInSeconds = 7 * 24 * 60 * 60;
    await this.redisService.set(`refresh_token:${user.id}:${newRefreshId}`, 'active', sevenDaysInSeconds);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  async logout(refreshToken: string, currentUserId: string) {
    let payload: any;
    try {
      payload = this.jwtService.decode(refreshToken) as any;
    } catch (err) {
      // ignore parsing error
    }

    if (payload && payload.userId && payload.refreshId) {
      if (payload.userId !== currentUserId) {
        throw new ForbiddenException('Cannot log out another user session');
      }
      await this.redisService.del(`refresh_token:${payload.userId}:${payload.refreshId}`);
    }
  }

  private generateAccessToken(userId: string, email: string): string {
    return this.jwtService.sign(
      { userId, email },
      {
        secret: this.jwtSecret,
        expiresIn: '15m',
      },
    );
  }

  private generateRefreshToken(userId: string, refreshId: string): string {
    return this.jwtService.sign(
      { userId, refreshId },
      {
        secret: this.jwtRefreshSecret,
        expiresIn: '7d',
      },
    );
  }

  private serializeUser(user: User) {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
