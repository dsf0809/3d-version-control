import { readBody, json, failure, assertSameOrigin } from '@/lib/projects/http';
import { requireAdmin } from '@/lib/server/auth';
import { projectStore } from '@/lib/projects/db';
import {
  SERVER_OWNER,
  connectionSummary,
  deleteConnection,
  envConnection,
  saveConnection,
} from '@/lib/projects/ai-credentials';
import { runtime } from '@/lib/server/runtime';
const summary = async () => {
  const env = envConnection();
  return {
    saved: await connectionSummary(projectStore(), SERVER_OWNER),
    environment: env ? { provider: env.provider, model: env.model } : null,
  };
};
export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    return json(await summary());
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    await saveConnection(
      projectStore(),
      SERVER_OWNER,
      await readBody(request, 4096),
      runtime().secret,
      true,
    );
    return json(await summary());
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(request: Request) {
  try {
    await requireAdmin(request);
    assertSameOrigin(request);
    await deleteConnection(projectStore(), SERVER_OWNER);
    return json(await summary());
  } catch (e) {
    return failure(e);
  }
}
