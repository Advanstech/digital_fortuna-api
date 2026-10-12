import { Injectable, Inject, Logger } from '@nestjs/common';
import { DRIZZLE_DB } from '../db/db.module';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

export interface CreateNotificationInput {
  userId: string;
  type: 'kyc' | 'deal' | 'offer' | 'payment' | 'listing' | 'system' | string;
  title: string;
  body?: string;
  link?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(@Inject(DRIZZLE_DB) private db: PostgresJsDatabase<typeof schema>) {}

  /** Create a notification for a user. Never throws — notification failures must not break business flows. */
  async notify(input: CreateNotificationInput) {
    try {
      const inserted = await this.db
        .insert(schema.notifications)
        .values({
          userId: input.userId,
          type: input.type,
          title: input.title,
          body: input.body,
          link: input.link,
          metadata: input.metadata,
        })
        .returning();
      return inserted[0];
    } catch (err) {
      this.logger.error(`Failed to create notification for user ${input.userId}: ${err}`);
      return null;
    }
  }

  async listForUser(userId: string, limit = 50) {
    return this.db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.userId, userId))
      .orderBy(desc(schema.notifications.createdAt))
      .limit(limit);
  }

  async unreadCount(userId: string) {
    const rows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.notifications)
      .where(and(eq(schema.notifications.userId, userId), eq(schema.notifications.read, false)));
    return rows[0]?.count ?? 0;
  }

  async markRead(userId: string, notificationId: string) {
    await this.db
      .update(schema.notifications)
      .set({ read: true })
      .where(and(eq(schema.notifications.id, notificationId), eq(schema.notifications.userId, userId)));
    return { success: true };
  }

  async markAllRead(userId: string) {
    await this.db
      .update(schema.notifications)
      .set({ read: true })
      .where(eq(schema.notifications.userId, userId));
    return { success: true };
  }
}
