import { projectStore } from '@/lib/projects/db';
import { getRevision } from '@/lib/projects/revisions';
import { json, failure } from '@/lib/projects/http';
import { ownerOf } from '@/lib/server/auth';
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; revisionId: string }> },
) {
  try {
    const p = await context.params;
    return json(
      await getRevision(projectStore(), await ownerOf(request), p.id, p.revisionId),
    );
  } catch (e) {
    return failure(e);
  }
}
