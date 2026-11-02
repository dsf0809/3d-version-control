import { failure, json } from '@/lib/projects/http';
import { ownerOf } from '@/lib/server/auth';
import { jobFor } from '@/lib/projects/jobs-binding';
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; turnId: string }> },
) {
  try {
    const p = await context.params;
    return json(
      await jobFor(await ownerOf(request), p.turnId).status(await ownerOf(request), p.id),
    );
  } catch (e) {
    return failure(e);
  }
}
