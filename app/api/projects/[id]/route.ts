import { projectStore } from '@/lib/projects/db';
import {
  ownerOf,
  readBody,
  json,
  failure,
  HttpError,
} from '@/lib/projects/http';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    return json(
      await projectStore().detail(ownerOf(request), (await context.params).id),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(request: Request, context: Context) {
  try {
    const owner = ownerOf(request),
      projectId = (await context.params).id,
      body = await readBody(request),
      store = projectStore();
    if (body.action === 'select')
      return json(
        await store.select(owner, projectId, body.branchId, body.revisionId),
      );
    if (body.action === 'fork')
      return json(
        await store.fork(owner, projectId, body.branchId, body.revisionId),
      );
    if (body.action === 'update')
      return json(await store.update(owner, projectId, body));
    throw new HttpError(400, 'Unknown project action.');
  } catch (e) {
    return failure(e);
  }
}
