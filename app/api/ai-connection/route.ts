import { projectStore } from '@/lib/projects/db';
import { readBody, json, failure } from '@/lib/projects/http';
import {
  connectionSummary,
  deleteConnection,
  saveConnection,
  serverConnection,
  sharingPolicy,
} from '@/lib/projects/ai-credentials';
import { PROVIDERS } from '@/lib/ai-providers';
import { currentUser, ownerOf } from '@/lib/server/auth';
import { runtime } from '@/lib/server/runtime';
const customUrls = (admin: boolean) =>
  admin || process.env.FORM_ALLOW_CUSTOM_AI_URLS === '1';
export async function GET(request: Request) {
  try {
    const user = await currentUser(request);
    const owner = await ownerOf(request);
    const store = projectStore();
    const host = await serverConnection(store, runtime().secret);
    const policy = await sharingPolicy(store);
    return json({
      providers: Object.values(PROVIDERS).map(
        ({
          id,
          label,
          defaultModel,
          modelHint,
          keyRequired,
          keyHint,
          customUrl,
          baseUrl,
        }) => ({
          id,
          label,
          defaultModel,
          modelHint,
          keyRequired,
          keyHint,
          customUrl,
          baseUrl,
        }),
      ),
      personal: await connectionSummary(store, owner),
      shared:
        host && policy.shared
          ? {
              provider: PROVIDERS[host.provider].label,
              model: host.model,
              dailyLimit: policy.dailyLimit,
            }
          : null,
      canSetEndpoint: customUrls(user?.role === 'admin'),
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const user = await currentUser(request);
    const owner = await ownerOf(request);
    const body = await readBody(request, 4096);
    await saveConnection(
      projectStore(),
      owner,
      body,
      runtime().secret,
      customUrls(user?.role === 'admin'),
    );
    return json({ saved: true });
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(request: Request) {
  try {
    await deleteConnection(projectStore(), await ownerOf(request));
    return json({ removed: true });
  } catch (e) {
    return failure(e);
  }
}
