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
    if (body?.action === 'demo')
      return json(await projectStore().demo(owner), 201);
    if (
      body.importKey != null &&
      (typeof body.importKey !== 'string' || body.importKey.length > 100)
    )
      throw new HttpError(400, 'Invalid import identifier.');
    return json(
      await projectStore().create(owner, body, body.legacy, body.importKey),
      201,
    );
  } catch (e) {
    return failure(e);
  }
}
