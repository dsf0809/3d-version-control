import {
  chargeSharedUsage,
  resolveConnection,
  sharingPolicy,
} from '@/lib/projects/ai-credentials';
import { jobFor } from '@/lib/projects/jobs-binding';
import { validateTurn } from '@/lib/projects/store';
import { projectStore } from '@/lib/projects/db';
import { readBody, json, failure, HttpError } from '@/lib/projects/http';
import { currentUser } from '@/lib/server/auth';
import { runtime } from '@/lib/server/runtime';
export async function POST(request: Request) {
  try {
    const user = await currentUser(request);
    if (!user) throw new HttpError(401, 'Sign in to access your projects.');
    const owner = user.id;
    const body = await readBody(request);
    const store = projectStore();
    const { secret, jobs } = runtime();
    const ai = await resolveConnection(store, owner, secret);
    if (!ai)
      throw new HttpError(
        503,
        'Open AI connection and add an API key to start chatting, or ask the server administrator to share one.',
      );
    const input = validateTurn(body);
    await store.assertBranchWrite(owner, input.projectId, input.branchId);
    // Retried requests with the same identifier are not charged twice.
    if (
      ai.source === 'server' &&
      user.role !== 'admin' &&
      !jobs.exists(owner, input.requestId)
    )
      await chargeSharedUsage(
        store,
        owner,
        (await sharingPolicy(store)).dailyLimit,
      );
    await jobFor(owner, input.requestId).enqueue(owner, input);
    return json({ queued: true, requestId: input.requestId }, 202);
  } catch (error) {
    return failure(error);
  }
}
