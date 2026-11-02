import { json, failure } from '@/lib/projects/http';
import { accounts, currentUser } from '@/lib/server/auth';
export async function GET(request: Request) {
  try {
    const a = accounts();
    return json({
      user: await currentUser(request),
      setupRequired: (await a.count()) === 0,
      signupOpen: !!(await a.joinCode()),
    });
  } catch (e) {
    return failure(e);
  }
}
