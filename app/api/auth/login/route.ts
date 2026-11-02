import { readBody, failure } from '@/lib/projects/http';
import {
  accounts,
  checkRateLimit,
  clearRateLimit,
  clientAddress,
} from '@/lib/server/auth';
import { signedIn } from '@/lib/server/auth-routes';
export async function POST(request: Request) {
  try {
    const body = await readBody(request, 4096);
    const key = `${clientAddress(request)}:${String(body.username ?? '').toLowerCase()}`;
    checkRateLimit(key);
    const user = await accounts().login(body.username, body.password);
    clearRateLimit(key);
    return signedIn(request, user);
  } catch (e) {
    return failure(e);
  }
}
