import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { resizeCamera, fitCameraDistance, anchorCamera } from '../lib/viewer-camera';

const pixelOffset = (camera: PerspectiveCamera, width: number, height: number) => {
  const point = new Vector3(12, 8, 0).project(camera);
  return [point.x * width / 2, point.y * height / 2];
};
test('focus resize preserves projected model scale and camera pose after user zoom', () => {
  const camera = new PerspectiveCamera(36, 1, 0.1, 4000);
  camera.position.set(0, 0, 120);
  camera.updateMatrixWorld();
  resizeCamera(camera, 694, 199, 0);
  camera.zoom = 1.7;
  camera.updateProjectionMatrix();
  const before = pixelOffset(camera, 694, 199);
  for (let i = 0; i < 10; i++) {
    resizeCamera(camera, 694, 496, 199);
    const after = pixelOffset(camera, 694, 496);
    after.forEach((n, index) => assert.ok(Math.abs(n - before[index]) < 1e-8));
    resizeCamera(camera, 694, 199, 496);
  }
  assert.ok(Math.abs(camera.zoom - 1.7) < 1e-10);
  assert.deepEqual(camera.position.toArray(), [0, 0, 120]);
});
test('fit remains valid after focus resizing, including a narrow viewport', () => {
  const camera = new PerspectiveCamera(36, 1, 0.1, 4000);
  resizeCamera(camera, 300, 200, 0);
  resizeCamera(camera, 300, 550, 200);
  camera.position.set(0, 0, fitCameraDistance(camera, 85));
  camera.updateMatrixWorld();
  for (const point of [new Vector3(85, 0, 0), new Vector3(0, 85, 0)]) {
    const p = point.project(camera);
    assert.ok(Math.abs(p.x) < 1 && Math.abs(p.y) < 1);
  }
});

test('focus keeps absolute screen positions fixed when the canvas origin and height change', () => {
  const camera = new PerspectiveCamera(36, 1, 0.1, 4000);
  camera.position.set(15, -35, 180);
  camera.lookAt(4, 2, 0);
  camera.updateMatrixWorld();
  const normal = { x: 261, y: 330, width: 694, height: 199 };
  const focus = { x: 261, y: 174, width: 694, height: 496 };
  const screen = (point: Vector3, rect: typeof normal) => {
    const p = point.clone().project(camera);
    return [rect.x + (p.x + 1) * rect.width / 2, rect.y + (1 - p.y) * rect.height / 2];
  };
  const points = [new Vector3(0, 0, 0), new Vector3(20, 8, 5), new Vector3(-30, -12, 15)];
  resizeCamera(camera, normal.width, normal.height, 0);
  const before = points.map(p => screen(p, normal));
  for (let i = 0; i < 10; i++) {
    resizeCamera(camera, focus.width, focus.height, normal.height);
    anchorCamera(camera, focus.width, focus.height,
      focus.x + focus.width / 2 - normal.x - normal.width / 2,
      focus.y + focus.height / 2 - normal.y - normal.height / 2);
    points.forEach((p, index) => screen(p, focus).forEach((n, axis) =>
      assert.ok(Math.abs(n - before[index][axis]) < 1e-8)));
    resizeCamera(camera, normal.width, normal.height, focus.height);
    anchorCamera(camera, normal.width, normal.height, 0, 0);
    points.forEach((p, index) => screen(p, normal).forEach((n, axis) =>
      assert.ok(Math.abs(n - before[index][axis]) < 1e-8)));
  }
});
