import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { User, Profile, UpdateProfileDto } from '@finmate/data-models';
import { EncryptionService } from '../encryption/encryption.service';
import * as argon2 from 'argon2';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Profile)
    private readonly profileRepository: Repository<Profile>,
    private readonly dataSource: DataSource,
    private readonly encryptionService: EncryptionService,
  ) {}

  async createUser(
    email: string,
    passwordPlain: string,
    displayName?: string,
  ): Promise<User> {
    const existing = await this.userRepository.findOne({ where: { email } });
    if (existing) {
      // mapped by global filter to RES_ALREADY_EXISTS
      throw new ConflictException('User with this email already exists');
    }

    const passwordHash = await argon2.hash(passwordPlain);

    return this.dataSource.transaction(async (manager) => {
      const user = manager.create(User, {
        email,
        passwordHash,
        displayName,
        status: 'active',
      });
      const savedUser = await manager.save(User, user);

      const profile = manager.create(Profile, {
        user: savedUser,
        defaultCurrency: 'INR',
        locale: 'en-IN',
        timezone: 'Asia/Kolkata',
      });
      await manager.save(Profile, profile);

      return savedUser;
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
  }

  async updateUser(user: User): Promise<User> {
    return this.userRepository.save(user);
  }

  async findProfileByUserId(userId: string): Promise<Profile | null> {
    const profile = await this.profileRepository.findOne({
      where: { user: { id: userId } },
    });
    if (!profile) return null;
    return this.decryptProfile(profile);
  }

  async updateProfile(
    userId: string,
    data: UpdateProfileDto,
  ): Promise<{ user: User; profile: Profile }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const profile = await this.profileRepository.findOne({
      where: { user: { id: userId } },
    });
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    if (data.displayName !== undefined || data.aiOptIn !== undefined) {
      if (data.displayName !== undefined) {
        user.displayName = data.displayName;
      }
      if (data.aiOptIn !== undefined) {
        user.aiOptIn = data.aiOptIn;
      }
      await this.userRepository.save(user);
    }

    if (data.locale !== undefined) {
      profile.locale = data.locale;
    }
    if (data.timezone !== undefined) {
      profile.timezone = data.timezone;
    }
    if (data.defaultCurrency !== undefined) {
      profile.defaultCurrency = data.defaultCurrency;
    }
    if (data.monthlyBudget !== undefined) {
      profile.monthlyBudget = data.monthlyBudget;
    }
    if (data.monthlyIncome !== undefined) {
      profile.monthlyIncome = data.monthlyIncome;
    }
    if (data.avatarUrl !== undefined) {
      profile.avatarUrl = data.avatarUrl
        ? this.encryptionService.encrypt(data.avatarUrl)
        : undefined;
    }

    const savedProfile = await this.profileRepository.save(profile);

    return {
      user,
      profile: this.decryptProfile(savedProfile),
    };
  }

  private decryptProfile(profile: Profile): Profile {
    if (profile.avatarUrl) {
      try {
        profile.avatarUrl = this.encryptionService.decrypt(profile.avatarUrl);
      } catch (err) {
        // Fallback to original value if decryption fails (e.g. if database has unencrypted values)
      }
    }
    return profile;
  }

  async searchUsers(query: string, currentUserId: string): Promise<User[]> {
    if (!query || query.trim() === '') {
      return [];
    }
    const sanitizedQuery = `%${query.trim()}%`;
    return this.userRepository
      .createQueryBuilder('user')
      .where('user.id != :currentUserId', { currentUserId })
      .andWhere(
        '(user.email ILIKE :query OR user.username ILIKE :query OR user.phoneNumber ILIKE :query)',
        { query: sanitizedQuery },
      )
      .limit(10)
      .getMany();
  }

  async saveKeys(
    userId: string,
    publicWrappingKey: string,
    encryptedPrivateWrappingKey: string,
  ): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    user.publicWrappingKey = publicWrappingKey;
    user.encryptedPrivateWrappingKey = encryptedPrivateWrappingKey;
    return this.userRepository.save(user);
  }

  async getKeys(userId: string): Promise<{
    publicWrappingKey: string | null;
    encryptedPrivateWrappingKey: string | null;
  }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return {
      publicWrappingKey: user.publicWrappingKey || null,
      encryptedPrivateWrappingKey: user.encryptedPrivateWrappingKey || null,
    };
  }

  async getPublicWrappingKey(userId: string): Promise<string | null> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user.publicWrappingKey || null;
  }

  async lookupUser(identifier: string): Promise<User | null> {
    if (!identifier) return null;
    const trimmed = identifier.trim();
    return this.userRepository.findOne({
      where: [{ email: trimmed }, { username: trimmed }],
    });
  }
}
