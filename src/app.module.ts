import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { DbModule } from './db/db.module';
import { ListingsModule } from './listings/listings.module';
import { AiModule } from './ai/ai.module';
import { PaymentsModule } from './payments/payments.module';
import { DealsModule } from './deals/deals.module';
import { OffersModule } from './offers/offers.module';
import { InvoicesModule } from './invoices/invoices.module';
import { BrokersModule } from './brokers/brokers.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './health/health.module';
import { MailModule } from './mail/mail.module';

@Module({
  imports: [
    ConfigModule.forRoot({ 
      isGlobal: true,
      envFilePath: ['.env', '.env.local', '.env.production'],
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          name: 'default',
          ttl: config.get<number>('THROTTLE_TTL') || 60000, // 1 minute
          limit: config.get<number>('THROTTLE_LIMIT') || 100, // 100 requests per minute
        },
        {
          name: 'auth',
          ttl: 60000, // 1 minute
          limit: 10, // Stricter limit for auth endpoints
        },
        {
          name: 'ai',
          ttl: 60000, // 1 minute
          limit: 10, // Limit AI requests to prevent abuse
        },
      ],
    }),
    DbModule,
    RedisModule,
    AuthModule,
    ListingsModule,
    AiModule,
    PaymentsModule,
    DealsModule,
    OffersModule,
    InvoicesModule,
    BrokersModule,
    HealthModule,
    MailModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
