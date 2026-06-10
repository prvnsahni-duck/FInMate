import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import * as argon2 from 'argon2';

jest.mock('argon2');

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: jest.Mocked<JwtService>;
  let redisService: jest.Mocked<RedisService>;

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get(UsersService);
    jwtService = module.get(JwtService);
    redisService = module.get(RedisService);
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

    it('should return token pair and user if credentials are valid', async () => {
      const mockUser = {
        id: 'user-id',
        email: 'test@example.com',
        displayName: 'Test User',
        status: 'active',
        passwordHash: 'hashed',
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
      redisService.get.mockResolvedValue('active');
      
      const mockUser = {
        id: 'user-id',
        email: 'test@example.com',
        status: 'active',
      } as any;
      usersService.findById.mockResolvedValue(mockUser);
      
      jwtService.sign.mockReturnValueOnce('new-access-token').mockReturnValueOnce('new-refresh-token');

      const result = await service.refresh('old-token');

      expect(redisService.del).toHaveBeenCalledWith('refresh_token:user-id:ref-id');
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

      expect(redisService.del).toHaveBeenCalledWith('refresh_token:user-id:ref-id');
    });

    it('should throw ForbiddenException if user attempts to log out another user', async () => {
      jwtService.decode.mockReturnValue({ userId: 'other-user-id', refreshId: 'ref-id' });

      await expect(service.logout('some-token', 'user-id')).rejects.toThrow(ForbiddenException);
    });
  });
});
