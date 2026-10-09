import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<any>();
    const response = context.switchToHttp().getResponse<any>();
    const { method, url, headers } = request;
    const userAgent = headers['user-agent'] || 'unknown';
    const ip = this.getClientIp(request);
    const requestId = headers['x-request-id'] as string || 
      `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const startTime = Date.now();

    this.logger.log(
      `[REQ] id=${requestId} ${method} ${url} ip=${ip} ua="${userAgent}"`,
    );

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          const statusCode = response?.statusCode ?? 200;
          this.logger.log(
            `[RES] id=${requestId} ${method} ${url} status=${statusCode} duration=${duration}ms`,
          );
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          const statusCode = error?.status ?? response?.statusCode ?? 500;
          const message = error?.message ?? 'Unknown error';
          this.logger.error(
            `[ERR] id=${requestId} ${method} ${url} status=${statusCode} duration=${duration}ms message="${message}"`,
            error?.stack,
          );
        },
      }),
    );
  }

  private getClientIp(request: any): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (forwarded) {
      return (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',')[0].trim();
    }
    return request.ip || request.socket?.remoteAddress || 'unknown';
  }
}
