import { projectStore } from '@/lib/projects/db';
import { json, failure, HttpError } from '@/lib/projects/http';
import {
  resolveConnection,
  sharingPolicy,
  usageToday,
} from '@/lib/projects/ai-credentials';
import { PROVIDERS } from '@/lib/ai-providers';
import { currentUser } from '@/lib/server/auth';
import { runtime } from '@/lib/server/runtime';
export async function GET(request: Request) {
  try {
    const user = await currentUser(request);
    if (!user) throw new HttpError(401, 'Sign in to access your projects.');
    const store = projectStore();
    const ai = await resolveConnection(store, user.id, runtime().secret);
    const limited = ai?.source === 'server' && user.role !== 'admin';
    const policy = limited ? await sharingPolicy(store) : null;
    return json({
      configured: !!ai,
      model: ai?.model ?? '',
      provider: ai ? PROVIDERS[ai.provider].label : '',
      source: ai?.source ?? null,
      remainingToday: policy
        ? Math.max(0, policy.dailyLimit - (await usageToday(store, user.id)))
        : null,
    });
  } catch (e) {
    return failure(e);
  }
}
