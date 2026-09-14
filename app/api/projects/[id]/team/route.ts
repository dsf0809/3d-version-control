import { team, invite, removeMember, revokeInvite } from '@/lib/projects/team';
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
      await team(projectStore(), ownerOf(request), (await context.params).id),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    const actor = ownerOf(request),
      id = (await context.params).id,
      body = await readBody(request),
      store = projectStore();
    if (body.action === 'invite')
      return json(await invite(store, actor, id, body.role));
    if (body.action === 'remove')
      await removeMember(store, actor, id, body.userId);
    else if (body.action === 'revoke')
      await revokeInvite(store, actor, id, body.id);
    else throw new HttpError(400, 'Unknown team action.');
    return json(await team(store, actor, id));
  } catch (e) {
    return failure(e);
  }
}
