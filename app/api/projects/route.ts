import { projectSnapshot } from '@/lib/projects/revisions';
import { projectStore } from '@/lib/projects/db';
import {
  ownerOf,
  readBody,
  json,
  failure,
  HttpError,
} from '@/lib/projects/http';
export async function GET(request: Request) {
  try {
    return json(await projectStore().list(ownerOf(request)));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const owner = ownerOf(request),
      body = await readBody(request, 2000000);
    const store = projectStore();
    const respond = async (p: import('@/lib/projects/types').ProjectDetail) =>
      json(
        await projectSnapshot(store, owner, p.id, {
          branchId: p.activeBranchId,
          revisionId: p.selectedRevisionId,
        }),
        201,
      );
    if (body?.action === 'demo') return respond(await store.demo(owner));
    if (
      body.importKey != null &&
      (typeof body.importKey !== 'string' || body.importKey.length > 100)
    )
      throw new HttpError(400, 'Invalid import identifier.');
    return respond(
      await store.create(owner, body, body.legacy, body.importKey),
    );
  } catch (e) {
    return failure(e);
  }
}
