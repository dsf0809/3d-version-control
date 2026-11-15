'use client';
import { useEffect, useState } from 'react';
import { Lock, LockOpen } from 'lucide-react';
import type { useProjects } from '@/lib/projects/client';
type Share = {
  id: string;
  revision_id: string;
  allow_export: number;
  revoked: number;
  created_at: string;
};
export default function DesignAccess({
  workspace,
  busy,
  section = 'locks',
}: {
  workspace: ReturnType<typeof useProjects>;
  busy: boolean;
  section?: 'locks' | 'sharing';
}) {
  const [shares, setShares] = useState<Share[]>([]),
    [url, setUrl] = useState(''),
    [error, setError] = useState(''),
    [saving, setSaving] = useState(false),
    [allowExport, setAllowExport] = useState(false);
  const p = workspace.project,
    revision = workspace.revision;
  const endpoint = p ? `/api/projects/${p.id}/shares` : '';
  useEffect(() => {
    if (section !== 'sharing' || !endpoint) return;
    let live = true;
    fetch(endpoint, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => live && setShares(list as Share[]))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [section, endpoint]);
  if (!p || !revision) return null;
  async function request<T = Share[]>(body?: unknown): Promise<T> {
    const r = await fetch(
      endpoint,
      body
        ? {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
        : { cache: 'no-store' },
    );
    const value = (await r.json()) as T & { error?: string };
    if (!r.ok) throw new Error(value.error);
    return value;
  }
  async function perform(fn: () => Promise<void>) {
    setSaving(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update settings.');
    } finally {
      setSaving(false);
    }
  }
  const orphaned = p.dimensionLocks.some(
    (l) => !revision.model.operations.some((o) => o.id === l.featureId),
  );
  return (
    <div className="form">
      {section === 'locks' && (
        <fieldset disabled={busy || saving || workspace.loading}>
          <ul className="list">
            {revision.model.operations.map((o) => (
              <li key={o.id}>
                <strong>{o.name}</strong>
                <span className="row">
                  {['W', 'D', 'H'].map((label, axis) => {
                    const lock = p.dimensionLocks.find(
                      (l) => l.featureId === o.id && l.axis === axis,
                    );
                    return (
                      <label
                        key={axis}
                        className={`chip lock${lock ? ' on' : ''}`}
                      >
                        <input
                          type="checkbox"
                          aria-label={`Lock ${o.name} ${['Width', 'Depth', 'Height'][axis]}`}
                          checked={!!lock}
                          onChange={(e) =>
                            void perform(async () => {
                              await workspace.mutate({
                                action: 'dimension-lock',
                                revisionId: revision.id,
                                featureId: o.id,
                                axis,
                                locked: e.target.checked,
                              });
                            })
                          }
                        />
                        {lock ? <Lock size={12} /> : <LockOpen size={12} />}
                        {label} {lock?.value ?? o.size[axis]}
                      </label>
                    );
                  })}
                </span>
              </li>
            ))}
          </ul>
          {orphaned && (
            <p className="note">
              Some locked features are not in this revision.
            </p>
          )}
        </fieldset>
      )}
      {section === 'sharing' && (
        <fieldset
          className="form"
          disabled={busy || saving || workspace.loading}
        >
          <div className="row">
            <label className="check">
              <input
                type="checkbox"
                checked={allowExport}
                onChange={(e) => setAllowExport(e.target.checked)}
              />
              Allow STL download
            </label>
            <span className="grow" />
            <button
              type="button"
              className="quiet primary"
              onClick={() =>
                void perform(async () => {
                  const result = await request<{ token: string }>({
                    action: 'create',
                    revisionId: revision.id,
                    allowExport,
                  });
                  setUrl(`${location.origin}/share/${result.token}`);
                  setShares(await request());
                })
              }
            >
              Create link
            </button>
          </div>
          {url && (
            <input
              aria-label="Share URL"
              readOnly
              value={url}
              onFocus={(e) => e.target.select()}
            />
          )}
          {shares.length > 0 && (
            <ul className="list">
              {shares.map((s) => (
                <li key={s.id} className={s.revoked ? 'off' : ''}>
                  <span>
                    <strong>
                      V
                      {p.revisions.find((r) => r.id === s.revision_id)?.ordinal}
                    </strong>
                    <small>
                      {s.allow_export ? 'View + STL' : 'View only'}
                      {s.revoked ? ' · revoked' : ''}
                    </small>
                  </span>
                  {!s.revoked && (
                    <button
                      type="button"
                      className="quiet"
                      aria-label={`Revoke link ${s.id.slice(0, 6)}`}
                      onClick={() =>
                        void perform(async () => {
                          await request({ action: 'revoke', id: s.id });
                          setUrl('');
                          setShares(await request());
                        })
                      }
                    >
                      Revoke
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="note">Anyone with the link can view. Read-only.</p>
        </fieldset>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
