'use client';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/projects/client';
export default function JoinProject() {
  const [token, setToken] = useState(''),
    [error, setError] = useState(''),
    [signin, setSignin] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => setToken(location.hash.slice(1)), []);
  return (
    <main className="join-page">
      <h1>Join a design project</h1>
      <p>
        Accept this invitation to access the project’s models and conversations.
        Only accept an invitation from someone you trust.
      </p>
      {error && <p role="alert">{error}</p>}
      {signin ? (
        <a
          href={`/signin-with-chatgpt?return_to=${encodeURIComponent('/join#' + token)}`}
        >
          Sign in to continue
        </a>
      ) : (
        <button
          className="quiet primary"
          disabled={!token || busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              const r = await api<{ projectId: string }>('/api/invitations', {
                method: 'POST',
                body: JSON.stringify({ token }),
              });
              sessionStorage.setItem('form-active-project', r.projectId);
              location.assign('/');
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not join.');
              if (e instanceof ApiError && e.status === 401) setSignin(true);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Joining…' : 'Accept invitation'}
        </button>
      )}
    </main>
  );
}
