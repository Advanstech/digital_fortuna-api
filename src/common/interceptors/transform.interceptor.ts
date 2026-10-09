import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  data: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
  timestamp: string;
  requestId?: string;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, Response<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T>> {
    const ctx = context.switchToHttp();
    const response = ctx.getResponse<any>();
    const request = ctx.getRequest();
    
    const requestId = request.headers['x-request-id'] as string || 
      `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Add request ID to response headers
    response.header('X-Request-ID', requestId);

    return next.handle().pipe(
      map((data) => {
        // If data is already wrapped with meta (pagination), preserve it
        if (data && typeof data === 'object' && 'data' in data && 'meta' in data) {
          return {
            data: data.data,
            meta: data.meta,
            timestamp: new Date().toISOString(),
            requestId,
          };
        }

        // Standard transformation
        return {
          data,
          timestamp: new Date().toISOString(),
          requestId,
        };
      }),
    );
  }
}
