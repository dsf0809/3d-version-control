import type { ProjectStore } from './store';
import { HttpError } from './http';
import type { TurnResult } from './types';
export type TurnStatus = {
  status: 'pending' | 'completed' | 'failed' | 'cancelled' | 'expired';
  phase: string;
  result?: TurnResult;
  error?: string;
};
export async function turnStatus(
  store: ProjectStore,
  owner: string,
  projectId: string,
  requestId: string,
): Promise<TurnStatus> {
  await store.own(owner, projectId, 'view');
  const row = await store
    .stmt(
      'SELECT t.*, b.lock_token,b.lock_until FROM turns t JOIN branches b ON b.id=t.branch_id WHERE t.id=? AND t.project_id=?',
      requestId,
      projectId,
    )
    .first<any>();
  if (!row) throw new HttpError(404, 'Request not found.');
  if (
    row.status === 'pending' &&
    (row.lock_token !== requestId || row.lock_until <= Date.now())
  )
    return {
      status: 'expired',
      phase: 'expired',
      error:
        'This request stopped before saving a result. Send a new request to try again.',
    };
  return {
    status: row.status,
    phase: row.status === 'pending' ? row.phase : row.status,
    ...(row.result_json ? { result: JSON.parse(row.result_json) } : {}),
    ...(row.error ? { error: row.error } : {}),
  };
}
export async function setTurnPhase(
  store: ProjectStore,
  requestId: string,
  phase: 'context' | 'generating' | 'validating' | 'saving',
) {
  await store
    .stmt(
      "UPDATE turns SET phase=? WHERE id=? AND status='pending'",
      phase,
      requestId,
    )
    .run();
}
