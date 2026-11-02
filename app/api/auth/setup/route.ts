import { readBody, failure } from '@/lib/projects/http';
import { accounts } from '@/lib/server/auth';
import { signedIn } from '@/lib/server/auth-routes';
export async function POST(request: Request) {
  try {
    const user = await accounts().setup(await readBody(request, 4096));
    return signedIn(request, user, 201);
  } catch (e) {
    return failure(e);
  }
}
