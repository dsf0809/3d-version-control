import { projectStore } from '@/lib/projects/db';
import { json, failure } from '@/lib/projects/http';
import { ownerOf } from '@/lib/server/auth';
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
        await ownerOf(request),
        (await context.params).id,
        q.get('branch') || '',
        q.has('before') ? Number(q.get('before')) : undefined,
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
