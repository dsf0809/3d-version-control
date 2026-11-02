'use client';
import { useCallback, useEffect, useState } from 'react';
import { UserRound } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from './ui/dialog';
import { ConnectionForm, type ProviderOption } from './ai-connection';

export type AccountUser = {
  displayName: string;
  username: string;
  admin: boolean;
};
type Member = {
  id: string;
  username: string;
  displayName: string;
  role: string;
  disabled: number;
  mustChangePassword: number;
};
type Settings = {
  joinCode: string | null;
  sharing: { shared: boolean; dailyLimit: number };
  addresses: string[];
};
type ServerAI = {
  saved: {
    provider: string;
    model: string;
    baseUrl: string | null;
    hasKey: boolean;
  } | null;
  environment: { provider: string; model: string } | null;
};

async function call<T>(
  url: string,
  method = 'GET',
  body?: unknown,
): Promise<T> {
  const r = await fetch(
    url,
    body === undefined
      ? { method }
      : {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
  const data = await r.json().catch(() => ({}));
  if (!r.ok)
    throw new Error((data as { error?: string }).error || 'Request failed.');
  return data as T;
}
const tempPassword = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(9)), (n) =>
    'abcdefghjkmnpqrstuvwxyz23456789'.charAt(n % 31),
  ).join('');

export default function AccountMenu({ user }: { user: AccountUser }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="quiet"
        onClick={() => setOpen(true)}
        title={`Signed in as @${user.username}`}
      >
        <UserRound size={15} /> {user.displayName}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="account-dialog sm:max-w-xl p-6">
          <DialogTitle>Account</DialogTitle>
          <DialogDescription>
            Signed in as {user.displayName} (@{user.username})
            {user.admin ? ' · Administrator' : ''}
          </DialogDescription>
          {open && <AccountBody user={user} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function AccountBody({ user }: { user: AccountUser }) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const run = useCallback(async (fn: () => Promise<unknown>, done?: string) => {
    setError('');
    setMessage('');
    try {
      await fn();
      if (done) setMessage(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed.');
    }
  }, []);
  return (
    <div className="account-body">
      {error && (
        <p role="alert" className="account-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="account-message">
          {message}
        </p>
      )}
      <section>
        <h3>Password</h3>
        <form
          className="account-row"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const f = new FormData(form);
            void run(async () => {
              await call('/api/auth/password', 'POST', {
                current: f.get('current'),
                next: f.get('next'),
              });
              form.reset();
            }, 'Password changed. Other devices were signed out.');
          }}
        >
          <input
            name="current"
            type="password"
            placeholder="Current password"
            autoComplete="current-password"
            required
          />
          <input
            name="next"
            type="password"
            placeholder="New password"
            autoComplete="new-password"
            minLength={8}
            required
          />
          <button className="quiet" type="submit">
            Change
          </button>
        </form>
      </section>
      <section>
        <button
          className="quiet"
          onClick={() =>
            void run(async () => {
              await call('/api/auth/logout', 'POST');
              location.assign('/');
            })
          }
        >
          Sign out
        </button>
      </section>
      {user.admin && <AdminPanel run={run} self={user.username} />}
    </div>
  );
}

function AdminPanel({
  run,
  self,
}: {
  run: (fn: () => Promise<unknown>, done?: string) => Promise<void>;
  self: string;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [serverAI, setServerAI] = useState<ServerAI | null>(null);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [created, setCreated] = useState<{
    username: string;
    password: string;
  } | null>(null);
  const load = useCallback(async () => {
    const [m, s, ai, options] = await Promise.all([
      call<Member[]>('/api/admin/users'),
      call<Settings>('/api/admin/settings'),
      call<ServerAI>('/api/admin/ai-connection'),
      call<{ providers: ProviderOption[] }>('/api/ai-connection'),
    ]);
    setMembers(m);
    setSettings(s);
    setServerAI(ai);
    setProviders(options.providers);
  }, []);
  useEffect(() => void run(load), [load, run]);
  // Prefer the address coworkers can reach over a localhost URL.
  const here = typeof location === 'undefined' ? '' : location.origin;
  const joinUrl =
    /localhost|127\.0\.0\.1/.test(here) && settings?.addresses.length
      ? settings.addresses.join(' or ')
      : here;
  return (
    <>
      <section>
        <h3>People</h3>
        <ul className="account-list">
          {members.map((m) => (
            <li key={m.id}>
              <span>
                <strong>{m.displayName}</strong> @{m.username} · {m.role}
                {m.disabled ? ' · disabled' : ''}
                {m.mustChangePassword ? ' · temporary password' : ''}
              </span>
              <span className="account-actions">
                <button
                  className="quiet"
                  onClick={() => {
                    const password = tempPassword();
                    void run(async () => {
                      setMembers(
                        await call('/api/admin/users', 'PATCH', {
                          userId: m.id,
                          password,
                        }),
                      );
                      setCreated({ username: m.username, password });
                    });
                  }}
                >
                  Reset password
                </button>
                {m.username !== self && (
                  <>
                    <button
                      className="quiet"
                      onClick={() =>
                        void run(async () =>
                          setMembers(
                            await call('/api/admin/users', 'PATCH', {
                              userId: m.id,
                              disabled: !m.disabled,
                            }),
                          ),
                        )
                      }
                    >
                      {m.disabled ? 'Enable' : 'Disable'}
                    </button>
                    <button
                      className="quiet"
                      onClick={() =>
                        void run(async () =>
                          setMembers(
                            await call('/api/admin/users', 'PATCH', {
                              userId: m.id,
                              role: m.role === 'admin' ? 'member' : 'admin',
                            }),
                          ),
                        )
                      }
                    >
                      {m.role === 'admin' ? 'Make member' : 'Make admin'}
                    </button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
        <form
          className="account-row"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const f = new FormData(form);
            const password = tempPassword();
            void run(async () => {
              await call('/api/admin/users', 'POST', {
                username: f.get('username'),
                displayName: f.get('displayName'),
                password,
              });
              setCreated({
                username: (f.get('username') as string).trim().toLowerCase(),
                password,
              });
              form.reset();
              await load();
            });
          }}
        >
          <input
            name="username"
            placeholder="Username"
            autoCapitalize="none"
            required
          />
          <input name="displayName" placeholder="Display name" />
          <button className="quiet" type="submit">
            Add person
          </button>
        </form>
        {created && (
          <p className="account-message" role="status">
            Give <strong>@{created.username}</strong> this temporary password:{' '}
            <code>{created.password}</code>. They will choose their own when
            they first sign in at {joinUrl}.
          </p>
        )}
      </section>
      <section>
        <h3>Self sign-up</h3>
        {settings?.joinCode ? (
          <p>
            Anyone with the join code <code>{settings.joinCode}</code> can
            create an account at {joinUrl}.
          </p>
        ) : (
          <p>Self sign-up is off. Only administrators can add people.</p>
        )}
        <div className="account-row">
          <button
            className="quiet"
            onClick={() =>
              void run(async () =>
                setSettings(
                  await call('/api/admin/settings', 'POST', {
                    action: 'rotate-code',
                  }),
                ),
              )
            }
          >
            {settings?.joinCode ? 'New join code' : 'Turn on with a join code'}
          </button>
          {settings?.joinCode && (
            <button
              className="quiet"
              onClick={() =>
                void run(async () =>
                  setSettings(
                    await call('/api/admin/settings', 'POST', {
                      action: 'disable-code',
                    }),
                  ),
                )
              }
            >
              Turn off
            </button>
          )}
        </div>
      </section>
      <section>
        <h3>Shared AI connection</h3>
        <p>
          {serverAI?.saved
            ? `Server connection: ${serverAI.saved.provider} · ${serverAI.saved.model}`
            : serverAI?.environment
              ? `Using the server environment: ${serverAI.environment.provider} · ${serverAI.environment.model}`
              : 'No shared connection. Each person must add their own key.'}{' '}
          People with their own key always use it instead. Requests on the
          shared key bill the server owner.
        </p>
        {settings && (
          <form
            className="account-row"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(
                async () =>
                  setSettings(
                    await call('/api/admin/settings', 'POST', {
                      action: 'sharing',
                      shared: f.get('shared') === 'on',
                      dailyLimit: Number(f.get('dailyLimit')),
                    }),
                  ),
                'Sharing settings saved.',
              );
            }}
          >
            <label className="account-check">
              <input
                type="checkbox"
                name="shared"
                defaultChecked={settings.sharing.shared}
              />{' '}
              Share with everyone
            </label>
            <label className="account-check">
              Requests per person per day
              <input
                name="dailyLimit"
                type="number"
                min={0}
                max={100000}
                defaultValue={settings.sharing.dailyLimit}
              />
            </label>
            <button className="quiet" type="submit">
              Save
            </button>
          </form>
        )}
        {providers.length > 0 && (
          <ConnectionForm
            providers={providers}
            current={serverAI?.saved ?? null}
            canSetEndpoint
            submitLabel="Save server connection"
            onSave={(body) =>
              run(
                async () =>
                  setServerAI(
                    await call('/api/admin/ai-connection', 'POST', body),
                  ),
                'Server connection saved.',
              )
            }
            onRemove={
              serverAI?.saved
                ? () =>
                    run(
                      async () =>
                        setServerAI(
                          await call('/api/admin/ai-connection', 'DELETE'),
                        ),
                      'Server connection removed.',
                    )
                : undefined
            }
          />
        )}
      </section>
    </>
  );
}
