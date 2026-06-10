import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { User, Profile } from '@finmate/data-models';
import * as argon2 from 'argon2';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Profile)
    private readonly profileRepository: Repository<Profile>,
    private readonly dataSource: DataSource,
  ) {}

  async createUser(email: string, passwordPlain: string, displayName?: string): Promise<User> {
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
}
