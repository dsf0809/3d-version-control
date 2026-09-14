import { readCredential } from '@/lib/projects/ai-credentials';
import { jobFor } from '@/lib/projects/jobs-binding';
import { validateTurn } from '@/lib/projects/store';
import { projectStore } from '@/lib/projects/db';
import {
  ownerOf,
  readBody,
  json,
  failure,
  HttpError,
} from '@/lib/projects/http';
export async function POST(request: Request) {
  try {
    const owner = ownerOf(request);
    const body = await readBody(request);
    const key = await readCredential(projectStore(), owner, process.env.AI_KEY_ENCRYPTION_SECRET || '', process.env.OPENAI_API_KEY || '');
    if (!key)
      throw new HttpError(
        503,
        'Open AI connection and apply your OpenAI API key to start chatting.',
      );
    const input = validateTurn(body);
    await projectStore().assertBranchWrite(
      owner,
      input.projectId,
      input.branchId,
    );
    await jobFor(owner, input.requestId).enqueue(owner, input);
    return json({ queued: true, requestId: input.requestId }, 202);
  } catch (error) {
    return failure(error);
  }
}
