'use client';
import { useState } from 'react';

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

const copy: Record<Mode, { title: string; lead: string; action: string }> = {
  setup: {
    title: 'Set up your workshop server.',
    lead: 'Create the administrator account. You can add teammates afterwards; existing projects on this computer stay with this account.',
    action: 'Create administrator',
  },
  login: {
    title: 'Your ideas, ready to continue.',
    lead: 'Sign in to open your projects, conversations and every model iteration.',
    action: 'Sign in',
  },
  signup: {
    title: 'Join this workshop.',
    lead: 'Create an account with the join code from the server administrator.',
    action: 'Create account',
  },
  change: {
    title: 'Choose a new password.',
    lead: 'Your account uses a temporary password. Choose your own to continue.',
    action: 'Save password',
  },
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
    <label className="auth-field">
      <span>{label}</span>
      <input
        name={name}
        type={type}
        required={name !== 'displayName'}
        autoComplete={auto}
        autoCapitalize="none"
        spellCheck={false}
        disabled={busy}
      />
    </label>
  );
  return (
    <main className="signin-screen">
      <div>
        <strong className="signin-brand">form.</strong>
        <h1>{text.title}</h1>
        <p>{text.lead}</p>
        <form className="auth-form" onSubmit={submit} key={mode}>
          {mode === 'change' ? (
            <>
              {field(
                'current',
                'Temporary password',
                'password',
                'current-password',
              )}
              {field(
                'password',
                'New password (8+ characters)',
                'password',
                'new-password',
              )}
              {field(
                'confirm',
                'Confirm new password',
                'password',
                'new-password',
              )}
            </>
          ) : (
            <>
              {mode === 'signup' && field('code', 'Join code', 'text', 'off')}
              {field('username', 'Username', 'text', 'username')}
              {mode !== 'login' &&
                field('displayName', 'Display name (optional)', 'text', 'name')}
              {field(
                'password',
                mode === 'login' ? 'Password' : 'Password (8+ characters)',
                'password',
                mode === 'login' ? 'current-password' : 'new-password',
              )}
              {mode !== 'login' &&
                field(
                  'confirm',
                  'Confirm password',
                  'password',
                  'new-password',
                )}
            </>
          )}
          {error && (
            <p role="alert" className="auth-error">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy}>
            {busy ? 'Please wait…' : text.action}
          </button>
        </form>
        {mode === 'login' && signupOpen && (
          <button
            type="button"
            className="auth-switch"
            onClick={() => setMode('signup')}
          >
            Have a join code? Create an account
          </button>
        )}
        {mode === 'signup' && (
          <button
            type="button"
            className="auth-switch"
            onClick={() => setMode('login')}
          >
            Already have an account? Sign in
          </button>
        )}
        {mode === 'login' && (
          <p className="auth-note">
            Forgot your password? Ask the server administrator to reset it.
          </p>
        )}
      </div>
    </main>
  );
}
