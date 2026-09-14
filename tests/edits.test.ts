import test from 'node:test';
import assert from 'node:assert/strict';
import { applyEdits } from '../lib/cad/edits';
import { sample, upgradeModel } from '../lib/cad/model';
import { validateComparison, compareGeometry } from '../lib/cad/geometry';
void test('targeted commands preserve untouched features and never mutate their base', () => {
  const base = upgradeModel(sample),
    snapshot = structuredClone(base),
    featureId = base.operations[2].id;
  const model = applyEdits(
    base,
    {
      baseId: 'r1',
      commands: [
        { kind: 'set-vector', featureId, field: 'size', value: [5, 76, 23] },
        { kind: 'rename-feature', featureId, name: 'Divider' },
      ],
    },
    'r1',
  );
  assert.deepEqual(base, snapshot);
  assert.deepEqual(model.operations[0], base.operations[0]);
  assert.equal(model.operations[2].size[0], 5);
  assert.deepEqual(
    validateComparison(base, model),
    compareGeometry(base, model).volumes,
  );
});
void test('edits reject stale targets, unknown fields, invalid dimensions and duplicate identities atomically', () => {
  const base = upgradeModel(sample),
    snapshot = structuredClone(base),
    featureId = base.operations[0].id;
  assert.throws(
    () =>
      applyEdits(
        base,
        { baseId: 'old', commands: [{ kind: 'rename-model', name: 'New' }] },
        'new',
      ),
    /stale/,
  );
  for (const command of [
    {
      kind: 'set-vector',
      featureId: 'missing',
      field: 'size',
      value: [1, 2, 3],
    },
    { kind: 'set-vector', featureId, field: '__proto__', value: [1, 2, 3] },
    { kind: 'set-vector', featureId, field: 'size', value: [0, 2, 3] },
    { kind: 'rename-model', name: 'New', extra: true },
    { kind: 'add-feature', feature: base.operations[0], index: 1 },
    { kind: 'move-feature', featureId, index: 99 },
  ])
    assert.throws(() =>
      applyEdits(
        base,
        {
          baseId: 'r',
          commands: [{ kind: 'rename-model', name: 'Changed' }, command],
        },
        'r',
      ),
    );
  assert.deepEqual(base, snapshot);
});
void test('add, reorder and remove commands produce a valid isolated model', () => {
  const base = upgradeModel(sample),
    feature = { ...base.operations[0], id: 'new_feature', name: 'New feature' };
  const model = applyEdits(
    base,
    {
      baseId: 'r',
      commands: [
        { kind: 'add-feature', feature, index: base.operations.length },
        { kind: 'move-feature', featureId: feature.id, index: 0 },
        { kind: 'remove-feature', featureId: base.operations[0].id },
        { kind: 'rename-model', name: 'Edited' },
      ],
    },
    'r',
  );
  assert.equal(model.operations.length, base.operations.length);
  assert.equal(model.operations[0].id, feature.id);
  assert.equal(model.name, 'Edited');
});
