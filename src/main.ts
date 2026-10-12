import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe, VersioningType, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from '@fastify/helmet';
import compress from '@fastify/compress';
import cors from '@fastify/cors';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: process.env.NODE_ENV === 'development',
      bodyLimit: 10485760, // 10MB
      routerOptions: {
        caseSensitive: false,
      },
    }),
    {
      logger:
        process.env.NODE_ENV === 'production'
          ? ['error', 'warn', 'log']
          : ['error', 'warn', 'log', 'debug', 'verbose'],
    }
  );

  const configService = app.get(ConfigService);
  const env = configService.get<string>('NODE_ENV') || 'development';
  const port = configService.get<number>('PORT') || 4000;

  // Security: Helmet for secure HTTP headers
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  });

  // Performance: Compression for responses
  await app.register(compress, {
    global: true,
    encodings: ['gzip', 'deflate', 'br'],
    threshold: 1024, // Compress responses > 1KB
  });

  // Security: CORS configuration (supports comma-separated origins)
  const rawOrigins = configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
  const allowedOrigins = rawOrigins
    .split(',')
    .map((o) => o.trim().replace(/["'\s]+/g, ''))
    .filter(Boolean);

  await app.register(cors, {
    origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    maxAge: 86400, // 24 hours
  });

  // Global prefix: all routes are under /api
  app.setGlobalPrefix('api');

  // API Versioning
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Global Validation Pipe with strict settings
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip unknown properties
      forbidNonWhitelisted: true, // Throw error on unknown properties
      transform: true, // Auto-transform payloads to DTO instances
      transformOptions: {
        enableImplicitConversion: true,
      },
      disableErrorMessages: env === 'production', // Hide detailed errors in production
    })
  );

  // Global Exception Filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global Interceptors
  app.useGlobalInterceptors(
    new TransformInterceptor(),
    new LoggingInterceptor()
  );

  // Swagger Documentation
  const { setupSwagger } = await import('./swagger/swagger.config');
  setupSwagger(app);
  logger.log(`📚 Swagger docs: http://0.0.0.0:${port}/api/v1/docs`);

  // Graceful shutdown
  app.enableShutdownHooks();

  await app.listen(port, '0.0.0.0');
  
  logger.log(`🚀 Application running on: http://0.0.0.0:${port}`);
  logger.log(`📊 Environment: ${env}`);
  logger.log(`🔒 Security headers: enabled`);
  logger.log(`📦 Compression: enabled`);
  logger.log(`⏱️  Rate limiting: enabled`);
}

bootstrap().catch((err) => {
  console.error('Failed to start application:', err);
  process.exit(1);
});
