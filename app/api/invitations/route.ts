import { join } from '@/lib/projects/team';
import { projectStore } from '@/lib/projects/db';
import { readBody, json, failure } from '@/lib/projects/http';
import { ownerOf } from '@/lib/server/auth';
export async function POST(request: Request) {
  try {
    return json(
      await join(
        projectStore(),
        await ownerOf(request),
        (await readBody(request)).token,
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
