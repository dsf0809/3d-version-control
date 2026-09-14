import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTemplate,
  templates,
  type TemplateId,
} from '../lib/cad/templates';
import { buildGeometry } from '../lib/cad/geometry';
void test('every starting template produces a nonempty solid at the specified dimensions', () => {
  for (const id of Object.keys(templates) as TemplateId[]) {
    const model = createTemplate(id),
      g = buildGeometry(model),
      d = templates[id].dimensions;
    assert.deepEqual(g.dimensions, [d.width, d.depth, d.height]);
    assert.ok(g.volume > 0);
    assert.equal(model.schemaVersion, 2);
    assert.equal(
      new Set(model.operations.map((o) => o.id)).size,
      model.operations.length,
    );
  }
});
void test('template parameters reject impossible walls and preserve independent models', () => {
  const d = { width: 80, depth: 60, height: 30, wall: 3 };
  assert.throws(() => createTemplate('tray', { ...d, wall: 20 }));
  assert.throws(() => createTemplate('tray', { ...d, width: NaN }));
  const a = createTemplate('tray', d),
    b = createTemplate('tray', d);
  a.operations[0].size[0] = 90;
  assert.equal(b.operations[0].size[0], 80);
  assert.equal(d.width, 80);
});
