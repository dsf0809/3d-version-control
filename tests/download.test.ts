import test from 'node:test';
import assert from 'node:assert/strict';
import { exportBlob } from '../lib/projects/download';
import { threeMF } from '../lib/cad/three-mf';
import { buildGeometry } from '../lib/cad/geometry';
import { sample } from '../lib/cad/model';
void test('3MF download preserves nonempty binary ZIP bytes', async () => {
 const bytes = threeMF(buildGeometry(sample).positions, 'Tray');
 const blob = await exportBlob('/export?format=3mf', async () => new Response(bytes, { headers: {'Content-Type':'model/3mf'} }));
 assert.equal(blob.size, bytes.length);
 assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes);
});
void test('download rejects empty, failed, login and invalid 3MF responses', async () => {
 for (const response of [new Response(null), Response.json({error:'Revision not found.'}, {status:404}), new Response('<html>Login</html>', {headers:{'Content-Type':'text/html'}}), Response.json({error:'Unexpected'})]) {
  await assert.rejects(exportBlob('/export?format=3mf', async () => response));
 }
});
