import type { ProjectStore } from './store';
import { HttpError } from './http';
const hash = async (token: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)),
    ),
    (n) => n.toString(16).padStart(2, '0'),
  ).join('');
export async function team(
  store: ProjectStore,
  actor: string,
  projectId: string,
) {
  const p = await store.own(actor, projectId, 'view');
  const members = (
    await store
      .stmt(
        'SELECT user_id AS userId,role,created_at AS joinedAt FROM project_members WHERE project_id=? ORDER BY created_at',
        projectId,
      )
      .all()
  ).results;
  const invitations =
    p.access_role === 'owner'
      ? (
          await store
            .stmt(
              'SELECT id,role,expires_at AS expiresAt,revoked,used_by AS usedBy FROM project_invitations WHERE project_id=? ORDER BY created_at DESC',
              projectId,
            )
            .all()
        ).results
      : [];
  return {
    members: [{ userId: p.owner_id, role: 'owner' }, ...members],
    invitations,
  };
}
export async function invite(
  store: ProjectStore,
  actor: string,
  projectId: string,
  role: unknown,
) {
  await store.own(actor, projectId, 'owner');
  if (role !== 'editor' && role !== 'viewer')
    throw new HttpError(400, 'Choose editor or viewer.');
  const token = crypto.randomUUID() + crypto.randomUUID(),
    id = crypto.randomUUID(),
    expiresAt = Date.now() + 7 * 86400000;
  await store
    .stmt(
      'INSERT INTO project_invitations (id,project_id,token_hash,role,expires_at,created_at) VALUES (?,?,?,?,?,?)',
      id,
      projectId,
      await hash(token),
      role,
      expiresAt,
      new Date().toISOString(),
    )
    .run();
  return { id, token, expiresAt };
}
export async function join(store: ProjectStore, actor: string, token: unknown) {
  if (typeof token !== 'string' || !/^[a-f0-9-]{72}$/.test(token))
    throw new HttpError(404, 'Invitation unavailable.');
  const r = await store
    .stmt(
      'SELECT i.*,p.owner_id FROM project_invitations i JOIN projects p ON p.id=i.project_id WHERE token_hash=?',
      await hash(token),
    )
    .first<any>();
  if (
    !r ||
    r.revoked ||
    r.expires_at <= Date.now() ||
    (r.used_by && r.used_by !== actor)
  )
    throw new HttpError(404, 'Invitation expired, revoked, or already used.');
  if (r.owner_id === actor)
    throw new HttpError(
      400,
      'You already own this project. Share this invitation with a teammate.',
    );
  const result = await store.db.batch([
    store.stmt(
      'UPDATE project_invitations SET used_by=? WHERE id=? AND revoked=0 AND expires_at>? AND (used_by IS NULL OR used_by=?)',
      actor,
      r.id,
      Date.now(),
      actor,
    ),
    // An existing member must be explicitly removed before changing roles. A viewer invitation cannot demote an editor.
    store.stmt(
      'INSERT INTO project_members (project_id,user_id,role,created_at) SELECT project_id,used_by,role,? FROM project_invitations WHERE id=? AND used_by=? AND revoked=0 AND expires_at>? ON CONFLICT(project_id,user_id) DO NOTHING',
      new Date().toISOString(),
      r.id,
      actor,
      Date.now(),
    ),
  ]);
  if (!result[0].meta.changes)
    throw new HttpError(409, 'Invitation was claimed or revoked.');
  await store.own(actor, r.project_id, 'view');
  return { projectId: r.project_id };
}
export async function removeMember(
  store: ProjectStore,
  actor: string,
  projectId: string,
  userId: unknown,
) {
  const p = await store.own(actor, projectId, 'owner');
  if (typeof userId !== 'string' || userId === p.owner_id)
    throw new HttpError(400, 'The project owner cannot be removed.');
  await store.db.batch([
    store.stmt(
      'DELETE FROM project_members WHERE project_id=? AND user_id=?',
      projectId,
      userId,
    ),
    store.stmt(
      'UPDATE project_invitations SET revoked=1 WHERE project_id=? AND used_by=?',
      projectId,
      userId,
    ),
    store.stmt(
      "UPDATE turns SET status='cancelled',error='Project access was revoked.' WHERE project_id=? AND actor_id=? AND status='pending'",
      projectId,
      userId,
    ),
    store.stmt(
      'UPDATE branches SET conversation_id=NULL,lock_token=NULL,lock_until=0 WHERE project_id=? AND lock_token IN (SELECT id FROM turns WHERE project_id=? AND actor_id=?)',
      projectId,
      projectId,
      userId,
    ),
  ]);
}
export async function revokeInvite(
  store: ProjectStore,
  actor: string,
  projectId: string,
  id: unknown,
) {
  await store.own(actor, projectId, 'owner');
  if (typeof id !== 'string') throw new HttpError(400, 'Choose an invitation.');
  await store
    .stmt(
      'UPDATE project_invitations SET revoked=1 WHERE id=? AND project_id=?',
      id,
      projectId,
    )
    .run();
}
