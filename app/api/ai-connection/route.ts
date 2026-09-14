import { projectStore } from '@/lib/projects/db';
import { ownerOf, readBody, json, failure, HttpError } from '@/lib/projects/http';
import { saveCredential } from '@/lib/projects/ai-credentials';
export async function POST(request: Request) {
  try {
    const owner = ownerOf(request);
    const body = await readBody(request, 2048) as {key?:unknown};
    if (typeof body.key !== 'string') throw new HttpError(400, 'Enter your API key.');
    await saveCredential(projectStore(), owner, body.key, process.env.AI_KEY_ENCRYPTION_SECRET || '');
    return json({saved:true});
  } catch (e) { return failure(e); }
}
