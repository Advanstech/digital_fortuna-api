import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Inject } from '@nestjs/common';
import { DRIZZLE_DB } from '../db/db.module';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';

@Injectable()
export class KycGuard implements CanActivate {
  constructor(@Inject(DRIZZLE_DB) private db: PostgresJsDatabase<typeof schema>) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    
    if (!user || !user.userId) {
      throw new ForbiddenException('User not authenticated');
    }

    const users = await this.db
      .select({ kycStatus: schema.users.kycStatus })
      .from(schema.users)
      .where(eq(schema.users.id, user.userId))
      .limit(1);

    if (!users.length) {
      throw new ForbiddenException('User not found');
    }

    if (users[0].kycStatus !== 'verified') {
      throw new ForbiddenException(`KYC verification required. Current status: ${users[0].kycStatus}`);
    }

    return true;
  }
}
