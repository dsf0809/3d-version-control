import type { ProjectStore } from './store';
import { HttpError } from './http';
import { upgradeModel } from '../cad/model';
import { messagePage } from './messages';
import { getLocks } from './locks';
import { listProposals } from './proposals';
import type { SavedRevision, ProjectDetail } from './types';
export type RevisionSummary = Omit<SavedRevision, 'model'> & {
  modelName?: string;
};
export const PAGE_SIZE = 40;
export function revisionSummary(r: any): RevisionSummary {
  return {
    authorId: r.author_id,
    mergeParentId: r.merge_parent_id,
    modelName: r.model_name,
    id: r.id,
    parentId: r.parent_id,
    branchId: r.branch_id,
    ordinal: r.ordinal,
    prompt: r.prompt,
    answer: r.answer,
    createdAt: r.created_at,
    summary: r.summary_json ? JSON.parse(r.summary_json) : undefined,
  };
}
const fields =
  "author_id,merge_parent_id,id,parent_id,branch_id,ordinal,prompt,answer,created_at,summary_json,json_extract(model_json,'$.name') AS model_name";
export async function getRevision(
  store: ProjectStore,
  owner: string,
  projectId: string,
  id: string,
): Promise<SavedRevision> {
  await store.own(owner, projectId, 'view');
  const r = await store
    .stmt('SELECT * FROM revisions WHERE id=? AND project_id=?', id, projectId)
    .first<any>();
  if (!r) throw new HttpError(404, 'Revision not found.');
  return {
    ...revisionSummary(r),
    model: upgradeModel(JSON.parse(r.model_json)),
  };
}
export async function revisionPage(
  store: ProjectStore,
  owner: string,
  projectId: string,
  before?: number,
) {
  await store.own(owner, projectId, 'view');
  if (before != null && (!Number.isSafeInteger(before) || before < 0))
    throw new HttpError(400, 'Invalid revision cursor.');
  const rows = (
    await store
      .stmt(
        `SELECT ${fields} FROM revisions WHERE project_id=? ${before == null ? '' : 'AND ordinal<?'} ORDER BY ordinal DESC LIMIT ?`,
        projectId,
        ...(before == null ? [] : [before]),
        PAGE_SIZE + 1,
      )
      .all<any>()
  ).results;
  const page = rows.slice(0, PAGE_SIZE).reverse();
  return {
    revisionIndex: page.map(revisionSummary),
    revisionCursor:
      rows.length > PAGE_SIZE ? (page[0].ordinal as number) : null,
  };
}
export async function projectSnapshot(
  store: ProjectStore,
  owner: string,
  id: string,
  view: { branchId?: string; revisionId?: string },
): Promise<ProjectDetail> {
  const p = await store.own(owner, id, 'view'),
    branchId = view.branchId || p.active_branch_id;
  const branches = (
    await store
      .stmt(
        'SELECT * FROM branches WHERE project_id=? ORDER BY created_at,id',
        id,
      )
      .all<any>()
  ).results;
  const b = branches.find((b) => b.id === branchId);
  if (!b) throw new HttpError(404, 'Branch not found.');
  const selectedId =
    view.revisionId ||
    (view.branchId ? b.head_revision_id : p.selected_revision_id);
  const member = await store
    .stmt(
      'WITH RECURSIVE history(id,parent_id) AS (SELECT id,parent_id FROM revisions WHERE id=? AND project_id=? UNION SELECT r.id,r.parent_id FROM revisions r JOIN history h ON r.id=h.parent_id WHERE r.project_id=?) SELECT id FROM history WHERE id=?',
      b.head_revision_id,
      id,
      id,
      selectedId,
    )
    .first();
  if (!member)
    throw new HttpError(404, 'Revision is not in this branch history.');
  const [selected, page, messages, locks] = await Promise.all([
    getRevision(store, owner, id, selectedId),
    revisionPage(store, owner, id),
    messagePage(store, owner, id, branchId),
    getLocks(store, id),
  ]);
  // Include navigation anchors as metadata only, even when they precede the current page.
  for (const anchor of [selected.id, selected.parentId, b.head_revision_id]) {
    if (!anchor || page.revisionIndex.some((r) => r.id === anchor)) continue;
    const r = await store
      .stmt(
        `SELECT ${fields} FROM revisions WHERE id=? AND project_id=?`,
        anchor,
        id,
      )
      .first<any>();
    if (r) page.revisionIndex.push(revisionSummary(r));
  }
  const proposals = (await listProposals(store, branchId, true)).filter(
    (p) => p.status === 'pending',
  );
  return {
    role: p.access_role,
    id,
    name: p.name,
    brief: p.brief,
    requirements: p.requirements,
    approvalMode: p.approval_mode === 'auto' ? 'auto' : 'review',
    archived: !!p.archived,
    activeBranchId: branchId,
    selectedRevisionId: selectedId,
    updatedAt: p.updated_at,
    branches: branches.map((b) => ({
      id: b.id,
      name: b.name,
      headRevisionId: b.head_revision_id,
      parentBranchId: b.parent_branch_id,
      forkRevisionId: b.fork_revision_id,
      createdBy: b.created_by || p.owner_id,
      canEdit:
        p.access_role === 'owner' ||
        (p.access_role === 'editor' &&
          !!b.parent_branch_id &&
          b.created_by === owner),
      conversationReady: !!b.conversation_id,
    })),
    revisions: [selected],
    ...page,
    ...messages,
    dimensionLocks: locks,
    proposals,
  };
}
