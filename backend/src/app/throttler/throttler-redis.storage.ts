import { Injectable, Logger } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { RedisService } from '../redis/redis.service';

/**
 * Minimal Redis-backed Throttler storage adapter that reuses the app's `RedisService`.
 * Implements the small surface required by @nestjs/throttler: `getRecord` and `addRecord`.
 */
@Injectable()
export class ThrottlerRedisStorage implements ThrottlerStorage {
  private readonly logger = new Logger(ThrottlerRedisStorage.name);

  constructor(private readonly redis: RedisService) {}

  // Expect records to be stored as JSON array of timestamps
  async getRecord(key: string): Promise<number[]> {
    try {
      const val = await this.redis.get(key);
      if (!val) return [];
      const parsed = JSON.parse(val) as number[];
      if (Array.isArray(parsed)) return parsed;
      return [];
    } catch (err: any) {
      this.logger.error(`Failed to get throttle record for ${key}: ${err?.message}`);
      return [];
    }
  }

  async addRecord(key: string, ttl: number): Promise<void> {
    try {
      const now = Date.now();
      const records = await this.getRecord(key);
      records.push(now);
      // Trim records older than ttl
      const cutoff = now - ttl;
      const trimmed = records.filter((ts) => ts >= cutoff);
      await this.redis.set(key, JSON.stringify(trimmed), Math.ceil(ttl / 1000));
    } catch (err: any) {
      this.logger.error(`Failed to add throttle record for ${key}: ${err?.message}`);
    }
  }
}
