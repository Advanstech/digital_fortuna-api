import { Module, Global, OnModuleDestroy, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { Sql, Options } from 'postgres';
import * as schema from './schema';

const postgres = require('postgres') as (url: string, options?: Options<any>) => Sql<any>;

export const DRIZZLE_DB = 'DRIZZLE_DB';
export const POSTGRES_CLIENT = 'POSTGRES_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: POSTGRES_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const databaseUrl = configService.get<string>('DATABASE_URL')!;
        const maxConnections = configService.get<number>('DB_MAX_CONNECTIONS') || 20;
        
        // Connection pooling for high performance
        return postgres(databaseUrl, {
          max: maxConnections,
          idle_timeout: 20, // Close idle connections after 20s
          connect_timeout: 10, // Connection timeout
          prepare: false, // Disable prepared statements for connection pooling compatibility
          // Only force SSL behaviour when configured; otherwise honour the URL's sslmode (e.g. Neon requires SSL)
          ...(configService.get<string>('DB_SSL') === 'true' ? { ssl: { rejectUnauthorized: false } } : {}),
          onnotice: () => {}, // Suppress NOTICE messages
          debug: configService.get<string>('DB_DEBUG') === 'true',
        });
      },
    },
    {
      provide: DRIZZLE_DB,
      inject: [POSTGRES_CLIENT],
      useFactory: (queryClient: Sql<any>) => {
        return drizzle(queryClient, { 
          schema,
          logger: process.env.NODE_ENV === 'development',
        });
      },
    },
  ],
  exports: [DRIZZLE_DB, POSTGRES_CLIENT],
})
export class DbModule implements OnModuleDestroy {
  private readonly logger = new Logger(DbModule.name);

  constructor(@Inject(POSTGRES_CLIENT) private readonly sql: Sql<any>) {}

  async onModuleDestroy() {
    this.logger.log('Closing database connections...');
    await this.sql.end({ timeout: 5 });
    this.logger.log('Database connections closed');
  }
}
