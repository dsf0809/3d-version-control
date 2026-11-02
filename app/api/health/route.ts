import { json, failure } from '@/lib/projects/http';
import { runtime } from '@/lib/server/runtime';
/** Opens the database and starts the job runner; used by the launcher and monitors. */
export async function GET() {
  try {
    runtime().db.sqlite.prepare('SELECT 1').get();
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
