import { projectStore } from '@/lib/projects/db';
import { ownerOf, readBody, json, failure } from '@/lib/projects/http';
export async function POST(request: Request) {
  try {
    const owner = ownerOf(request),
      body = await readBody(request);
    return json(await projectStore().cancel(owner, body));
  } catch (e) {
    return failure(e);
  }
}
