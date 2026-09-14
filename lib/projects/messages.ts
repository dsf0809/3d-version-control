import type { ProjectStore } from './store';
import { HttpError } from './http';
import type { SavedMessage } from './types';
export const MESSAGE_PAGE_SIZE = 40;
export async function messagePage(
  store: ProjectStore,
  owner: string,
  projectId: string,
  branchId: string,
  before?: number,
) {
  await store.own(owner, projectId, 'view');
  if (
    !(await store
      .stmt(
        'SELECT id FROM branches WHERE id=? AND project_id=?',
        branchId,
        projectId,
      )
      .first())
  )
    throw new HttpError(404, 'Branch not found.');
  if (before != null && (!Number.isSafeInteger(before) || before < 0))
    throw new HttpError(400, 'Invalid message cursor.');
  const rows = (
    await store
      .stmt(
        `SELECT * FROM messages WHERE branch_id=? ${before == null ? '' : 'AND ordinal<?'} ORDER BY ordinal DESC LIMIT ?`,
        branchId,
        ...(before == null ? [] : [before]),
        MESSAGE_PAGE_SIZE + 1,
      )
      .all<any>()
  ).results;
  const page = rows.slice(0, MESSAGE_PAGE_SIZE).reverse();
  return {
    messages: page.map(
      (m): SavedMessage => ({
        id: m.id,
        turnId: m.turn_id,
        proposalId: m.proposal_id,
        role: m.role,
        content: m.content,
        updated: !!m.updated,
        revisionId: m.revision_id,
      }),
    ),
    messageCursor:
      rows.length > MESSAGE_PAGE_SIZE ? (page[0].ordinal as number) : null,
  };
}
