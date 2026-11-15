'use client';
import { useEffect, useState } from 'react';
import { Box } from 'lucide-react';
import { api, ApiError } from '@/lib/projects/client';
export default function JoinProject() {
  const [token, setToken] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => setToken(location.hash.slice(1)), []);
  return (
    <main className="auth">
      <div className="auth-card">
        <span className="brand">
          <Box size={20} />
          <b>
            form<span>.</span>
          </b>
        </span>
        <h1>Join project</h1>
        {error && <p role="alert">{error}</p>}
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
              if (e instanceof ApiError && e.status === 401) location.reload();
              else setError(e instanceof Error ? e.message : 'Could not join.');
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Joining…' : 'Accept invitation'}
        </button>
        <p className="note">Only accept invitations you trust.</p>
      </div>
    </main>
  );
}
