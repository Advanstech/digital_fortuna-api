import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

interface ErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
  timestamp: string;
  path: string;
  requestId?: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<any>();
    const request = ctx.getRequest<any>();

    const requestId = request.headers['x-request-id'] as string || this.generateRequestId();
    const timestamp = new Date().toISOString();
    const path = request.url;

    let statusCode: number;
    let message: string | string[];
    let error: string;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse() as any;
      message = exceptionResponse.message || exceptionResponse;
      error = exceptionResponse.error || HttpStatus[statusCode] || 'Error';
    } else {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
      error = 'Internal Server Error';
    }

    // Log the error with context
    const logContext = {
      requestId,
      path,
      statusCode,
      message: Array.isArray(message) ? message.join(', ') : message,
      stack: exception instanceof Error ? exception.stack : undefined,
    };

    if (statusCode >= 500) {
      this.logger.error(logContext, 'Exception caught');
    } else if (statusCode >= 400) {
      this.logger.warn(logContext, 'Client error');
    }

    const errorResponse: ErrorResponse = {
      statusCode,
      message,
      error,
      timestamp,
      path,
      requestId,
    };

    // Send response
    response.status(statusCode).send(errorResponse);
  }

  private generateRequestId(): string {
    return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
