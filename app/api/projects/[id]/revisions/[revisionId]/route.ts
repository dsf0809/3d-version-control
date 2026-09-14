import { projectStore } from '@/lib/projects/db';
import { getRevision } from '@/lib/projects/revisions';
import { ownerOf, json, failure } from '@/lib/projects/http';
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; revisionId: string }> },
) {
  try {
    const p = await context.params;
    return json(
      await getRevision(projectStore(), ownerOf(request), p.id, p.revisionId),
    );
  } catch (e) {
    return failure(e);
  }
}
