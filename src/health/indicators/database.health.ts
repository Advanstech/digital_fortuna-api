import { Injectable, Inject } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { DRIZZLE_DB } from '../../db/db.module';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import * as schema from '../../db/schema';

@Injectable()
export class DatabaseHealthIndicator extends HealthIndicator {
  constructor(
    @Inject(DRIZZLE_DB) private db: PostgresJsDatabase<typeof schema>,
  ) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      // Execute a simple query to check database connectivity
      await this.db.execute(sql`SELECT 1`);
      
      return this.getStatus(key, true);
    } catch (error) {
      throw new HealthCheckError(
        'Database check failed',
        this.getStatus(key, false, { message: error instanceof Error ? error.message : 'Unknown error' }),
      );
    }
  }
}
