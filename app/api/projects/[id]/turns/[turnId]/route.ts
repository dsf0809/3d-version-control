import { failure, json, ownerOf } from '@/lib/projects/http';
import { jobFor } from '@/lib/projects/jobs-binding';
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; turnId: string }> },
) {
  try {
    const p = await context.params;
    return json(
      await jobFor(ownerOf(request), p.turnId).status(ownerOf(request), p.id),
    );
  } catch (e) {
    return failure(e);
  }
}
