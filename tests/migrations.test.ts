import { expect, test } from 'vitest';
import { readFile } from 'node:fs/promises';
import { database } from './database';

test('todas las migraciones se aplican en PostgreSQL', async () => {
  const db = await database();
  try {
    await db.exec(await readFile('scripts/verify-permissions.sql', 'utf8'));
    const result = await db.query<{ count: number }>(
      "select count(*)::int as count from pg_tables where schemaname='public'",
    );
    expect(result.rows[0]?.count).toBeGreaterThan(20);
  } finally {
    await db.close();
  }
});
