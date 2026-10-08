import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import type { SQLiteDatabase } from 'expo-sqlite';
import journal from '@sleeby/data/migrations/meta/_journal.json';
// The inline-import plugin resolves these relative to this file, not by package name.
import m0000 from '../../../../packages/data/migrations/0000_overrated_cargill.sql';
import m0001 from '../../../../packages/data/migrations/0001_immutable_history.sql';

// Add a line here when a migration is added to @sleeby/data. The test checks the journal.
export const migrations = { m0000, m0001 };

/** Runs the shared migrations after the key is set, never before. */
export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  await migrate(drizzle(db), { journal, migrations });
}
