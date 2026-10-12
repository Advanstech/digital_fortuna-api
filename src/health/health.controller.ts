import { Controller, Get, Version } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthCheckResult,
} from '@nestjs/terminus';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { DatabaseHealthIndicator } from './indicators/database.health';
import { RedisHealthIndicator } from './indicators/redis.health';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private database: DatabaseHealthIndicator,
    private redis: RedisHealthIndicator,
  ) {}

  @Public()
  @Get()
  @Version('1')
  @HealthCheck()
  @ApiOperation({ summary: 'Check application health status' })
  @ApiResponse({
    status: 200,
    description: 'Application is healthy',
    schema: {
      example: {
        status: 'ok',
        info: {
          database: { status: 'up' },
          redis: { status: 'up' },
        },
        error: {},
        details: {
          database: { status: 'up' },
          redis: { status: 'up' },
        },
      },
    },
  })
  @ApiResponse({ status: 503, description: 'Application is unhealthy' })
  async check(): Promise<HealthCheckResult> {
    const checks = [() => this.database.isHealthy('database')];
    // Only check Redis if a Redis URL is configured; otherwise treat as skipped/optional
    if (process.env.REDIS_URL) {
      checks.push(() => this.redis.isHealthy('redis'));
    }
    return this.health.check(checks);
  }

  @Public()
  @Get('liveness')
  @Version('1')
  @ApiOperation({ summary: 'Kubernetes liveness probe' })
  liveness(): { status: string } {
    return { status: 'alive' };
  }

  @Public()
  @Get('readiness')
  @Version('1')
  @HealthCheck()
  @ApiOperation({ summary: 'Kubernetes readiness probe' })
  async readiness(): Promise<HealthCheckResult> {
    const checks = [() => this.database.isHealthy('database')];
    if (process.env.REDIS_URL) {
      checks.push(() => this.redis.isHealthy('redis'));
    }
    return this.health.check(checks);
  }
}
