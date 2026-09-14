import { mergeModels, type MergeChoices } from '../cad/merge';
import { validateGeneratedModel } from '../cad/model';
import { validateComparison } from '../cad/geometry';
import { HttpError } from './http';
import { saveProposal } from './proposals';
import type { ProjectStore } from './store';
import type { TurnInput } from './types';
export async function prepareMerge(
  store: ProjectStore,
  actor: string,
  projectId: string,
  body: {
    sourceBranchId: string;
    targetBranchId: string;
    sourceRevisionId?: string;
    targetRevisionId?: string;
    choices?: MergeChoices;
    preview?: boolean;
  },
) {
  await store.assertBranchWrite(actor, projectId, body.targetBranchId);
  if (body.sourceBranchId === body.targetBranchId)
    throw new HttpError(400, 'Choose two different branches.');
  const p = await store.detail(actor, projectId, {
    branchId: body.targetBranchId,
  });
  const source = p.branches.find((b) => b.id === body.sourceBranchId),
    target = p.branches.find((b) => b.id === body.targetBranchId);
  if (!source || !target) throw new HttpError(404, 'Branch not found.');
  if (
    (body.sourceRevisionId &&
      body.sourceRevisionId !== source.headRevisionId) ||
    (body.targetRevisionId && body.targetRevisionId !== target.headRevisionId)
  )
    throw new HttpError(409, 'A branch changed. Preview the merge again.');
  const byId = new Map(p.revisions.map((r) => [r.id, r]));
  const ancestry = (head: string) => {
    const seen = new Set<string>(),
      queue = [head];
    while (queue.length) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const r = byId.get(id);
      if (r?.parentId) queue.push(r.parentId);
      if (r?.mergeParentId) queue.push(r.mergeParentId);
    }
    return seen;
  };
  const targetAncestors = ancestry(target.headRevisionId),
    sourceAncestors = ancestry(source.headRevisionId);
  if (targetAncestors.has(source.headRevisionId))
    throw new HttpError(400, 'This branch is already included in the target.');
  const common = [...sourceAncestors].find((id) => targetAncestors.has(id));
  if (!common)
    throw new HttpError(
      409,
      'These branches have no common starting revision.',
    );
  if (
    body.choices &&
    (typeof body.choices !== 'object' ||
      Array.isArray(body.choices) ||
      Object.values(body.choices).some((c) => c !== 'source' && c !== 'target'))
  )
    throw new HttpError(400, 'Choose source or target for each conflict.');
  const merged = mergeModels(
    byId.get(common)!.model,
    byId.get(target.headRevisionId)!.model,
    byId.get(source.headRevisionId)!.model,
    body.choices,
  );
  const info = {
    conflicts: merged.conflicts,
    sourceRevisionId: source.headRevisionId,
    targetRevisionId: target.headRevisionId,
    baseRevisionId: common,
  };
  if (body.preview || merged.conflicts.length) return info;
  let model;
  try {
    model = validateGeneratedModel(merged.model);
  } catch (e) {
    throw new HttpError(
      400,
      e instanceof Error ? e.message : 'Invalid merged design.',
    );
  }
  const volumes = validateComparison(
    byId.get(target.headRevisionId)!.model,
    model,
  );
  const input: TurnInput = {
    projectId,
    branchId: target.id,
    revisionId: target.headRevisionId,
    requestId: crypto.randomUUID(),
    message: `Merge ${source.name} V${byId.get(source.headRevisionId)!.ordinal} into ${target.name}.`,
  };
  await store.begin(actor, input);
  try {
    await saveProposal(
      store,
      input,
      {
        model,
        message: `Review contributions from ${source.name}. Accept to merge the selected source revision; both histories are retained.`,
        revisionId: target.headRevisionId,
        branchId: target.id,
        proposalId: crypto.randomUUID(),
        mergeParentId: source.headRevisionId,
      },
      volumes,
    );
  } catch (e) {
    await store.fail(input, 'Could not prepare merge.');
    throw e;
  }
  return { ...info, ready: true };
}
