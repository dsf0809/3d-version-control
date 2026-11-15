'use client';
import { useCallback, useEffect, useState } from 'react';
import { Ellipsis } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
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
        className="avatar"
        onClick={() => setOpen(true)}
        aria-label={`Account · ${user.displayName}`}
        title={`${user.displayName} (@${user.username})`}
      >
        {user.displayName.trim().charAt(0).toUpperCase() || '?'}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="dialog sm:max-w-lg">
          <DialogTitle>
            {user.displayName}
            <span className="title-tag">
              @{user.username}
              {user.admin ? ' · Admin' : ''}
            </span>
          </DialogTitle>
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
  const you = (
    <div className="form">
      <form
        className="row"
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
          aria-label="Current password"
          placeholder="Current password"
          autoComplete="current-password"
          required
        />
        <input
          name="next"
          type="password"
          aria-label="New password"
          placeholder="New password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <button className="quiet line" type="submit">
          Change
        </button>
      </form>
      <div className="row end">
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
      </div>
    </div>
  );
  const notices = (
    <>
      {error && <p role="alert">{error}</p>}
      {message && (
        <p role="status" className="note">
          {message}
        </p>
      )}
    </>
  );
  if (!user.admin)
    return (
      <>
        {notices}
        {you}
      </>
    );
  return (
    <Tabs defaultValue="you" className="tabs">
      <TabsList aria-label="Account sections">
        <TabsTrigger value="you">You</TabsTrigger>
        <TabsTrigger value="people">People</TabsTrigger>
        <TabsTrigger value="signup">Sign-up</TabsTrigger>
        <TabsTrigger value="ai">Shared AI</TabsTrigger>
      </TabsList>
      {notices}
      <TabsContent value="you">{you}</TabsContent>
      <AdminPanel run={run} self={user.username} />
    </Tabs>
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
  const patch = (body: Record<string, unknown>) =>
    run(async () => setMembers(await call('/api/admin/users', 'PATCH', body)));
  return (
    <>
      <TabsContent value="people" className="form">
        <ul className="list">
          {members.map((m) => (
            <li key={m.id}>
              <span>
                <strong>{m.displayName}</strong>
                <small>
                  @{m.username}
                  {m.role === 'admin' ? ' · admin' : ''}
                  {m.disabled ? ' · disabled' : ''}
                  {m.mustChangePassword ? ' · temporary password' : ''}
                </small>
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="quiet icon"
                  aria-label={`Manage ${m.displayName}`}
                >
                  <Ellipsis size={15} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem
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
                  </DropdownMenuItem>
                  {m.username !== self && (
                    <>
                      <DropdownMenuItem
                        onClick={() =>
                          void patch({ userId: m.id, disabled: !m.disabled })
                        }
                      >
                        {m.disabled ? 'Enable' : 'Disable'}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          void patch({
                            userId: m.id,
                            role: m.role === 'admin' ? 'member' : 'admin',
                          })
                        }
                      >
                        {m.role === 'admin' ? 'Make member' : 'Make admin'}
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
        {created && (
          <p className="callout" role="status">
            Temporary password for <strong>@{created.username}</strong>:{' '}
            <code>{created.password}</code>
            <br />
            They choose their own at first sign-in · {joinUrl}
          </p>
        )}
        <form
          className="row"
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
            aria-label="Username"
            placeholder="Username"
            autoCapitalize="none"
            required
          />
          <input
            name="displayName"
            aria-label="Display name"
            placeholder="Display name"
          />
          <button className="quiet line" type="submit">
            Add
          </button>
        </form>
      </TabsContent>
      <TabsContent value="signup" className="form">
        {settings?.joinCode ? (
          <p className="callout">
            Join code <code>{settings.joinCode}</code>
            <br />
            {joinUrl}
          </p>
        ) : (
          <p className="note">Off — only admins add people.</p>
        )}
        <div className="row">
          <button
            className="quiet line"
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
            {settings?.joinCode ? 'New code' : 'Turn on'}
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
      </TabsContent>
      <TabsContent value="ai" className="form">
        <p className="note">
          {serverAI?.saved
            ? `${serverAI.saved.provider} · ${serverAI.saved.model}`
            : serverAI?.environment
              ? `Server environment · ${serverAI.environment.provider} · ${serverAI.environment.model}`
              : 'No shared connection'}
          . Personal keys take priority; shared requests bill the server owner.
        </p>
        {settings && (
          <form
            className="row"
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
            <label className="check">
              <input
                type="checkbox"
                name="shared"
                defaultChecked={settings.sharing.shared}
              />
              Share with everyone
            </label>
            <label className="check">
              <input
                name="dailyLimit"
                type="number"
                min={0}
                max={100000}
                aria-label="Requests per person per day"
                defaultValue={settings.sharing.dailyLimit}
              />
              per person / day
            </label>
            <span className="grow" />
            <button className="quiet line" type="submit">
              Save
            </button>
          </form>
        )}
        {providers.length > 0 && (
          <ConnectionForm
            providers={providers}
            current={serverAI?.saved ?? null}
            canSetEndpoint
            submitLabel="Save connection"
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
      </TabsContent>
    </>
  );
}
