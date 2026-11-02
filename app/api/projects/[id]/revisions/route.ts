import { projectStore } from '@/lib/projects/db';
import { revisionPage } from '@/lib/projects/revisions';
import { json, failure } from '@/lib/projects/http';
import { ownerOf } from '@/lib/server/auth';
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const q = new URL(request.url).searchParams;
    return json(
      await revisionPage(
        projectStore(),
        await ownerOf(request),
        (await context.params).id,
        q.has('before') ? Number(q.get('before')) : undefined,
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
