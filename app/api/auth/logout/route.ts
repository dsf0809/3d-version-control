import { assertSameOrigin, json, failure } from '@/lib/projects/http';
import { accounts, clearedCookie, readCookie } from '@/lib/server/auth';
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await accounts().endSession(readCookie(request.headers.get('cookie')));
    const response = json({ signedOut: true });
    response.headers.append('Set-Cookie', clearedCookie);
    return response;
  } catch (e) {
    return failure(e);
  }
}
