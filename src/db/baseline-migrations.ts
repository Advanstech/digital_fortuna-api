import 'dotenv/config';
import postgres from 'postgres';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

/**
 * One-time baseline for databases that were provisioned WITHOUT drizzle-kit
 * migrate (e.g. via db push or manual DDL). Such DBs have an empty
 * drizzle.__drizzle_migrations table, so `db:migrate` tries to replay every
 * migration from 0000 and fails on the first existing table.
 *
 * What it does:
 *   1. If migrations are already recorded -> no-op.
 *   2. Applies each journal migration whose `when` is newer than the newest
 *      applied row, but ONLY the last one if the history is empty (the DB is
 *      assumed to already contain everything from earlier pushes).
 *   3. Records the applied migrations' hashes so `db:migrate` works normally
 *      from now on.
 *
 * Usage:
 *   pnpm db:baseline                        # uses DATABASE_URL from .env
 *   DATABASE_URL=postgres://... pnpm db:baseline   # any environment
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  const sql = postgres(url, { max: 2 });
  const migrationsFolder = path.join(__dirname, '..', '..', 'drizzle');
  const journal = JSON.parse(
    fs.readFileSync(path.join(migrationsFolder, 'meta', '_journal.json')).toString(),
  );

  await sql`CREATE SCHEMA IF NOT EXISTS "drizzle"`;
  await sql`CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
    id SERIAL PRIMARY KEY,
    hash text NOT NULL,
    created_at bigint
  )`;

  const applied = await sql`
    SELECT created_at FROM "drizzle"."__drizzle_migrations"
    ORDER BY created_at DESC LIMIT 1`;
  const lastApplied = applied.length ? Number(applied[0].created_at) : null;

  if (lastApplied !== null && lastApplied >= journal.entries[journal.entries.length - 1].when) {
    console.log('Migrations already up to date. Nothing to do.');
    await sql.end();
    return;
  }

  // Empty history on a drifted DB: only apply the newest migration and record it.
  // Older migrations are assumed already applied (schema was pushed, not migrated).
  const entries = lastApplied === null
    ? journal.entries.slice(-1)
    : journal.entries.filter((e: any) => e.when > lastApplied);

  for (const entry of entries) {
    const file = path.join(migrationsFolder, `${entry.tag}.sql`);
    const query = fs.readFileSync(file).toString();
    const hash = crypto.createHash('sha256').update(query).digest('hex');
    const stmts = query.split('--> statement-breakpoint').map((s: string) => s.trim()).filter(Boolean);

    await sql.begin(async (tx) => {
      for (const stmt of stmts) {
        await tx.unsafe(stmt);
      }
      await tx`INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
               VALUES (${hash}, ${entry.when})`;
    });
    console.log(`Applied + recorded ${entry.tag}`);
  }

  await sql.end();
  console.log('Baseline complete. `pnpm db:migrate` is now a no-op until the next migration.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
