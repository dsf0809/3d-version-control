import { cookies } from 'next/headers';
import JoinProject from '@/components/join-project';
import AuthScreen from '@/components/auth-screen';
import { accounts, SESSION_COOKIE } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

// Signing in reloads this page, keeping the invitation token in the URL hash.
export default async function Join() {
  const a = accounts();
  const user = await a.sessionUser(
    (await cookies()).get(SESSION_COOKIE)?.value,
  );
  if (!user || user.mustChangePassword)
    return (
      <AuthScreen
        setupRequired={!user && (await a.count()) === 0}
        signupOpen={!!(await a.joinCode())}
        mustChangePassword={user?.mustChangePassword}
      />
    );
  return <JoinProject />;
}
