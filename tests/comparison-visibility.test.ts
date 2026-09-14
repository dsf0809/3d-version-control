import test from 'node:test';
import assert from 'node:assert/strict';
import { Mesh, BoxGeometry, MeshBasicMaterial, Object3D } from 'three';
import { applyComparisonVisibility, comparisonLayers } from '../lib/viewer/comparison-visibility';
void test('all eight layer combinations hide geometry and outlines without mutating model geometry', () => {
  const layers = comparisonLayers.map((name) => { const m = new Mesh(new BoxGeometry(), new MeshBasicMaterial()); m.name = name; return m; });
  const outlines = comparisonLayers.slice(0, 2).map((name) => { const o = new Object3D(); o.name = name; return o; });
  const original = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  const geometry = layers.map((m) => m.geometry);
  for (let mask = 0; mask < 8; mask++) {
    const visibility = { removed: !!(mask & 1), added: !!(mask & 2), unchanged: !!(mask & 4) };
    applyComparisonVisibility([...layers, ...outlines, original], visibility);
    for (const o of [...layers, ...outlines]) assert.equal(o.visible, visibility[o.name as keyof typeof visibility]);
    assert.equal(original.visible, true);
    layers.forEach((m, i) => assert.equal(m.geometry, geometry[i]));
    const replacement = new Object3D(); replacement.name = 'removed';
    applyComparisonVisibility([replacement], visibility);
    assert.equal(replacement.visible, visibility.removed);
  }
  for (const m of [...layers, original]) { m.geometry.dispose(); m.material.dispose(); }
});
