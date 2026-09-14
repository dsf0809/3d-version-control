import type { ProjectStore } from './store';
import { HttpError } from './http';
import { upgradeModel } from '../cad/model';
async function hash(token: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)),
    ),
    (n) => n.toString(16).padStart(2, '0'),
  ).join('');
}
export async function listShares(
  store: ProjectStore,
  owner: string,
  projectId: string,
) {
  await store.own(owner, projectId, 'owner');
  return (
    await store
      .stmt(
        'SELECT id,revision_id,allow_export,revoked,created_at FROM shares WHERE project_id=? ORDER BY created_at DESC',
        projectId,
      )
      .all()
  ).results;
}
export async function createShare(
  store: ProjectStore,
  owner: string,
  projectId: string,
  revisionId: string,
  allowExport: boolean,
) {
  await store.own(owner, projectId, 'owner');
  const p = await store.detail(owner, projectId);
  if (
    !p.revisions.some((r) => r.id === revisionId) ||
    typeof allowExport !== 'boolean'
  )
    throw new HttpError(400, 'Choose a saved revision and export permission.');
  const token = crypto.randomUUID() + crypto.randomUUID(),
    id = crypto.randomUUID();
  await store
    .stmt(
      'INSERT INTO shares (id,project_id,revision_id,token_hash,allow_export,revoked,created_at) VALUES (?,?,?,?,?,0,?)',
      id,
      projectId,
      revisionId,
      await hash(token),
      Number(allowExport),
      new Date().toISOString(),
    )
    .run();
  return { id, token };
}
export async function revokeShare(
  store: ProjectStore,
  owner: string,
  projectId: string,
  id: string,
) {
  await store.own(owner, projectId, 'owner');
  await store
    .stmt(
      'UPDATE shares SET revoked=1 WHERE id=? AND project_id=?',
      id,
      projectId,
    )
    .run();
}
export async function readShare(
  store: ProjectStore,
  token: string,
  exporting = false,
) {
  if (!/^[a-f0-9-]{72}$/.test(token))
    throw new HttpError(404, 'Share unavailable.');
  const row = await store
    .stmt(
      'SELECT r.model_json,r.ordinal,s.allow_export FROM shares s JOIN revisions r ON r.id=s.revision_id AND r.project_id=s.project_id WHERE s.token_hash=? AND s.revoked=0',
      await hash(token),
    )
    .first<{ model_json: string; ordinal: number; allow_export: number }>();
  if (!row) throw new HttpError(404, 'Share unavailable or revoked.');
  if (exporting && !row.allow_export)
    throw new HttpError(403, 'Downloads are disabled for this link.');
  return {
    model: upgradeModel(JSON.parse(row.model_json)),
    ordinal: row.ordinal,
    allowExport: !!row.allow_export,
  };
}
