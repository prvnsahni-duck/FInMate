import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { User, Profile } from '@finmate/data-models';
import { Repository, DataSource } from 'typeorm';
import { ConflictException } from '@nestjs/common';
import * as argon2 from 'argon2';

jest.mock('argon2');

describe('UsersService', () => {
  let service: UsersService;
  let userRepository: jest.Mocked<Repository<User>>;
  let profileRepository: jest.Mocked<Repository<Profile>>;
  let dataSource: jest.Mocked<DataSource>;

  beforeEach(async () => {
    const mockRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn((entity, data) => data),
    };

    const mockManager = {
      create: jest.fn((entity, data) => data),
      save: jest.fn(async (entity, data) => data),
    };

    const mockDataSource = {
      transaction: jest.fn((cb) => cb(mockManager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: mockRepository },
        { provide: getRepositoryToken(Profile), useValue: mockRepository },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    userRepository = module.get(getRepositoryToken(User));
    profileRepository = module.get(getRepositoryToken(Profile));
    dataSource = module.get(DataSource);
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
});
