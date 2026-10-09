import {
  Injectable,
  Inject,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.constants';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly defaultConfig: RateLimitConfig = {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100, // 100 requests per minute
  };

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config?: RateLimitConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<any>();
    const key = this.generateKey(request);
    
    const { windowMs, maxRequests } = { ...this.defaultConfig, ...this.config };
    
    const current = await this.redis.incr(key);
    
    if (current === 1) {
      await this.redis.pexpire(key, windowMs);
    }
    
    if (current > maxRequests) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many requests, please try again later',
          error: 'Too Many Requests',
          retryAfter: Math.ceil(windowMs / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    
    return true;
  }

  private generateKey(request: any): string {
    const identifier = request.user?.['userId'] || 
      request.headers['x-forwarded-for'] || 
      request.ip || 
      'unknown';
    return `rate_limit:${request.method}:${request.url}:${identifier}`;
  }
}
