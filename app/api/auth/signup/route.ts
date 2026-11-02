import { readBody, failure } from '@/lib/projects/http';
import { accounts, checkRateLimit, clientAddress } from '@/lib/server/auth';
import { signedIn } from '@/lib/server/auth-routes';
export async function POST(request: Request) {
  try {
    const body = await readBody(request, 4096);
    checkRateLimit(`signup:${clientAddress(request)}`, 20);
    return signedIn(request, await accounts().signup(body), 201);
  } catch (e) {
    return failure(e);
  }
}
