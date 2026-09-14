import { join } from '@/lib/projects/team';
import { projectStore } from '@/lib/projects/db';
import { ownerOf, readBody, json, failure } from '@/lib/projects/http';
export async function POST(request: Request) {
  try {
    return json(
      await join(
        projectStore(),
        ownerOf(request),
        (await readBody(request)).token,
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
