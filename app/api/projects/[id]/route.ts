import { editProperties } from '@/lib/projects/feature-properties';
import { projectSnapshot } from '@/lib/projects/revisions';
import { projectStore } from '@/lib/projects/db';
import { setDimensionLock } from '@/lib/projects/locks';
import {
  reviewProposal,
  restoreRevision,
  editFeature,
} from '@/lib/projects/proposals';
import {
  ownerOf,
  readBody,
  json,
  failure,
  HttpError,
} from '@/lib/projects/http';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    return json(
      await projectSnapshot(
        projectStore(),
        ownerOf(request),
        (await context.params).id,
        {
          branchId:
            new URL(request.url).searchParams.get('branch') || undefined,
          revisionId:
            new URL(request.url).searchParams.get('revision') || undefined,
        },
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(request: Request, context: Context) {
  try {
    const owner = ownerOf(request),
      projectId = (await context.params).id,
      body = await readBody(request),
      store = projectStore();
    const respond = async (p: import('@/lib/projects/types').ProjectDetail) =>
      json(
        await projectSnapshot(store, owner, projectId, {
          branchId: p.activeBranchId,
          revisionId: p.selectedRevisionId,
        }),
      );
    if (body.action === 'feature-properties')
      return respond(await editProperties(store, owner, projectId, body));
    if (body.action === 'approval-mode')
      return respond(await store.setApprovalMode(owner, projectId, body.mode));
    if (body.action === 'dimension-lock')
      return respond(await setDimensionLock(store, owner, projectId, body));
    if (body.action === 'archive')
      return respond(await store.archive(owner, projectId, body.archived));
    if (body.action === 'edit-feature')
      return respond(await editFeature(store, owner, projectId, body));
    if (body.action === 'restore')
      return respond(
        await restoreRevision(
          store,
          owner,
          projectId,
          body.branchId,
          body.revisionId,
        ),
      );
    if (body.action === 'review')
      return respond(
        await reviewProposal(
          store,
          owner,
          projectId,
          body.proposalId,
          body.decision,
        ),
      );
    if (body.action === 'select')
      return respond(
        await store.select(owner, projectId, body.branchId, body.revisionId),
      );
    if (body.action === 'fork')
      return respond(
        await store.fork(owner, projectId, body.branchId, body.revisionId),
      );
    if (body.action === 'update')
      return respond(await store.update(owner, projectId, body));
    throw new HttpError(400, 'Unknown project action.');
  } catch (e) {
    return failure(e);
  }
}
