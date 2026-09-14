import { HttpError } from './http';
import { listProposals } from './proposals';
import type { ProjectStore } from './store';
import { id, now, revision, validateTurn, type Row } from './store-shared';
import type { TurnInput, TurnResult } from './types';
export async function begin(
  this: ProjectStore,
  owner: string,
  input: TurnInput,
) {
  const p = await this.own(owner, input.projectId);
  await this.assertBranchWrite(owner, input.projectId, input.branchId);
  const old = await this.stmt(
    'SELECT * FROM turns WHERE id=?',
    input.requestId,
  ).first<Row>();
  if (old) {
    if (
      old.project_id !== input.projectId ||
      old.branch_id !== input.branchId ||
      old.base_revision_id !== input.revisionId ||
      (old.proposal_id ?? null) !== (input.proposalId ?? null) ||
      old.prompt !== input.message
    )
      throw new HttpError(409, 'This request identifier was already used.');
    if (old.status === 'completed')
      return { cached: JSON.parse(old.result_json) as TurnResult };
    if (old.status === 'pending')
      throw new HttpError(
        409,
        'This request is still running. Reopen the project shortly to check its result.',
      );
    throw new HttpError(
      409,
      'This request did not complete. Send it again as a new request.',
    );
  }
  const time = Date.now();
  const b = await this.stmt(
    'UPDATE branches SET conversation_id=CASE WHEN lock_token IS NOT NULL THEN NULL ELSE conversation_id END,lock_token=?,lock_until=? WHERE id=? AND project_id=? AND head_revision_id=? AND lock_until<? RETURNING *',
    input.requestId,
    time + 180000,
    input.branchId,
    input.projectId,
    input.revisionId,
    time,
  ).first<Row>();
  if (!b)
    throw new HttpError(
      409,
      'This branch changed or has a request in progress. Reload the project before continuing.',
    );
  try {
    const pending = (await listProposals(this, input.branchId)).find(
      (p) => p.status === 'pending',
    );
    if ((pending?.id ?? null) !== (input.proposalId ?? null))
      throw new HttpError(
        409,
        'The proposal changed. Reload and review or refine the current proposal.',
      );
    await this.db.batch([
      this.stmt(
        "UPDATE turns SET status='failed',error='The previous request expired.' WHERE branch_id=? AND status='pending'",
        input.branchId,
      ),
      this.stmt(
        "INSERT INTO turns (id,project_id,branch_id,base_revision_id,prompt,proposal_id,status,created_at,actor_id) VALUES (?,?,?,?,?,?,'pending',?,?)",
        input.requestId,
        input.projectId,
        input.branchId,
        input.revisionId,
        input.message,
        input.proposalId ?? null,
        now(),
        owner,
      ),
    ]);
  } catch (error) {
    await this.stmt(
      'UPDATE branches SET lock_token=NULL,lock_until=0 WHERE id=? AND lock_token=?',
      input.branchId,
      input.requestId,
    ).run();
    throw error;
  }
  const r = await this.stmt(
    'SELECT * FROM revisions WHERE id=? AND project_id=?',
    input.revisionId,
    input.projectId,
  ).first<Row>();
  if (!r) {
    await this.fail(input, 'Selected revision missing.');
    throw new HttpError(404, 'Revision not found.');
  }
  return { project: p, branch: b, revision: revision(r) };
}
export async function setConversation(
  this: ProjectStore,
  input: TurnInput,
  conversationId: string,
) {
  const r = await this.stmt(
    'UPDATE branches SET conversation_id=? WHERE id=? AND lock_token=?',
    conversationId,
    input.branchId,
    input.requestId,
  ).run();
  if (!r.meta.changes)
    throw new HttpError(409, 'The request was cancelled or superseded.');
}
export async function history(this: ProjectStore, branchId: string) {
  return (
    await this.stmt(
      'SELECT role,content FROM messages WHERE branch_id=? ORDER BY ordinal',
      branchId,
    ).all<{ role: 'user' | 'assistant'; content: string }>()
  ).results;
}
export async function setApprovalMode(
  this: ProjectStore,
  owner: string,
  projectId: string,
  mode: unknown,
) {
  await this.own(owner, projectId, 'owner');
  if (mode !== 'review' && mode !== 'auto')
    throw new HttpError(400, 'Choose review or automatic application.');
  const result = await this.stmt(
    'UPDATE projects SET approval_mode=?,updated_at=? WHERE id=? AND NOT EXISTS (SELECT 1 FROM branches WHERE project_id=? AND lock_token IS NOT NULL AND lock_until>?)',
    mode,
    now(),
    projectId,
    projectId,
    Date.now(),
  ).run();
  if (!result.meta.changes)
    throw new HttpError(
      409,
      'Wait for the current edit to finish before changing approval permissions.',
    );
  return this.detail(owner, projectId);
}
export async function commit(
  this: ProjectStore,
  input: TurnInput,
  result: TurnResult,
  volumeSummary: unknown,
  automatic = false,
) {
  const date = now(),
    newRevision = result.model ? result.revisionId : input.revisionId;
  const guard = `EXISTS (SELECT 1 FROM branches WHERE id=? AND lock_token=? AND head_revision_id=? AND EXISTS (SELECT 1 FROM turns t JOIN projects p ON p.id=t.project_id WHERE t.id=branches.lock_token AND (t.actor_id=p.owner_id OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id=p.id AND m.user_id=t.actor_id AND m.role='editor')))${automatic ? ' AND lock_until>' + Date.now() + " AND EXISTS (SELECT 1 FROM projects WHERE projects.id=branches.project_id AND approval_mode='auto')" : ''})`;
  const args = [input.branchId, input.requestId, input.revisionId];
  const stmts: D1PreparedStatement[] = [];
  if (result.model)
    stmts.push(
      this.stmt(
        `INSERT INTO revisions (id,project_id,branch_id,parent_id,ordinal,model_json,prompt,answer,summary_json,created_at,author_id) SELECT ?,?,?,?,(SELECT COALESCE(MAX(ordinal),-1)+1 FROM revisions WHERE project_id=?),?,?,?,?,?,(SELECT actor_id FROM turns WHERE id=?) WHERE ${guard}`,
        newRevision,
        input.projectId,
        input.branchId,
        input.revisionId,
        input.projectId,
        JSON.stringify(result.model),
        input.message,
        result.message,
        JSON.stringify(volumeSummary),
        date,
        input.requestId,
        ...args,
      ),
    );
  for (const [role, content, updated] of [
    ['user', input.message, 0],
    ['assistant', result.message, result.model ? 1 : 0],
  ])
    stmts.push(
      this.stmt(
        `INSERT INTO messages (id,project_id,branch_id,turn_id,ordinal,role,content,revision_id,updated,created_at) SELECT ?,?,?,?,(SELECT COALESCE(MAX(ordinal),-1)+1 FROM messages WHERE branch_id=?),?,?,?,?,? WHERE ${guard}`,
        id(),
        input.projectId,
        input.branchId,
        input.requestId,
        input.branchId,
        role,
        content,
        newRevision,
        updated,
        date,
        ...args,
      ),
    );
  stmts.push(
    this.stmt(
      `UPDATE turns SET status='completed',result_json=? WHERE id=? AND ${guard}`,
      JSON.stringify(result),
      input.requestId,
      ...args,
    ),
  );
  stmts.push(
    this.stmt(
      `UPDATE projects SET selected_revision_id=CASE WHEN active_branch_id=? AND selected_revision_id=? THEN ? ELSE selected_revision_id END,updated_at=? WHERE id=? AND ${guard}`,
      input.branchId,
      input.revisionId,
      newRevision,
      date,
      input.projectId,
      ...args,
    ),
  );
  stmts.push(
    this.stmt(
      `UPDATE branches SET head_revision_id=?,lock_token=NULL,lock_until=0 WHERE ${guard} AND id=?`,
      newRevision,
      ...args,
      input.branchId,
    ),
  );
  const outcome = await this.db.batch(stmts);
  if (!outcome.at(-1)?.meta.changes)
    throw new HttpError(
      409,
      'The request was cancelled or superseded; no model was saved.',
    );
}
export async function fail(
  this: ProjectStore,
  input: TurnInput,
  message: string,
  cancelled = false,
) {
  await this.db.batch([
    this.stmt(
      "UPDATE turns SET status=?,error=? WHERE id=? AND project_id=? AND status='pending'",
      cancelled ? 'cancelled' : 'failed',
      message,
      input.requestId,
      input.projectId,
    ),
    this.stmt(
      'UPDATE branches SET conversation_id=NULL,lock_token=NULL,lock_until=0 WHERE id=? AND lock_token=?',
      input.branchId,
      input.requestId,
    ),
  ]);
}
export async function cancel(this: ProjectStore, owner: string, raw: unknown) {
  const input = validateTurn(raw);
  await this.assertBranchWrite(owner, input.projectId, input.branchId);
  const branch = await this.stmt(
    'SELECT id FROM branches WHERE id=? AND project_id=?',
    input.branchId,
    input.projectId,
  ).first();
  if (!branch) throw new HttpError(404, 'Branch not found.');
  // Record cancellation even if the generation request has not reached begin yet.
  await this.stmt(
    "INSERT INTO turns (id,project_id,branch_id,base_revision_id,prompt,proposal_id,status,created_at) VALUES (?,?,?,?,?,?,'cancelled',?) ON CONFLICT(id) DO NOTHING",
    input.requestId,
    input.projectId,
    input.branchId,
    input.revisionId,
    input.message,
    input.proposalId ?? null,
    now(),
  ).run();
  const t = await this.stmt(
    'SELECT * FROM turns WHERE id=? AND project_id=?',
    input.requestId,
    input.projectId,
  ).first<Row>();
  if (
    !t ||
    t.branch_id !== input.branchId ||
    t.base_revision_id !== input.revisionId ||
    (t.proposal_id ?? null) !== (input.proposalId ?? null) ||
    t.prompt !== input.message
  )
    throw new HttpError(409, 'This request identifier was already used.');
  if (t.status === 'pending') await this.fail(input, 'Cancelled.', true);
  const current = await this.stmt(
    'SELECT status FROM turns WHERE id=?',
    input.requestId,
  ).first<Row>();
  return { status: current?.status };
}
