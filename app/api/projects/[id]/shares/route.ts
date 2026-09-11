import { projectStore } from '@/lib/projects/db';
import {
  ownerOf,
  readBody,
  json,
  failure,
  HttpError,
} from '@/lib/projects/http';
import { listShares, createShare, revokeShare } from '@/lib/projects/shares';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    return json(
      await listShares(
        projectStore(),
        ownerOf(request),
        (await context.params).id,
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    const store = projectStore(),
      owner = ownerOf(request),
      id = (await context.params).id,
      body = await readBody(request);
    if (body.action === 'create')
      return json(
        await createShare(store, owner, id, body.revisionId, body.allowExport),
        201,
      );
    if (body.action === 'revoke') {
      await revokeShare(store, owner, id, body.id);
      return json({ ok: true });
    }
    throw new HttpError(400, 'Unknown sharing action.');
  } catch (e) {
    return failure(e);
  }
}
