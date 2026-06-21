import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client!: RedisClientType;

  constructor(private readonly configService: ConfigService) {
    let url = this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';
    
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
      this.logger.error(`Failed to connect to Redis: ${err.message}`, err.stack);
    }
  }

  async onModuleDestroy() {
    try {
      await this.client.disconnect();
      this.logger.log('Disconnected from Redis');
    } catch (err: any) {
      this.logger.error(`Failed to disconnect from Redis: ${err.message}`, err.stack);
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, { EX: ttlSeconds });
    } else {
      await this.client.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key) as any;
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }
}
