import type { ProjectStore } from './store';
import { HttpError } from './http';
import { validateGeneratedModel } from '../cad/model';
import { validateComparison } from '../cad/geometry';
import { listProposals, saveProposal } from './proposals';
export async function editProperties(
  store: ProjectStore,
  owner: string,
  projectId: string,
  body: any,
) {
  const detail = await store.detail(owner, projectId, {
    branchId: body.branchId,
    revisionId: body.revisionId,
  });
  const base = detail.revisions.find((r) => r.id === body.revisionId)!;
  const pending = (await listProposals(store, body.branchId)).find(
    (p) => p.id === body.proposalId && p.status === 'pending',
  );
  let model = structuredClone(pending?.model || base.model);
  const feature = model.operations.find((o) => o.id === body.featureId);
  if (!feature) throw new HttpError(400, 'Choose a feature.');
  if (typeof body.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(body.color))
    throw new HttpError(400, 'Choose a valid color.');
  feature.color = body.color;
  if (!Array.isArray(body.relationships))
    throw new HttpError(400, 'Provide dimension links.');
  model.relationships = body.relationships;
  model = validateGeneratedModel(model);
  const input = {
    projectId,
    branchId: body.branchId,
    revisionId: body.revisionId,
    proposalId: body.proposalId,
    requestId: crypto.randomUUID(),
    message: `Update ${feature.name} appearance and dimension links.`,
  };
  await store.begin(owner, input);
  try {
    await saveProposal(
      store,
      input,
      {
        model,
        message: 'Review the feature color and dimension links.',
        branchId: body.branchId,
        revisionId: body.revisionId,
        proposalId: crypto.randomUUID(),
      },
      validateComparison(base.model, model),
    );
  } catch (e) {
    await store.fail(
      input,
      e instanceof Error ? e.message : 'Invalid feature properties',
    );
    throw e;
  }
  return store.detail(owner, projectId, {
    branchId: body.branchId,
    revisionId: body.revisionId,
  });
}
