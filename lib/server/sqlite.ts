import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** The subset of the D1 query API the project store relies on. */
export type SqlResult<T = Record<string, unknown>> = {
  results: T[];
  success: true;
  meta: { changes: number; last_row_id: number };
};
export interface SqlStatement {
  bind(...args: unknown[]): SqlStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<SqlResult<T>>;
  run<T = Record<string, unknown>>(): Promise<SqlResult<T>>;
}
export interface SqlDatabase {
  prepare(sql: string): SqlStatement;
  batch<T = Record<string, unknown>>(
    stmts: SqlStatement[],
  ): Promise<SqlResult<T>[]>;
}

const toValue = (v: unknown): SQLInputValue =>
  v === undefined
    ? null
    : typeof v === 'boolean'
      ? Number(v)
      : (v as SQLInputValue);

class Statement implements SqlStatement {
  constructor(
    private sqlite: DatabaseSync,
    private sql: string,
    private args: SQLInputValue[] = [],
  ) {}
  bind(...args: unknown[]) {
    return new Statement(this.sqlite, this.sql, args.map(toValue));
  }
  execute<T>(): SqlResult<T> {
    const stmt = this.sqlite.prepare(this.sql);
    if (stmt.columns().length) {
      const results = stmt.all(...this.args) as T[];
      // Writes with RETURNING report one change per returned row.
      const changes = /^\s*(select|with|pragma)\b/i.test(this.sql)
        ? 0
        : results.length;
      return { results, success: true, meta: { changes, last_row_id: 0 } };
    }
    const r = stmt.run(...this.args);
    return {
      results: [],
      success: true,
      meta: {
        changes: Number(r.changes),
        last_row_id: Number(r.lastInsertRowid),
      },
    };
  }
  async first<T>() {
    return (this.execute<T>().results[0] ?? null) as T | null;
  }
  async all<T>() {
    return this.execute<T>();
  }
  async run<T>() {
    return this.execute<T>();
  }
}

/** D1-compatible wrapper over node:sqlite; batches run in one transaction. */
export class SqliteDatabase implements SqlDatabase {
  constructor(public sqlite: DatabaseSync) {}
  prepare(sql: string) {
    return new Statement(this.sqlite, sql);
  }
  async batch<T = Record<string, unknown>>(stmts: SqlStatement[]) {
    return this.transaction(() =>
      stmts.map((s) => (s as Statement).execute<T>()),
    );
  }
  transaction<T>(fn: () => T): T {
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.sqlite.exec('COMMIT');
      return result;
    } catch (e) {
      this.sqlite.exec('ROLLBACK');
      throw e;
    }
  }
  close() {
    this.sqlite.close();
  }
}

/** Apply drizzle/*.sql files once each, recording them like D1 does. */
export function migrate(sqlite: DatabaseSync, dir: string) {
  sqlite.exec(
    'CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL)',
  );
  const applied = new Set(
    (
      sqlite.prepare('SELECT name FROM d1_migrations').all() as {
        name: string;
      }[]
    ).map((r) => r.name),
  );
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    sqlite.exec('BEGIN');
    try {
      sqlite.exec(readFileSync(join(dir, file), 'utf8'));
      sqlite.prepare('INSERT INTO d1_migrations(name) VALUES (?)').run(file);
      sqlite.exec('COMMIT');
    } catch (e) {
      sqlite.exec('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${(e as Error).message}`);
    }
  }
}

export function openDatabase(path: string, migrationsDir: string) {
  const sqlite = new DatabaseSync(path);
  if (path !== ':memory:') sqlite.exec('PRAGMA journal_mode=WAL');
  sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000');
  if (!existsSync(migrationsDir))
    throw new Error(`Migrations folder not found: ${migrationsDir}`);
  migrate(sqlite, migrationsDir);
  return new SqliteDatabase(sqlite);
}
