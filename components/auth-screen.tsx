'use client';
import { useState } from 'react';
import { Box } from 'lucide-react';

type Mode = 'setup' | 'login' | 'signup' | 'change';
async function post(url: string, body: unknown) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await r.json().catch(() => ({}))) as { error?: string };
  if (!r.ok)
    throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

const copy: Record<Mode, { title: string; action: string }> = {
  setup: { title: 'Create the admin account', action: 'Create account' },
  login: { title: 'Sign in', action: 'Sign in' },
  signup: { title: 'Join', action: 'Create account' },
  change: { title: 'Choose a new password', action: 'Save' },
};

export default function AuthScreen({
  setupRequired,
  signupOpen,
  mustChangePassword,
}: {
  setupRequired: boolean;
  signupOpen: boolean;
  mustChangePassword?: boolean;
}) {
  const [mode, setMode] = useState<Mode>(
    mustChangePassword ? 'change' : setupRequired ? 'setup' : 'login',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const text = copy[mode];
  const submit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<
      string,
      string
    >;
    setError('');
    if (
      (mode === 'setup' || mode === 'signup' || mode === 'change') &&
      f.password !== f.confirm
    )
      return setError('The passwords do not match.');
    setBusy(true);
    try {
      if (mode === 'change')
        await post('/api/auth/password', {
          current: f.current,
          next: f.password,
        });
      else await post(`/api/auth/${mode}`, f);
      location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setBusy(false);
    }
  };
  const field = (name: string, label: string, type = 'text', auto?: string) => (
    <label>
      {label}
      <input
        name={name}
        type={type}
        required={name !== 'displayName'}
        minLength={auto === 'new-password' ? 8 : undefined}
        autoComplete={auto}
        autoCapitalize="none"
        spellCheck={false}
        disabled={busy}
      />
    </label>
  );
  return (
    <main className="auth">
      <div className="auth-card">
        <span className="brand">
          <Box size={20} />
          <b>
            form<span>.</span>
          </b>
        </span>
        <h1>{text.title}</h1>
        <form className="form" onSubmit={submit} key={mode}>
          {mode === 'change' ? (
            <>
              {field(
                'current',
                'Temporary password',
                'password',
                'current-password',
              )}
              {field('password', 'New password', 'password', 'new-password')}
              {field('confirm', 'Repeat', 'password', 'new-password')}
            </>
          ) : (
            <>
              {mode === 'signup' && field('code', 'Join code', 'text', 'off')}
              {field('username', 'Username', 'text', 'username')}
              {mode !== 'login' &&
                field('displayName', 'Name · optional', 'text', 'name')}
              {field(
                'password',
                'Password',
                'password',
                mode === 'login' ? 'current-password' : 'new-password',
              )}
              {mode !== 'login' &&
                field('confirm', 'Repeat', 'password', 'new-password')}
            </>
          )}
          {error && <p role="alert">{error}</p>}
          <button className="quiet primary" type="submit" disabled={busy}>
            {busy ? '…' : text.action}
          </button>
        </form>
        {mode === 'login' && signupOpen && (
          <button
            type="button"
            className="quiet"
            onClick={() => setMode('signup')}
          >
            Join with a code
          </button>
        )}
        {mode === 'signup' && (
          <button
            type="button"
            className="quiet"
            onClick={() => setMode('login')}
          >
            Sign in instead
          </button>
        )}
        {mode === 'login' && (
          <p className="note">Forgot it? Your admin can reset it.</p>
        )}
      </div>
    </main>
  );
}
