import { prepareMerge } from '@/lib/projects/merge';
import { projectStore } from '@/lib/projects/db';
import { ownerOf, readBody, json, failure } from '@/lib/projects/http';
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    return json(
      await prepareMerge(
        projectStore(),
        ownerOf(request),
        (await context.params).id,
        await readBody(request),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
