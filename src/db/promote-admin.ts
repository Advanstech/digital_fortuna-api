import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import * as schema from './schema';

const postgres = require('postgres') as (url: string, options?: any) => any;

/**
 * Promote an existing user to a staff role.
 * Usage: pnpm promote:admin <email> [role]
 *   role defaults to super_admin. Valid: admin, super_admin, broker, vc, legal, bank.
 */
async function main() {
  const email = process.argv[2];
  const roleArg = process.argv[3] || 'super_admin';
  const validRoles = ['admin', 'super_admin', 'broker', 'vc', 'legal', 'bank'];

  if (!email) {
    console.error('Usage: pnpm promote:admin <email> [role]');
    process.exit(1);
  }
  const role = roleArg === 'superadmin' || roleArg === 'root' ? 'super_admin' : roleArg;
  if (!validRoles.includes(role)) {
    console.error(`Invalid role "${roleArg}". Valid: ${validRoles.join(', ')}`);
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  const sql = postgres(url, { max: 2 });
  const db = drizzle(sql, { schema });

  const users = await db
    .select({ id: schema.users.id, email: schema.users.email, role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.email, email.toLowerCase()))
    .limit(1);

  if (!users.length) {
    console.error(`No user found with email ${email}`);
    await sql.end();
    process.exit(1);
  }

  await db
    .update(schema.users)
    .set({ role: role as any })
    .where(eq(schema.users.id, users[0].id));

  console.log(`Promoted ${users[0].email}: ${users[0].role} -> ${role}`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
