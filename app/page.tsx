import { cookies } from 'next/headers';
import Workshop from '@/components/workshop';
import AuthScreen from '@/components/auth-screen';
import { accounts, SESSION_COOKIE } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export default async function Home() {
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
  return (
    <Workshop
      user={{
        displayName: user.displayName,
        username: user.username,
        admin: user.role === 'admin',
      }}
    />
  );
}
