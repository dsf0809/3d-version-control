import { projectStore } from '@/lib/projects/db';
import { ownerOf, json, failure } from '@/lib/projects/http';
import { messagePage } from '@/lib/projects/messages';
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const q = new URL(request.url).searchParams;
    return json(
      await messagePage(
        projectStore(),
        ownerOf(request),
        (await context.params).id,
        q.get('branch') || '',
        q.has('before') ? Number(q.get('before')) : undefined,
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
