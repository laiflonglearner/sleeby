import journal from '@sleeby/data/migrations/meta/_journal.json';
import { migrations } from './migrate';

jest.mock('drizzle-orm/expo-sqlite', () => ({ drizzle: jest.fn() }));
jest.mock('drizzle-orm/expo-sqlite/migrator', () => ({ migrate: jest.fn() }));

it('bundles every shared migration in journal order', () => {
  expect(Object.keys(migrations).sort()).toEqual(
    journal.entries.map((entry) => `m${entry.idx.toString().padStart(4, '0')}`),
  );
  for (const sql of Object.values(migrations)) {
    expect(typeof sql).toBe('string');
    expect(sql.trim().length).toBeGreaterThan(0);
  }
});
