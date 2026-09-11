import test from 'node:test';
import assert from 'node:assert/strict';
import { threeMF } from '../lib/cad/three-mf';
import { buildGeometry } from '../lib/cad/geometry';
import { sample } from '../lib/cad/model';
function entries(bytes: Uint8Array) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    files: Record<string, string> = {};
  let offset = 0;
  while (v.getUint32(offset, true) === 0x04034b50) {
    assert.equal(v.getUint16(offset + 8, true), 0);
    const size = v.getUint32(offset + 18, true),
      nameLength = v.getUint16(offset + 26, true),
      extra = v.getUint16(offset + 28, true);
    const start = offset + 30 + nameLength + extra;
    files[
      new TextDecoder().decode(
        bytes.slice(offset + 30, offset + 30 + nameLength),
      )
    ] = new TextDecoder().decode(bytes.slice(start, start + size));
    offset = start + size;
  }
  assert.equal(v.getUint32(offset, true), 0x02014b50);
  assert.equal(v.getUint32(bytes.length - 22, true), 0x06054b50);
  return files;
}
test('3MF preserves exact accepted triangle coordinates, units and display material', () => {
  const positions = buildGeometry(sample).positions;
  const files = entries(threeMF(positions, 'Tray & "test" <model>'));
  assert.deepEqual(Object.keys(files), [
    '[Content_Types].xml',
    '_rels/.rels',
    '3D/3dmodel.model',
  ]);
  const xml = files['3D/3dmodel.model'];
  assert.ok(xml.includes('unit="millimeter"'));
  assert.ok(xml.includes('#778EE0FF'));
  assert.ok(xml.includes('Tray &amp; &quot;test&quot; &lt;model&gt;'));
  const vertices = [
    ...xml.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\/>/g),
  ].map((m) => m.slice(1).map(Number));
  const triangles = [
    ...xml.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"\/>/g),
  ];
  const restored = triangles.flatMap((m) =>
    m.slice(1).flatMap((i) => vertices[Number(i)]),
  );
  assert.deepEqual(restored, Array.from(positions));
  assert.ok(!xml.includes('gcode'));
});
test('3MF rejects empty, non-finite and degenerate meshes', () => {
  assert.throws(() => threeMF(new Float32Array(), 'Bad'));
  assert.throws(() => threeMF(new Float32Array(9), 'Bad'));
  assert.throws(() =>
    threeMF(new Float32Array([NaN, 0, 0, 1, 0, 0, 0, 1, 0]), 'Bad'),
  );
});
