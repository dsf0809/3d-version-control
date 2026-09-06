import { projectStore } from '@/lib/projects/db';
import {
  ownerOf,
  readBody,
  json,
  failure,
  HttpError,
} from '@/lib/projects/http';
import { runTurn } from '@/lib/projects/service';
export async function POST(request: Request) {
  try {
    const owner = ownerOf(request);
    const body = await readBody(request);
    const key = process.env.OPENAI_API_KEY;
    if (!key)
      throw new HttpError(
        503,
        'Connect an OpenAI API key on the server to start chatting. Open AI connection for setup instructions.',
      );
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(120000),
    ]);
    return json(
      await runTurn(
        projectStore(),
        owner,
        body,
        key,
        process.env.OPENAI_MODEL || 'gpt-6-astra',
        signal,
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
