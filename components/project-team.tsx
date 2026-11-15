'use client';
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '@/lib/projects/client';
export default function ProjectTeam({
  projectId,
  owner,
}: {
  projectId: string;
  owner: boolean;
}) {
  const [data, setData] = useState<{
      members: { userId: string; role: string; name?: string | null }[];
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
    <section className="form team" aria-label="Team">
      <ul className="list">
        {data?.members.map((m) => (
          <li key={m.userId}>
            <span title={m.userId}>
              <strong>{m.name ?? m.userId}</strong>
              <small>{m.role}</small>
            </span>
            {owner && m.role !== 'owner' && (
              <button
                type="button"
                className="quiet icon"
                disabled={busy}
                aria-label={`Remove ${m.name ?? m.userId}`}
                onClick={() => void act({ action: 'remove', userId: m.userId })}
              >
                <X size={14} />
              </button>
            )}
          </li>
        ))}
        {owner &&
          data?.invitations
            .filter((i) => !i.revoked && !i.usedBy && i.expiresAt > Date.now())
            .map((i) => (
              <li key={i.id} className="off">
                <span>
                  <strong>Invited {i.role}</strong>
                  <small>
                    until {new Date(i.expiresAt).toLocaleDateString()}
                  </small>
                </span>
                <button
                  type="button"
                  className="quiet icon"
                  disabled={busy}
                  aria-label="Revoke invitation"
                  onClick={() => void act({ action: 'revoke', id: i.id })}
                >
                  <X size={14} />
                </button>
              </li>
            ))}
      </ul>
      {owner && (
        <div className="row">
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
            className="quiet line"
            disabled={busy}
            onClick={() => void act({ action: 'invite', role })}
          >
            Invite link
          </button>
          {link && (
            <input
              className="grow"
              aria-label="Invitation link"
              title="Works once, for seven days"
              readOnly
              value={link}
              onFocus={(e) => e.target.select()}
            />
          )}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
