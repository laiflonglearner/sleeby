import type { SQLiteDatabase, SQLiteValue } from '@sleeby/data';

interface ExecuteResult {
  getFirstSync(): Record<string, unknown> | null;
  getAllSync(): Record<string, unknown>[];
  resetSync(): void;
}

interface NativeStatement {
  executeSync(...parameters: SQLiteValue[]): ExecuteResult;
  finalizeSync(): void;
}

/** The expo-sqlite connection methods this adapter wraps. */
export interface NativeConnection {
  execSync(sql: string): void;
  prepareSync(sql: string): NativeStatement;
}

/** Wraps expo-sqlite in the synchronous port that `SleebyRepository` takes. */
export function toRepositoryPort(db: NativeConnection): SQLiteDatabase {
  const run = <T>(
    sql: string,
    parameters: SQLiteValue[],
    read: (result: ExecuteResult) => T,
  ): T => {
    const statement = db.prepareSync(sql);
    try {
      const result = statement.executeSync(...parameters);
      try {
        return read(result);
      } finally {
        result.resetSync();
      }
    } finally {
      statement.finalizeSync();
    }
  };
  return {
    exec: (sql) => db.execSync(sql),
    prepare: (sql) => ({
      run: (...p) => run(sql, p, () => undefined),
      get: (...p) => run(sql, p, (r) => r.getFirstSync() ?? undefined),
      all: (...p) => run(sql, p, (r) => r.getAllSync()),
    }),
  };
}
