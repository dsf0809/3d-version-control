import type { ProjectStore } from './store';
import type { Proposal, TurnInput, TurnResult } from './types';
import { validateGeneratedModel, upgradeModel } from '../cad/model';
import { validateComparison } from '../cad/geometry';
import { HttpError } from './http';
import { checkLocks } from './locks';
type ProposalRow = {
  id: string;
  author_id: string | null;
  merge_parent_id: string | null;
  branch_id: string;
  base_revision_id: string;
  parent_proposal_id: string | null;
  status: Proposal['status'];
  model_json: string;
  prompt: string;
  answer: string;
  created_at: string;
  accepted_revision_id: string | null;
  summary_json: string;
};
export async function editFeature(
  store: ProjectStore,
  owner: string,
  projectId: string,
  body: {
    branchId: string;
    revisionId: string;
    proposalId?: string | null;
    featureId: string;
    size: unknown;
    position: unknown;
  },
) {
  const detail = await store.detail(owner, projectId);
  const base = detail.revisions.find((r) => r.id === body.revisionId);
  if (!base) throw new HttpError(404, 'Revision not found.');
  const pending = (await listProposals(store, body.branchId)).find(
    (p) => p.id === body.proposalId && p.status === 'pending',
  );
  let model = structuredClone(pending?.model ?? base.model);
  const feature = model.operations.find((o) => o.id === body.featureId);
  if (!feature) throw new HttpError(400, 'Choose an existing feature.');
  for (const value of [body.size, body.position]) {
    if (
      !Array.isArray(value) ||
      value.length !== 3 ||
      value.some((n) => typeof n !== 'number' || !Number.isFinite(n))
    )
      throw new HttpError(
        400,
        'Enter three finite numbers for dimensions and position.',
      );
  }
  if (
    JSON.stringify(feature.size) === JSON.stringify(body.size) &&
    JSON.stringify(feature.position) === JSON.stringify(body.position)
  )
    throw new HttpError(400, 'Change a dimension or position first.');
  for (const link of model.relationships || [])
    if (
      link.target.featureId === feature.id &&
      (body[link.target.field] as number[])[link.target.axis] !==
        feature[link.target.field][link.target.axis]
    )
      throw new HttpError(
        400,
        'This value is controlled by a dimension link. Remove the link before editing its target.',
      );
  feature.size = body.size as typeof feature.size;
  feature.position = body.position as typeof feature.position;
  let volumes: ReturnType<typeof validateComparison>;
  try {
    model = validateGeneratedModel(model);
    volumes = validateComparison(base.model, model);
  } catch (e) {
    throw new HttpError(
      400,
      e instanceof Error ? e.message : 'Invalid geometry.',
    );
  }
  const input: TurnInput = {
    projectId,
    branchId: body.branchId,
    revisionId: body.revisionId,
    proposalId: body.proposalId,
    requestId: crypto.randomUUID(),
    message: `Edit ${feature.name}: dimensions ${feature.size.join(' × ')} mm; center ${feature.position.join(', ')} mm.`,
  };
  await store.begin(owner, input);
  try {
    await saveProposal(
      store,
      input,
      {
        model,
        message:
          'Manual edit ready for review. Compare, accept, or discard the proposal.',
        revisionId: base.id,
        branchId: body.branchId,
        proposalId: crypto.randomUUID(),
      },
      volumes,
    );
  } catch (e) {
    await store.fail(input, 'Could not save manual edit.');
    throw e;
  }
  return store.detail(owner, projectId, { branchId: body.branchId });
}
export async function listProposals(
  store: ProjectStore,
  branchId: string,
  pendingOnly = false,
): Promise<Proposal[]> {
  const rows = await store
    .stmt(
      pendingOnly
        ? "SELECT * FROM proposals WHERE branch_id=? AND status='pending' ORDER BY created_at,id"
        : 'SELECT * FROM proposals WHERE branch_id=? ORDER BY created_at,id',
      branchId,
    )
    .all<ProposalRow>();
  return rows.results.map((r) => ({
    id: r.id,
    authorId: r.author_id,
    mergeParentId: r.merge_parent_id,
    branchId: r.branch_id,
    baseRevisionId: r.base_revision_id,
    parentProposalId: r.parent_proposal_id,
    status: r.status,
    model: upgradeModel(JSON.parse(r.model_json)),
    prompt: r.prompt,
    answer: r.answer,
    createdAt: r.created_at,
    acceptedRevisionId: r.accepted_revision_id,
    summary: JSON.parse(r.summary_json),
  }));
}
export async function saveProposal(
  store: ProjectStore,
  input: TurnInput,
  result: TurnResult,
  volumes: unknown,
) {
  const model = validateGeneratedModel(result.model),
    proposalId = result.proposalId!;
  await checkLocks(store, input.projectId, model);
  const guard =
    "EXISTS (SELECT 1 FROM branches WHERE id=? AND lock_token=? AND head_revision_id=? AND EXISTS (SELECT 1 FROM turns t JOIN projects p ON p.id=t.project_id WHERE t.id=branches.lock_token AND (t.actor_id=p.owner_id OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id=p.id AND m.user_id=t.actor_id AND m.role='editor'))))";
  const args = [input.branchId, input.requestId, input.revisionId],
    date = new Date().toISOString();
  const stmts = [
    store.stmt(
      `UPDATE proposals SET status='superseded' WHERE branch_id=? AND status='pending' AND ${guard}`,
      input.branchId,
      ...args,
    ),
    store.stmt(
      `INSERT INTO proposals (id,project_id,branch_id,base_revision_id,parent_proposal_id,status,model_json,prompt,answer,summary_json,created_at,author_id,merge_parent_id) SELECT ?,?,?,?,?,'pending',?,?,?,?,?,(SELECT actor_id FROM turns WHERE id=?),? WHERE ${guard}`,
      proposalId,
      input.projectId,
      input.branchId,
      input.revisionId,
      input.proposalId ?? null,
      JSON.stringify(model),
      input.message,
      result.message,
      JSON.stringify(volumes),
      date,
      input.requestId,
      result.mergeParentId ?? null,
      ...args,
    ),
  ];
  for (const [role, content] of [
    ['user', input.message],
    ['assistant', result.message],
  ])
    stmts.push(
      store.stmt(
        `INSERT INTO messages (id,project_id,branch_id,turn_id,proposal_id,ordinal,role,content,revision_id,updated,created_at) SELECT ?,?,?,?,?,(SELECT COALESCE(MAX(ordinal),-1)+1 FROM messages WHERE branch_id=?),?,?,?,0,? WHERE ${guard}`,
        crypto.randomUUID(),
        input.projectId,
        input.branchId,
        input.requestId,
        proposalId,
        input.branchId,
        role,
        content,
        input.revisionId,
        date,
        ...args,
      ),
    );
  stmts.push(
    store.stmt(
      `UPDATE turns SET status='completed',result_json=? WHERE id=? AND ${guard}`,
      JSON.stringify(result),
      input.requestId,
      ...args,
    ),
  );
  stmts.push(
    store.stmt(
      `UPDATE projects SET updated_at=? WHERE id=? AND ${guard}`,
      date,
      input.projectId,
      ...args,
    ),
  );
  stmts.push(
    store.stmt(
      'UPDATE branches SET lock_token=NULL,lock_until=0 WHERE id=? AND lock_token=? AND head_revision_id=?',
      ...args,
    ),
  );
  const saved = await store.db.batch(stmts);
  if (!saved.at(-1)?.meta.changes)
    throw new HttpError(
      409,
      'The request was cancelled or superseded; no proposal was saved.',
    );
}
export async function reviewProposal(
  store: ProjectStore,
  owner: string,
  projectId: string,
  proposalId: string,
  decision: 'accept' | 'discard',
) {
  await store.own(owner, projectId);
  if (
    !['accept', 'discard'].includes(decision) ||
    typeof proposalId !== 'string'
  )
    throw new HttpError(400, 'Choose accept or discard for a proposal.');
  const p = await store
    .stmt(
      'SELECT * FROM proposals WHERE id=? AND project_id=?',
      proposalId,
      projectId,
    )
    .first<ProposalRow>();
  if (!p) throw new HttpError(404, 'Proposal not found.');
  await store.assertBranchWrite(owner, projectId, p.branch_id);
  const target = decision === 'accept' ? 'accepted' : 'discarded';
  if (p.status === target)
    return store.detail(owner, projectId, { branchId: p.branch_id });
  if (p.status !== 'pending')
    throw new HttpError(
      409,
      'This proposal has already been reviewed or replaced.',
    );
  const token = crypto.randomUUID(),
    time = Date.now();
  const locked = await store
    .stmt(
      'UPDATE branches SET lock_token=?,lock_until=? WHERE id=? AND project_id=? AND lock_until<? RETURNING head_revision_id',
      token,
      time + 60000,
      p.branch_id,
      projectId,
      time,
    )
    .first<{ head_revision_id: string }>();
  if (!locked)
    throw new HttpError(
      409,
      'A request is in progress. Wait for it to finish before reviewing.',
    );
  try {
    if (decision === 'accept' && locked.head_revision_id !== p.base_revision_id)
      throw new HttpError(
        409,
        'This proposal is stale because its base revision changed. Discard it and request a new edit.',
      );
    const revisionId = crypto.randomUUID(),
      date = new Date().toISOString();
    const guard =
      "EXISTS (SELECT 1 FROM proposals p JOIN branches b ON b.id=p.branch_id WHERE p.id=? AND p.status='pending' AND b.lock_token=? AND b.head_revision_id=? AND EXISTS (SELECT 1 FROM projects project WHERE project.id=b.project_id AND (project.owner_id=? OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id=project.id AND m.user_id=? AND m.role='editor' AND b.created_by=m.user_id AND b.parent_branch_id IS NOT NULL))))";
    const args = [proposalId, token, locked.head_revision_id, owner, owner];
    const stmts: D1PreparedStatement[] = [];
    if (decision === 'accept') {
      const model = validateGeneratedModel(JSON.parse(p.model_json));
      await checkLocks(store, projectId, model);
      const base = await store
        .stmt('SELECT model_json FROM revisions WHERE id=?', p.base_revision_id)
        .first<{ model_json: string }>();
      if (!base) throw new HttpError(409, 'The proposal base is missing.');
      const volumes = validateComparison(
        upgradeModel(JSON.parse(base.model_json)),
        model,
      );
      stmts.push(
        store.stmt(
          `INSERT INTO revisions (id,project_id,branch_id,parent_id,ordinal,model_json,prompt,answer,summary_json,created_at,author_id,merge_parent_id) SELECT ?,?,?,?,(SELECT COALESCE(MAX(ordinal),-1)+1 FROM revisions WHERE project_id=?),?,?,?,?,?,?,? WHERE ${guard}`,
          revisionId,
          projectId,
          p.branch_id,
          p.base_revision_id,
          projectId,
          JSON.stringify(model),
          p.prompt,
          p.answer,
          JSON.stringify(volumes),
          date,
          p.author_id || owner,
          p.merge_parent_id,
          ...args,
        ),
      );
      stmts.push(
        store.stmt(
          `UPDATE messages SET revision_id=?,updated=CASE WHEN role='assistant' THEN 1 ELSE 0 END WHERE proposal_id=? AND ${guard}`,
          revisionId,
          proposalId,
          ...args,
        ),
      );
    }
    const message =
      decision === 'accept'
        ? 'Proposal accepted. Its model is now the accepted design.'
        : 'Proposal discarded. Continue from the accepted model; do not apply this proposal.';
    stmts.push(
      store.stmt(
        `INSERT INTO messages (id,project_id,branch_id,proposal_id,ordinal,role,content,revision_id,updated,created_at) SELECT ?,?,?,?,(SELECT COALESCE(MAX(ordinal),-1)+1 FROM messages WHERE branch_id=?),'assistant',?,?,0,? WHERE ${guard}`,
        crypto.randomUUID(),
        projectId,
        p.branch_id,
        proposalId,
        p.branch_id,
        message,
        decision === 'accept' ? revisionId : locked.head_revision_id,
        date,
        ...args,
      ),
    );
    stmts.push(
      store.stmt(
        `UPDATE projects SET selected_revision_id=CASE WHEN active_branch_id=? AND selected_revision_id=? THEN ? ELSE selected_revision_id END,updated_at=? WHERE id=? AND ${guard}`,
        p.branch_id,
        p.base_revision_id,
        decision === 'accept' ? revisionId : locked.head_revision_id,
        date,
        projectId,
        ...args,
      ),
    );
    // Update proposal before branch; subsequent branch guard keys off this decision.
    stmts.push(
      store.stmt(
        `UPDATE proposals SET status=?,accepted_revision_id=? WHERE id=? AND ${guard}`,
        target,
        decision === 'accept' ? revisionId : null,
        proposalId,
        ...args,
      ),
    );
    stmts.push(
      store.stmt(
        'UPDATE branches SET head_revision_id=?,conversation_id=NULL,lock_token=NULL,lock_until=0 WHERE id=? AND lock_token=? AND EXISTS (SELECT 1 FROM proposals WHERE id=? AND status=?)',
        decision === 'accept' ? revisionId : locked.head_revision_id,
        p.branch_id,
        token,
        proposalId,
        target,
      ),
    );
    const outcome = await store.db.batch(stmts);
    if (!outcome.at(-1)?.meta.changes)
      throw new HttpError(409, 'The proposal changed. Reload the project.');
    return store.detail(owner, projectId, { branchId: p.branch_id });
  } finally {
    await store
      .stmt(
        'UPDATE branches SET lock_token=NULL,lock_until=0 WHERE id=? AND lock_token=?',
        p.branch_id,
        token,
      )
      .run();
  }
}
export async function restoreRevision(
  store: ProjectStore,
  owner: string,
  projectId: string,
  branchId: string,
  revisionId: string,
) {
  const detail = await store.detail(owner, projectId);
  const branch = detail.branches.find((b) => b.id === branchId),
    source = detail.revisions.find((r) => r.id === revisionId);
  if (!branch || !source)
    throw new HttpError(404, 'Revision or branch not found.');
  const base = detail.revisions.find((r) => r.id === branch.headRevisionId)!;
  const input: TurnInput = {
    projectId,
    branchId,
    revisionId: base.id,
    requestId: crypto.randomUUID(),
    message: `Restore V${source.ordinal} as a new revision.`,
  };
  await store.begin(owner, input);
  try {
    const model = upgradeModel(source.model);
    const volumes = validateComparison(base.model, model);
    await saveProposal(
      store,
      input,
      {
        model,
        message: `Review restoring V${source.ordinal}. Accept to save it as a new revision without deleting history.`,
        revisionId: base.id,
        branchId,
        proposalId: crypto.randomUUID(),
      },
      volumes,
    );
  } catch (e) {
    await store.fail(input, 'Could not prepare restoration.');
    throw e;
  }
  return store.select(owner, projectId, branchId, base.id);
}
