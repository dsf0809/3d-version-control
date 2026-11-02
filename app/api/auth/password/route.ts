import { readBody, failure } from '@/lib/projects/http';
import { accounts, currentUser } from '@/lib/server/auth';
import { HttpError } from '@/lib/projects/http';
import { signedIn } from '@/lib/server/auth-routes';
export async function POST(request: Request) {
  try {
    const user = await currentUser(request);
    if (!user) throw new HttpError(401, 'Sign in to continue.');
    const body = await readBody(request, 4096);
    await accounts().changePassword(user.id, body.current, body.next);
    // Other sessions were ended; keep this device signed in.
    return signedIn(request, { ...user, mustChangePassword: false });
  } catch (e) {
    return failure(e);
  }
}
