import { json } from '../projects/http';
import { accounts, sessionCookie, type User } from './auth';
/** Start a session for `user` and return it with the session cookie set. */
export async function signedIn(request: Request, user: User, status = 200) {
  const { token, expiresAt } = await accounts().createSession(user.id);
  const response = json({ user }, status);
  response.headers.append(
    'Set-Cookie',
    sessionCookie(request, token, expiresAt),
  );
  return response;
}
