import { env } from 'cloudflare:workers';
import { ProjectStore } from './store';
export function projectStore() {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) throw new Error('Project database is not configured.');
  return new ProjectStore(db);
}
