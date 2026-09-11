import type { ProjectStore } from './store';
import type { Model } from '../cad/model';
import { HttpError } from './http';
export type DimensionLock = {
  featureId: string;
  name: string;
  axis: number;
  value: number;
};
export async function getLocks(
  store: ProjectStore,
  projectId: string,
): Promise<DimensionLock[]> {
  const row = await store
    .stmt('SELECT dimension_locks FROM projects WHERE id=?', projectId)
    .first<{ dimension_locks: string }>();
  return JSON.parse(row?.dimension_locks ?? '[]');
}
export async function checkLocks(
  store: ProjectStore,
  projectId: string,
  model: Model,
) {
  for (const lock of await getLocks(store, projectId)) {
    const feature = model.operations.find((o) => o.id === lock.featureId);
    if (!feature || feature.size[lock.axis] !== lock.value)
      throw new HttpError(
        409,
        `${lock.name}: ${['width', 'depth', 'height'][lock.axis]} is locked at ${lock.value} mm. Unlock it before changing or removing this feature.`,
      );
  }
}
export async function setDimensionLock(
  store: ProjectStore,
  owner: string,
  projectId: string,
  body: {
    revisionId: string;
    featureId: string;
    axis: number;
    locked: boolean;
  },
) {
  const p = await store.detail(owner, projectId);
  if (![0, 1, 2].includes(body.axis) || typeof body.locked !== 'boolean')
    throw new HttpError(400, 'Choose a dimension and lock state.');
  const feature = p.revisions
    .find((r) => r.id === body.revisionId)
    ?.model.operations.find((o) => o.id === body.featureId);
  if (!feature) throw new HttpError(404, 'Feature not found.');
  const old = await getLocks(store, projectId);
  const locks = old.filter(
    (l) => l.featureId !== body.featureId || l.axis !== body.axis,
  );
  if (body.locked)
    locks.push({
      featureId: feature.id!,
      name: feature.name,
      axis: body.axis,
      value: feature.size[body.axis],
    });
  const result = await store
    .stmt(
      'UPDATE projects SET dimension_locks=? WHERE id=? AND owner_id=? AND dimension_locks=? AND NOT EXISTS (SELECT 1 FROM branches WHERE project_id=? AND lock_until>?)',
      JSON.stringify(locks),
      projectId,
      owner,
      JSON.stringify(old),
      projectId,
      Date.now(),
    )
    .run();
  if (!result.meta.changes)
    throw new HttpError(
      409,
      'A request or lock update is in progress. Reload and try again.',
    );
  return store.detail(owner, projectId);
}
