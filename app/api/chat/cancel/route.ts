import { projectStore } from '@/lib/projects/db';
import { readBody, json, failure } from '@/lib/projects/http';
import { ownerOf } from '@/lib/server/auth';
export async function POST(request: Request) {
  try {
    const owner = await ownerOf(request),
      body = await readBody(request);
    return json(await projectStore().cancel(owner, body));
  } catch (e) {
    return failure(e);
  }
}
