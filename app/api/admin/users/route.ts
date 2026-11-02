import { readBody, json, failure } from '@/lib/projects/http';
import { accounts, requireAdmin } from '@/lib/server/auth';
export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    return json(await accounts().list());
  } catch (e) {
    return failure(e);
  }
}
/** Create an account with a temporary password the person changes on first sign-in. */
export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const body = await readBody(request, 4096);
    return json(
      await accounts().create(body, {
        role: body.role === 'admin' ? 'admin' : 'member',
        mustChangePassword: true,
      }),
      201,
    );
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin(request);
    await accounts().update(admin, await readBody(request, 4096));
    return json(await accounts().list());
  } catch (e) {
    return failure(e);
  }
}
