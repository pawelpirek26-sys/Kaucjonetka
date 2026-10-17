// Db implementation on top of Node's built-in SQLite, so repository SQL is tested for real.
import type { Db, SqlValue } from '@/lib/db/types';

type Statement = { run(...p: SqlValue[]): { changes: number | bigint; lastInsertRowid: number | bigint }; get(...p: SqlValue[]): unknown; all(...p: SqlValue[]): unknown[] };
type DatabaseSync = { exec(sql: string): void; prepare(sql: string): Statement; close(): void };

export function createTestDb(): Db & { close(): void } {
  // process.getBuiltinModule bypasses Jest's resolver, which does not know node:sqlite.
  const { DatabaseSync } = (process as unknown as { getBuiltinModule(id: string): { DatabaseSync: new (path: string) => DatabaseSync } })
    .getBuiltinModule('node:sqlite');
  const sqlite = new DatabaseSync(':memory:');
  const plain = <T>(row: unknown): T => (row ? ({ ...(row as object) } as T) : (row as T));

  return {
    async execAsync(sql) {
      sqlite.exec(sql);
    },
    async runAsync(sql, ...params) {
      const r = sqlite.prepare(sql).run(...params);
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    async getFirstAsync<T>(sql: string, ...params: SqlValue[]) {
      return plain<T>(sqlite.prepare(sql).get(...params)) ?? null;
    },
    async getAllAsync<T>(sql: string, ...params: SqlValue[]) {
      return sqlite.prepare(sql).all(...params).map((r) => plain<T>(r));
    },
    async withTransactionAsync(task) {
      sqlite.exec('begin');
      try {
        await task();
        sqlite.exec('commit');
      } catch (e) {
        sqlite.exec('rollback');
        throw e;
      }
    },
    close: () => sqlite.close(),
  };
}
