import { headers } from 'next/headers';
import Workshop from '@/components/workshop';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const userId = (await headers()).get('oai-authenticated-user-id');
  if (!userId)
    return (
      <main className="signin-screen">
        <div>
          <strong className="signin-brand">form.</strong>
          <h1>Your ideas, ready to continue.</h1>
          <p>
            Open your workshop to save projects, conversations, and every model
            iteration.
          </p>
          {/* Dispatch-owned sign-in requires full navigation without router prefetch. */}
          {/* oxlint-disable-next-line next/no-html-link-for-pages */}
          <a href="/signin-with-chatgpt?return_to=%2F" target="_top">
            Continue to your workshop
          </a>
        </div>
      </main>
    );
  return <Workshop />;
}
