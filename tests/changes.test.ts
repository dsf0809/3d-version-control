import test from 'node:test';
import assert from 'node:assert/strict';
import { sample, upgradeModel } from '../lib/cad/model';
import { featureChanges } from '../lib/cad/changes';
test('measured changes match stable features and include before/after geometry', () => {
  const a = upgradeModel(sample),
    b = structuredClone(a);
  assert.deepEqual(featureChanges(a, b), []);
  b.operations[2].name = 'Partition';
  b.operations[2].position[0] = -10;
  b.operations[2].size[0] = 4;
  b.operations[2].rotation[2] = 15;
  const changes = featureChanges(a, b);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].id, a.operations[2].id);
  assert.ok(
    changes[0].details.some((d) => d.includes('Renamed: Divider → Partition')),
  );
  assert.ok(changes[0].details.some((d) => d.startsWith('Dimensions:')));
  assert.ok(changes[0].details.some((d) => d.startsWith('Center:')));
  assert.ok(changes[0].details.some((d) => d.startsWith('Rotation:')));
  assert.deepEqual(changes[0].before, a.operations[2]);
  assert.deepEqual(changes[0].after, b.operations[2]);
});
test('added and removed features preserve the correct highlight side', () => {
  const a = upgradeModel(sample),
    b = structuredClone(a);
  b.operations[2].id = 'new-divider';
  const changes = featureChanges(a, b);
  assert.equal(changes.length, 2);
  assert.equal(changes[0].after, undefined);
  assert.ok(changes[0].details[0].startsWith('Removed'));
  assert.equal(changes[1].before, undefined);
  assert.ok(changes[1].details[0].startsWith('Added'));
});
