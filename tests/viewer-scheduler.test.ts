import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderScheduler } from '../lib/viewer/render-scheduler';
void test('demand renderer coalesces changes, settles and stops when idle', () => {
  const frames = new Map<number, () => void>();
  let id = 0,
    draws = 0;
  const s = createRenderScheduler(
    () => ++draws < 3,
    (fn) => {
      frames.set(++id, fn);
      return id;
    },
    (id) => {
      frames.delete(id);
    },
  );
  s.invalidate();
  s.invalidate();
  assert.equal(frames.size, 1);
  while (frames.size) {
    const [key, fn] = [...frames][0];
    frames.delete(key);
    fn();
  }
  assert.equal(draws, 3);
  assert.equal(frames.size, 0);
  s.invalidate();
  s.dispose();
  assert.equal(frames.size, 0);
  s.invalidate();
  assert.equal(frames.size, 0);
});
