import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { User, Profile } from '@finmate/data-models';
import { Repository, DataSource } from 'typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { EncryptionService } from '../encryption/encryption.service';
import * as argon2 from 'argon2';

jest.mock('argon2');

describe('UsersService', () => {
  let service: UsersService;
  let userRepository: jest.Mocked<Repository<User>>;
  let profileRepository: jest.Mocked<Repository<Profile>>;
  let dataSource: jest.Mocked<DataSource>;
  let encryptionService: jest.Mocked<EncryptionService>;

  beforeEach(async () => {
    const mockUserRepository = {
      findOne: jest.fn(),
      save: jest.fn(async (data) => data),
      create: jest.fn((entity, data) => data),
    };

    const mockProfileRepository = {
      findOne: jest.fn(),
      save: jest.fn(async (data) => data),
      create: jest.fn((entity, data) => data),
    };

    const mockManager = {
      create: jest.fn((entity, data) => data),
      save: jest.fn(async (entity, data) => data),
    };

    const mockDataSource = {
      transaction: jest.fn((cb) => cb(mockManager)),
    };

    const mockEncryptionService = {
      encrypt: jest.fn((text) => `encrypted:${text}`),
      decrypt: jest.fn((cipher) => cipher.replace('encrypted:', '')),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        { provide: getRepositoryToken(Profile), useValue: mockProfileRepository },
        { provide: DataSource, useValue: mockDataSource },
        { provide: EncryptionService, useValue: mockEncryptionService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    userRepository = module.get(getRepositoryToken(User));
    profileRepository = module.get(getRepositoryToken(Profile));
    dataSource = module.get(DataSource);
    encryptionService = module.get(EncryptionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createUser', () => {
    it('should throw ConflictException if email already exists', async () => {
      userRepository.findOne.mockResolvedValue({ id: 'existing-id' } as any);

      await expect(service.createUser('test@example.com', 'password')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should hash password and save user and profile in transaction', async () => {
      userRepository.findOne.mockResolvedValue(null);
      (argon2.hash as jest.Mock).mockResolvedValue('hashed-password');

      const result = await service.createUser('test@example.com', 'password', 'Test User');

      expect(argon2.hash).toHaveBeenCalledWith('password');
      expect(dataSource.transaction).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.email).toBe('test@example.com');
      expect(result.passwordHash).toBe('hashed-password');
      expect(result.displayName).toBe('Test User');
    });
  });

  describe('findProfileByUserId', () => {
    it('should return null if profile not found', async () => {
      profileRepository.findOne.mockResolvedValue(null);

      const result = await service.findProfileByUserId('user-id');
      expect(result).toBeNull();
    });

    it('should return profile and decrypt avatarUrl if set', async () => {
      const mockProfile = {
        id: 'profile-id',
        avatarUrl: 'encrypted:https://example.com/avatar.png',
      } as any;
      profileRepository.findOne.mockResolvedValue(mockProfile);

      const result = await service.findProfileByUserId('user-id');
      expect(result).toBeDefined();
      expect(result?.avatarUrl).toBe('https://example.com/avatar.png');
      expect(encryptionService.decrypt).toHaveBeenCalledWith('encrypted:https://example.com/avatar.png');
    });
  });

  describe('updateProfile', () => {
    it('should throw NotFoundException if user not found', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(service.updateProfile('user-id', {})).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if profile not found', async () => {
      userRepository.findOne.mockResolvedValue({ id: 'user-id' } as any);
      profileRepository.findOne.mockResolvedValue(null);

      await expect(service.updateProfile('user-id', {})).rejects.toThrow(NotFoundException);
    });

    it('should update user and profile settings, encrypting avatarUrl', async () => {
      const mockUser = {
        id: 'user-id',
        displayName: 'Old Name',
      } as any;

      const mockProfile = {
        id: 'profile-id',
        locale: 'en-IN',
        defaultCurrency: 'INR',
        avatarUrl: undefined,
      } as any;

      userRepository.findOne.mockResolvedValue(mockUser);
      profileRepository.findOne.mockResolvedValue(mockProfile);
      userRepository.save.mockResolvedValue(mockUser);
      profileRepository.save.mockResolvedValue(mockProfile);

      const result = await service.updateProfile('user-id', {
        displayName: 'New Name',
        avatarUrl: 'https://example.com/new.png',
        locale: 'en-US',
        defaultCurrency: 'EUR',
      });

      expect(mockUser.displayName).toBe('New Name');
      expect(mockProfile.locale).toBe('en-US');
      expect(mockProfile.defaultCurrency).toBe('EUR');
      expect(encryptionService.encrypt).toHaveBeenCalledWith('https://example.com/new.png');
      expect(result.user.displayName).toBe('New Name');
      expect(result.profile.avatarUrl).toBe('https://example.com/new.png');
      expect(result.profile.defaultCurrency).toBe('EUR');
    });
  });
});
