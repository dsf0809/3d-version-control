import { prepareMerge } from '@/lib/projects/merge';
import { projectStore } from '@/lib/projects/db';
import { readBody, json, failure } from '@/lib/projects/http';
import { ownerOf } from '@/lib/server/auth';
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    return json(
      await prepareMerge(
        projectStore(),
        await ownerOf(request),
        (await context.params).id,
        await readBody(request),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
