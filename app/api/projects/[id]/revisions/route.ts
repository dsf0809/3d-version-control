import { projectStore } from '@/lib/projects/db';
import { revisionPage } from '@/lib/projects/revisions';
import { ownerOf, json, failure } from '@/lib/projects/http';
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const q = new URL(request.url).searchParams;
    return json(
      await revisionPage(
        projectStore(),
        ownerOf(request),
        (await context.params).id,
        q.has('before') ? Number(q.get('before')) : undefined,
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
