import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client!: RedisClientType;

  constructor(private readonly configService: ConfigService) {
    let url =
      this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';

    // Clean up surrounding quotes and whitespace
    url = url.trim().replace(/^['"]|['"]$/g, '');

    // Auto-prefix protocol if missing
    if (!url.startsWith('redis://') && !url.startsWith('rediss://')) {
      url = `redis://${url}`;
    }

    const maskedUrl = url.replace(/:[^:@\s]+@/, ':****@');
    this.logger.log(`Initializing Redis client with URL: ${maskedUrl}`);

    this.client = createClient({ url });

    this.client.on('error', (err) => {
      this.logger.error(`Redis client error: ${err.message}`, err.stack);
    });
  }

  async onModuleInit() {
    try {
      await this.client.connect();
      this.logger.log('Connected to Redis successfully');
    } catch (err: any) {
      this.logger.error(
        `Failed to connect to Redis: ${err.message}`,
        err.stack,
      );
    }
  }

  async onModuleDestroy() {
    try {
      await this.client.disconnect();
      this.logger.log('Disconnected from Redis');
    } catch (err: any) {
      this.logger.error(
        `Failed to disconnect from Redis: ${err.message}`,
        err.stack,
      );
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    try {
      if (ttlSeconds) {
        await this.client.set(key, value, { EX: ttlSeconds });
      } else {
        await this.client.set(key, value);
      }
    } catch (err: any) {
      this.logger.error(
        `Redis set operation failed: ${err.message}`,
        err.stack,
      );
      throw new ServiceUnavailableException(
        'Cache service is temporarily unavailable',
      );
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      return (await this.client.get(key)) as any;
    } catch (err: any) {
      this.logger.error(
        `Redis get operation failed: ${err.message}`,
        err.stack,
      );
      throw new ServiceUnavailableException(
        'Cache service is temporarily unavailable',
      );
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (err: any) {
      this.logger.error(
        `Redis del operation failed: ${err.message}`,
        err.stack,
      );
      throw new ServiceUnavailableException(
        'Cache service is temporarily unavailable',
      );
    }
  }

  async setNx(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    try {
      const result = await this.client.set(key, value, {
        NX: true,
        EX: ttlSeconds,
      });
      return result === 'OK';
    } catch (err: any) {
      this.logger.error(
        `Redis setNx operation failed: ${err.message}`,
        err.stack,
      );
      return false;
    }
  }

  async incr(key: string): Promise<number> {
    try {
      return await this.client.incr(key);
    } catch (err: any) {
      this.logger.error(
        `Redis incr operation failed: ${err.message}`,
        err.stack,
      );
      throw new ServiceUnavailableException(
        'Cache service is temporarily unavailable',
      );
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      return await this.client.ttl(key);
    } catch (err: any) {
      this.logger.error(
        `Redis ttl operation failed: ${err.message}`,
        err.stack,
      );
      throw new ServiceUnavailableException(
        'Cache service is temporarily unavailable',
      );
    }
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      return !!(await this.client.expire(key, ttlSeconds));
    } catch (err: any) {
      this.logger.error(
        `Redis expire operation failed: ${err.message}`,
        err.stack,
      );
      throw new ServiceUnavailableException(
        'Cache service is temporarily unavailable',
      );
    }
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (err: any) {
      this.logger.error(
        `Redis ping failed: ${err.message}`,
        err.stack,
      );
      return false;
    }
  }
}
