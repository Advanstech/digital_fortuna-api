import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { CacheService } from '../../redis/cache.service';

interface CacheOptions {
  ttl?: number;
  key?: string | ((context: ExecutionContext) => string);
}

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  constructor(
    @Inject(CacheService) private readonly cacheService: CacheService,
    private readonly options: CacheOptions = {},
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const cacheKey = this.generateCacheKey(context);
    
    // Try to get from cache
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return of(cached);
    }

    // Execute and cache the result
    return next.handle().pipe(
      tap(async (data) => {
        await this.cacheService.set(
          cacheKey,
          data,
          this.options.ttl || 300, // Default 5 minutes
        );
      }),
    );
  }

  private generateCacheKey(context: ExecutionContext): string {
    const request = context.switchToHttp().getRequest();
    
    if (typeof this.options.key === 'function') {
      return this.options.key(context);
    }
    
    if (typeof this.options.key === 'string') {
      return this.options.key;
    }
    
    // Default key generation
    const { method, url, query, body } = request;
    const queryStr = JSON.stringify(query);
    const bodyStr = JSON.stringify(body);
    
    return `cache:${method}:${url}:${queryStr}:${bodyStr}`;
  }
}

// Factory for creating cache decorators with options
export function Cacheable(options: CacheOptions = {}) {
  return new CacheInterceptor(new CacheService(null as any), options);
}
