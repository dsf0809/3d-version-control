// Write a consistent copy of the database while the server is running.
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

if (existsSync('.env')) process.loadEnvFile('.env');
const dataDir = resolve(process.env.FORM_DATA_DIR || 'data');
const source = join(dataDir, 'form.db');
if (!existsSync(source)) {
  console.error(`No database at ${source}.`);
  process.exit(1);
}
const outDir = resolve(process.argv[2] || join(dataDir, 'backups'));
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const target = join(outDir, `form-${stamp}.db`);
const db = new DatabaseSync(source, { readOnly: true });
db.prepare('VACUUM INTO ?').run(target);
db.close();
// The encryption secret is needed to read saved API keys after a restore.
const secret = join(dataDir, 'secret.key');
if (existsSync(secret))
  copyFileSync(secret, join(outDir, `secret-${stamp}.key`));
console.log(`Backup written to ${target}`);
