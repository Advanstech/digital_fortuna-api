import { Injectable, Inject } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.constants';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(
    @Inject(REDIS_CLIENT) private redis: Redis,
  ) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      // Check Redis connectivity with PING
      const result = await this.redis.ping();
      
      if (result === 'PONG') {
        return this.getStatus(key, true);
      }
      
      throw new Error('Redis did not respond with PONG');
    } catch (error) {
      throw new HealthCheckError(
        'Redis check failed',
        this.getStatus(key, false, { message: error instanceof Error ? error.message : 'Unknown error' }),
      );
    }
  }
}
