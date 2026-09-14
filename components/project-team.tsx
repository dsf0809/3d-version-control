'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/projects/client';
export default function ProjectTeam({
  projectId,
  owner,
}: {
  projectId: string;
  owner: boolean;
}) {
  const [data, setData] = useState<{
      members: { userId: string; role: string }[];
      invitations: {
        id: string;
        role: string;
        expiresAt: number;
        revoked: number;
        usedBy: string | null;
      }[];
    } | null>(null),
    [role, setRole] = useState('editor'),
    [link, setLink] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const path = `/api/projects/${projectId}/team`;
  const refresh = () => api<typeof data>(path).then(setData);
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, [projectId]);
  const act = async (body: unknown) => {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ token?: string }>(path, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (result.token) setLink(`${location.origin}/join#${result.token}`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Team update failed.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="team-panel">
      <summary>Team & access {data ? `(${data.members.length})` : ''}</summary>
      <p>
        Editors contribute on their own branches. The owner reviews merges into
        Main. Viewers can read and download accepted designs.
      </p>
      {data?.members.map((m) => (
        <div className="team-row" key={m.userId}>
          <span title={m.userId}>
            {m.userId} · {m.role}
          </span>
          {owner && m.role !== 'owner' && (
            <button
              type="button"
              className="quiet"
              disabled={busy}
              onClick={() => void act({ action: 'remove', userId: m.userId })}
            >
              Remove access
            </button>
          )}
        </div>
      ))}
      {owner && (
        <>
          <div className="team-row">
            <select
              aria-label="Invitation role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            <button
              type="button"
              className="quiet"
              disabled={busy}
              onClick={() => void act({ action: 'invite', role })}
            >
              Create invitation
            </button>
          </div>
          <p>
            Each invitation works once and expires after seven days. Share it
            privately with the intended teammate.
          </p>
          {link && (
            <label>
              Invitation link
              <input
                aria-label="Invitation link"
                readOnly
                value={link}
                onFocus={(e) => e.target.select()}
              />
            </label>
          )}
          {data?.invitations
            .filter((i) => !i.revoked && !i.usedBy && i.expiresAt > Date.now())
            .map((i) => (
              <div className="team-row" key={i.id}>
                <span>
                  {i.role} invitation · expires{' '}
                  {new Date(i.expiresAt).toLocaleDateString()}
                </span>
                <button
                  type="button"
                  className="quiet"
                  disabled={busy}
                  onClick={() => void act({ action: 'revoke', id: i.id })}
                >
                  Revoke
                </button>
              </div>
            ))}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
