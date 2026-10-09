import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { CacheService } from './cache.service';
import { REDIS_CLIENT } from './redis.constants';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL');
        
        if (redisUrl) {
          return new Redis(redisUrl, {
            retryStrategy: (times) => Math.min(times * 50, 2000),
            maxRetriesPerRequest: 3,
          });
        }
        
        return new Redis({
          host: configService.get<string>('REDIS_HOST') || 'localhost',
          port: configService.get<number>('REDIS_PORT') || 6379,
          password: configService.get<string>('REDIS_PASSWORD'),
          db: configService.get<number>('REDIS_DB') || 0,
          retryStrategy: (times) => Math.min(times * 50, 2000),
          maxRetriesPerRequest: 3,
        });
      },
    },
    CacheService,
  ],
  exports: [REDIS_CLIENT, CacheService],
})
export class RedisModule {}
