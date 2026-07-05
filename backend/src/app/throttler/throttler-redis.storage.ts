import { Injectable, Logger } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { RedisService } from '../redis/redis.service';

/**
 * Redis-backed Throttler storage adapter that reuses the app's `RedisService`.
 * Implements the `@nestjs/throttler` v6 interface.
 */
@Injectable()
export class ThrottlerRedisStorage implements ThrottlerStorage {
  private readonly logger = new Logger(ThrottlerRedisStorage.name);

  constructor(private readonly redis: RedisService) {}

  async increment(
    key: string,
    ttl: number, // TTL in milliseconds
    limit: number,
    blockDuration: number, // Block duration in milliseconds
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    try {
      const blockKey = `block:${key}`;

      // 1. Check if the block key exists
      const blockTtl = await this.redis.ttl(blockKey);
      if (blockTtl > 0) {
        return {
          totalHits: limit + 1,
          timeToExpire: 0,
          isBlocked: true,
          timeToBlockExpire: blockTtl,
        };
      }

      // 2. Increment hits count
      const totalHits = await this.redis.incr(key);

      // If it is the first hit, set the TTL for the rate limiting window
      if (totalHits === 1) {
        await this.redis.expire(key, Math.ceil(ttl / 1000));
      }

      // Get the remaining TTL of the rate limiting window
      const timeToExpire = await this.redis.ttl(key);

      // 3. If limit exceeded, block the key
      if (totalHits > limit) {
        await this.redis.set(
          blockKey,
          'locked',
          Math.ceil(blockDuration / 1000),
        );
        return {
          totalHits,
          timeToExpire: timeToExpire > 0 ? timeToExpire : 0,
          isBlocked: true,
          timeToBlockExpire: Math.ceil(blockDuration / 1000),
        };
      }

      return {
        totalHits,
        timeToExpire: timeToExpire > 0 ? timeToExpire : 0,
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    } catch (err: any) {
      this.logger.error(
        `ThrottlerRedisStorage increment failed for ${key}: ${err?.message}`,
      );
      // Fallback: return unblocked record to prevent locking out users on Redis failure
      return {
        totalHits: 1,
        timeToExpire: Math.ceil(ttl / 1000),
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
  }
}
