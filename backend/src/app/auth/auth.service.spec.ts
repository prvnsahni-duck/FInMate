import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { EncryptionService } from '../encryption/encryption.service';
import { AuditLog } from '@finmate/data-models';
import { UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { generateTotp } from './utils/totp.util';
import { createHash } from 'crypto';

jest.mock('argon2');

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: jest.Mocked<JwtService>;
  let redisService: jest.Mocked<RedisService>;
  let encryptionService: jest.Mocked<EncryptionService>;

  beforeEach(async () => {
    const mockUsersService = {
      createUser: jest.fn(),
      findByEmail: jest.fn(),
      findById: jest.fn(),
      updateUser: jest.fn(),
    };

    const mockJwtService = {
      sign: jest.fn(),
      verifyAsync: jest.fn(),
      decode: jest.fn(),
    };

    const mockRedisService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'JWT_SECRET') return 'secret';
        if (key === 'JWT_REFRESH_SECRET') return 'refresh_secret';
        return null;
      }),
    };

    const mockEncryptionService = {
      encrypt: jest.fn((val) => `encrypted:${val}`),
      decrypt: jest.fn((val) => val.replace('encrypted:', '')),
    };

    const mockAuditLogRepository = {
      save: jest.fn(),
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: EncryptionService, useValue: mockEncryptionService },
        { provide: getRepositoryToken(AuditLog), useValue: mockAuditLogRepository },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get(UsersService);
    jwtService = module.get(JwtService);
    redisService = module.get(RedisService);
    encryptionService = module.get(EncryptionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    it('should register and return serialized user', async () => {
      const mockUser = {
        id: 'user-id',
        email: 'test@example.com',
        displayName: 'Test User',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        passwordHash: 'hashed',
      } as any;

      usersService.createUser.mockResolvedValue(mockUser);

      const result = await service.register('test@example.com', 'password', 'Test User');

      expect(usersService.createUser).toHaveBeenCalledWith('test@example.com', 'password', 'Test User');
      expect(result).toEqual({
        id: 'user-id',
        email: 'test@example.com',
        displayName: 'Test User',
        status: 'active',
        createdAt: mockUser.createdAt,
        updatedAt: mockUser.updatedAt,
      });
    });
  });

  describe('login', () => {
    it('should throw UnauthorizedException if user not found', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(service.login('test@example.com', 'password')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if password incorrect', async () => {
      const mockUser = {
        email: 'test@example.com',
        passwordHash: 'hashed',
        status: 'active',
      } as any;

      usersService.findByEmail.mockResolvedValue(mockUser);
      (argon2.verify as jest.Mock).mockResolvedValue(false);

      await expect(service.login('test@example.com', 'password')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should return token pair and user if credentials are valid and 2FA not enabled', async () => {
      const mockUser = {
        id: 'user-id',
        email: 'test@example.com',
        displayName: 'Test User',
        status: 'active',
        passwordHash: 'hashed',
        isTwoFactorEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any;

      usersService.findByEmail.mockResolvedValue(mockUser);
      (argon2.verify as jest.Mock).mockResolvedValue(true);
      jwtService.sign.mockReturnValueOnce('access-token').mockReturnValueOnce('refresh-token');

      const result = await service.login('test@example.com', 'password');

      expect(redisService.set).toHaveBeenCalled();
      expect(usersService.updateUser).toHaveBeenCalled();
      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user: {
          id: 'user-id',
          email: 'test@example.com',
          displayName: 'Test User',
          status: 'active',
          createdAt: mockUser.createdAt,
          updatedAt: mockUser.updatedAt,
        },
      });
    });

    it('should throw ForbiddenException if 2FA is enabled but code is missing', async () => {
      const mockUser = {
        id: 'user-id',
        email: 'test@example.com',
        status: 'active',
        passwordHash: 'hashed',
        isTwoFactorEnabled: true,
        twoFactorSecret: 'KVKFKRCSN5RHK33O',
      } as any;

      usersService.findByEmail.mockResolvedValue(mockUser);
      (argon2.verify as jest.Mock).mockResolvedValue(true);

      await expect(service.login('test@example.com', 'password')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw BadRequestException if 2FA is enabled but code is invalid', async () => {
      const mockUser = {
        id: 'user-id',
        email: 'test@example.com',
        status: 'active',
        passwordHash: 'hashed',
        isTwoFactorEnabled: true,
        twoFactorSecret: 'KVKFKRCSN5RHK33O',
      } as any;

      usersService.findByEmail.mockResolvedValue(mockUser);
      (argon2.verify as jest.Mock).mockResolvedValue(true);

      await expect(service.login('test@example.com', 'password', '111111')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should log in successfully if 2FA is enabled and correct code is provided', async () => {
      const mockUser = {
        id: 'user-id',
        email: 'test@example.com',
        displayName: 'Test User',
        status: 'active',
        passwordHash: 'hashed',
        isTwoFactorEnabled: true,
        twoFactorSecret: 'KVKFKRCSN5RHK33O',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any;

      usersService.findByEmail.mockResolvedValue(mockUser);
      (argon2.verify as jest.Mock).mockResolvedValue(true);
      jwtService.sign.mockReturnValueOnce('access-token').mockReturnValueOnce('refresh-token');

      const currentStep = Math.floor(Date.now() / 1000 / 30);
      const correctCode = generateTotp('KVKFKRCSN5RHK33O', currentStep);

      const result = await service.login('test@example.com', 'password', correctCode);

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
    });
  });

  describe('2FA Management', () => {
    it('enable2Fa should generate secret and QR URL', async () => {
      const mockUser = {
        id: 'user-id',
        email: 'test@example.com',
        isTwoFactorEnabled: false,
      } as any;

      const result = await service.enable2Fa(mockUser);

      expect(result.secret).toHaveLength(16);
      expect(result.qrCodeUrl).toContain('otpauth://totp/FinMate:test@example.com');
      expect(usersService.updateUser).toHaveBeenCalled();
    });

    it('verify2Fa should fail with invalid code', async () => {
      const mockUser = {
        id: 'user-id',
        twoFactorSecret: 'KVKFKRCSN5RHK33O',
        isTwoFactorEnabled: false,
      } as any;

      await expect(service.verify2Fa(mockUser, '000000')).rejects.toThrow(BadRequestException);
    });

    it('verify2Fa should succeed with valid code and enable 2FA', async () => {
      const mockUser = {
        id: 'user-id',
        twoFactorSecret: 'KVKFKRCSN5RHK33O',
        isTwoFactorEnabled: false,
      } as any;

      const currentStep = Math.floor(Date.now() / 1000 / 30);
      const correctCode = generateTotp('KVKFKRCSN5RHK33O', currentStep);

      const result = await service.verify2Fa(mockUser, correctCode);

      expect(result.success).toBe(true);
      expect(mockUser.isTwoFactorEnabled).toBe(true);
      expect(usersService.updateUser).toHaveBeenCalledWith(mockUser);
    });

    it('disable2Fa should fail with invalid code', async () => {
      const mockUser = {
        id: 'user-id',
        twoFactorSecret: 'KVKFKRCSN5RHK33O',
        isTwoFactorEnabled: true,
      } as any;

      await expect(service.disable2Fa(mockUser, '000000')).rejects.toThrow(BadRequestException);
    });

    it('disable2Fa should succeed with valid code and disable 2FA', async () => {
      const mockUser = {
        id: 'user-id',
        twoFactorSecret: 'KVKFKRCSN5RHK33O',
        isTwoFactorEnabled: true,
      } as any;

      const currentStep = Math.floor(Date.now() / 1000 / 30);
      const correctCode = generateTotp('KVKFKRCSN5RHK33O', currentStep);

      const result = await service.disable2Fa(mockUser, correctCode);

      expect(result.success).toBe(true);
      expect(mockUser.isTwoFactorEnabled).toBe(false);
      expect(mockUser.twoFactorSecret).toBeUndefined();
      expect(usersService.updateUser).toHaveBeenCalledWith(mockUser);
    });
  });

  describe('refresh', () => {
    it('should throw UnauthorizedException if refresh token is expired or invalid', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('verify error'));

      await expect(service.refresh('expired-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if token not active in Redis', async () => {
      jwtService.verifyAsync.mockResolvedValue({ userId: 'user-id', refreshId: 'ref-id' });
      redisService.get.mockResolvedValue(null);

      await expect(service.refresh('some-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should rotate tokens and store new session in Redis if token is valid', async () => {
      jwtService.verifyAsync.mockResolvedValue({ userId: 'user-id', refreshId: 'ref-id' });
      redisService.get.mockResolvedValue('some-argon-hash');
      (argon2.verify as jest.Mock).mockResolvedValue(true);
      (argon2.hash as jest.Mock).mockResolvedValue('new-argon-hash');
      
      const mockUser = {
        id: 'user-id',
        email: 'test@example.com',
        status: 'active',
      } as any;
      usersService.findById.mockResolvedValue(mockUser);
      
      jwtService.sign.mockReturnValueOnce('new-access-token').mockReturnValueOnce('new-refresh-token');

      const result = await service.refresh('old-token');

      const expectedKey = `refresh_token:user-id:${createHash('sha256').update('ref-id').digest('hex')}`;
      expect(redisService.del).toHaveBeenCalledWith(expectedKey);
      expect(redisService.set).toHaveBeenCalled();
      expect(result).toEqual({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });
    });
  });

  describe('logout', () => {
    it('should delete key in Redis', async () => {
      jwtService.decode.mockReturnValue({ userId: 'user-id', refreshId: 'ref-id' });

      await service.logout('some-token', 'user-id');

      const expectedKey = `refresh_token:user-id:${createHash('sha256').update('ref-id').digest('hex')}`;
      expect(redisService.del).toHaveBeenCalledWith(expectedKey);
    });

    it('should throw ForbiddenException if user attempts to log out another user', async () => {
      jwtService.decode.mockReturnValue({ userId: 'other-user-id', refreshId: 'ref-id' });

      await expect(service.logout('some-token', 'user-id')).rejects.toThrow(ForbiddenException);
    });
  });
});
