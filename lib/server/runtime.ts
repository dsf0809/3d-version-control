import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { openDatabase, type SqliteDatabase } from './sqlite';
import { JobRunner } from './jobs';

export type ServerConfig = {
  dataDir: string;
  dbPath: string;
  migrationsDir: string;
};
export type Runtime = {
  config: ServerConfig;
  db: SqliteDatabase;
  secret: string;
  jobs: JobRunner;
};

export function serverConfig(): ServerConfig {
  const dataDir = resolve(process.env.FORM_DATA_DIR || 'data');
  return {
    dataDir,
    dbPath: join(dataDir, 'form.db'),
    migrationsDir: resolve(process.env.FORM_MIGRATIONS_DIR || 'drizzle'),
  };
}

function loadEnv() {
  // Values already present in the environment take precedence over .env.
  if (existsSync('.env')) {
    try {
      process.loadEnvFile('.env');
    } catch {}
  }
}

/** The previous Wrangler/Miniflare database, if this checkout has one. */
export function legacyDatabase() {
  const dir = resolve('.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
  if (!existsSync(dir)) return null;
  const file = readdirSync(dir).find(
    (f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite',
  );
  return file ? join(dir, file) : null;
}

/** Copy the earlier local database once; the original file is left untouched. */
function importLegacy(dbPath: string) {
  const legacy = legacyDatabase();
  if (!legacy || process.env.FORM_SKIP_LEGACY_IMPORT) return;
  const source = new DatabaseSync(legacy, { readOnly: true });
  try {
    source.prepare('VACUUM INTO ?').run(dbPath);
    console.log(`  Imported existing projects from ${legacy}`);
  } finally {
    source.close();
  }
}

function secretFor(dataDir: string) {
  const env = process.env.AI_KEY_ENCRYPTION_SECRET;
  if (env && env.length >= 32) return env;
  const file = join(dataDir, 'secret.key');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  const secret = randomBytes(48).toString('hex');
  writeFileSync(file, secret + '\n', { mode: 0o600 });
  return secret;
}

function boot(): Runtime {
  loadEnv();
  const config = serverConfig();
  mkdirSync(config.dataDir, { recursive: true });
  if (!existsSync(config.dbPath)) importLegacy(config.dbPath);
  const db = openDatabase(config.dbPath, config.migrationsDir);
  const secret = secretFor(config.dataDir);
  const jobs = new JobRunner(db, secret);
  if (!process.env.FORM_DISABLE_JOBS) jobs.start();
  return { config, db, secret, jobs };
}

const KEY = Symbol.for('form.runtime');
type Holder = { [KEY]?: Runtime };
/** One database connection and job runner per server process. */
export function runtime(): Runtime {
  const g = globalThis as Holder;
  return (g[KEY] ??= boot());
}
