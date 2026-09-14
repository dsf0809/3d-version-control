import test from 'node:test';
import assert from 'node:assert/strict';
import { sample, upgradeModel, validateModel } from '../lib/cad/model';
import { applyEdits } from '../lib/cad/edits';
import { buildGeometry, compareGeometry } from '../lib/cad/geometry';
import { featureChanges } from '../lib/cad/changes';
import { threeMF } from '../lib/cad/three-mf';
void test('linked dimensions propagate in dependency order without mutating their source model', () => {
  const m = upgradeModel(sample),
    a = m.operations[0].id!,
    b = m.operations[2].id!;
  m.relationships = [
    {
      target: { featureId: b, field: 'size', axis: 1 },
      source: { featureId: a, field: 'size', axis: 1 },
      factor: 1,
      offset: -4,
    },
  ];
  const updated = applyEdits(
    m,
    {
      baseId: 'v',
      commands: [
        {
          kind: 'set-vector',
          featureId: a,
          field: 'size',
          value: [120, 100, 26],
        },
      ],
    },
    'v',
  );
  assert.equal(updated.operations[2].size[1], 96);
  assert.equal(m.operations[0].size[1], 80);
  updated.relationships!.push({
    target: { featureId: a, field: 'size', axis: 1 },
    source: { featureId: b, field: 'size', axis: 1 },
    factor: 1,
    offset: 4,
  });
  assert.throws(() => validateModel(updated), /cycles/);
  const invalid = structuredClone(m);
  invalid.relationships![0].source.featureId = 'missing';
  assert.throws(() => validateModel(invalid), /missing/);
});
void test('surface ownership includes added features and cut faces; color-only changes preserve geometry', () => {
  const model = upgradeModel(sample),
    g = buildGeometry(model);
  assert.equal(g.owners.length, g.positions.length / 9);
  assert.ok(
    g.owners.some((i) => i === 2),
    'Divider has selectable surfaces',
  );
  assert.ok(
    g.owners.some((i) => i === 1),
    'Cutter owns cavity surfaces',
  );
  const colored = applyEdits(
    model,
    {
      baseId: 'v',
      commands: [
        {
          kind: 'set-color',
          featureId: model.operations[2].id,
          color: '#ff0000',
        },
      ],
    },
    'v',
  );
  assert.equal(compareGeometry(model, colored).volumes.added, 0);
  assert.ok(
    featureChanges(model, colored).some((c) =>
      c.details.some((d) => d.startsWith('Color:')),
    ),
  );
  const data = new TextDecoder().decode(
    threeMF(
      g.positions,
      'Colored tray',
      Array.from(g.owners, (i) => colored.operations[i].color || '#778ee0'),
    ),
  );
  assert.match(data, /#FF0000FF/);
  assert.match(data, /p1="1"/);
});
void test('invalid appearance and malformed relationships are rejected', () => {
  const m = upgradeModel(sample);
  m.operations[0].color = 'red';
  assert.throws(() => validateModel(m), /hex/);
  delete m.operations[0].color;
  (m as any).relationships = {};
  assert.throws(() => validateModel(m), /array/);
});
