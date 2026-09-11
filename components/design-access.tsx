'use client';
import { useState } from 'react';
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
  if (!p || !revision) return null;
  const endpoint = `/api/projects/${p.id}/shares`;
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
  return (
    <div className="organized-access">
      {section === 'locks' && (
        <>
          <p>
            Locks preserve feature dimensions across this project’s branches.
            Unlock explicitly before changing a locked dimension or removing its
            feature.
          </p>
          <fieldset disabled={busy || saving || workspace.loading}>
            {revision.model.operations.map((o) => (
              <div key={o.id}>
                <strong>{o.name}</strong>
                <div className="feature-fields">
                  {['Width', 'Depth', 'Height'].map((label, axis) => {
                    const lock = p!.dimensionLocks.find(
                      (l) => l.featureId === o.id && l.axis === axis,
                    );
                    return (
                      <label key={axis}>
                        <input
                          type="checkbox"
                          aria-label={`Lock ${o.name} ${label}`}
                          checked={!!lock}
                          onChange={(e) =>
                            void perform(async () => {
                              await workspace.mutate({
                                action: 'dimension-lock',
                                revisionId: revision!.id,
                                featureId: o.id,
                                axis,
                                locked: e.target.checked,
                              });
                            })
                          }
                        />
                        {label} {lock?.value ?? o.size[axis]} mm
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
            {p.dimensionLocks.filter(
              (l) =>
                !revision.model.operations.some((o) => o.id === l.featureId),
            ).length > 0 && (
              <p>
                Some locked features are absent from this revision. Open a
                revision containing them to unlock before restoring.
              </p>
            )}
          </fieldset>
        </>
      )}
      {section === 'sharing' && (
        <fieldset disabled={busy || saving || workspace.loading}>
          <strong>Share accepted V{revision.ordinal}</strong>
          <p>
            Anyone with the link can view this fixed revision. Chat and project
            notes stay private. Disabling downloads hides the export action;
            viewable geometry can still be copied. Revocation blocks future
            access, not copies already obtained.
          </p>
          <label>
            <input
              type="checkbox"
              checked={allowExport}
              onChange={(e) => setAllowExport(e.target.checked)}
            />
            Allow STL download
          </label>
          <button
            type="button"
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
            Create read-only link
          </button>
          {url && (
            <label>
              Copy this link now
              <input
                aria-label="Share URL"
                readOnly
                value={url}
                onFocus={(e) => e.target.select()}
              />
            </label>
          )}
          <button
            type="button"
            onClick={() =>
              void perform(async () => {
                setShares(await request());
              })
            }
          >
            Manage existing links
          </button>
          {shares.map((s) => (
            <div key={s.id}>
              V{p.revisions.find((r) => r.id === s.revision_id)?.ordinal} ·{' '}
              {s.allow_export ? 'STL allowed' : 'View only'} ·{' '}
              {s.revoked ? 'Revoked' : 'Active'}{' '}
              {!s.revoked && (
                <button
                  type="button"
                  onClick={() =>
                    void perform(async () => {
                      await request({ action: 'revoke', id: s.id });
                      setUrl('');
                      setShares(await request());
                    })
                  }
                >
                  Revoke link {s.id.slice(0, 6)}
                </button>
              )}
            </div>
          ))}
        </fieldset>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
