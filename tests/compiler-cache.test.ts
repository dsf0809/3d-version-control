import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GeometryCompiler,
  type GeometryWorkerLike,
} from '../lib/cad/compiler-cache';
class Worker implements GeometryWorkerLike {
  onmessage: GeometryWorkerLike['onmessage'] = null;
  onerror: GeometryWorkerLike['onerror'] = null;
  sent: unknown[] = [];
  terminated = false;
  postMessage(p: unknown) {
    this.sent.push(p);
  }
  terminate() {
    this.terminated = true;
  }
  complete(size = 9) {
    this.onmessage?.({ data: { ok: true, positions: new Float32Array(size) } });
  }
}
function fixture(budget?: number, timeout?: number) {
  const workers: Worker[] = [];
  return {
    workers,
    compiler: new GeometryCompiler(
      () => {
        const w = new Worker();
        workers.push(w);
        return w;
      },
      budget,
      timeout,
    ),
  };
}
void test('worker pool reuses geometry, deduplicates jobs, and limits concurrency to two', async () => {
  const { workers, compiler } = fixture();
  try {
    const a = compiler.run('a', {}),
      same = compiler.run('a', {}),
      b = compiler.run('b', {}),
      queued = compiler.run('c', {});
    assert.equal(workers.length, 2);
    workers[0].complete();
    assert.equal(workers[0].sent.length, 2);
    workers[1].complete();
    workers[0].complete();
    const results = await Promise.all([a, same, b, queued]);
    assert.equal(results[0], results[1]);
    assert.equal(await compiler.run('a', {}), results[0]);
    assert.equal(compiler.stats.builds, 3);
    assert.equal(compiler.stats.hits, 1);
  } finally {
    compiler.dispose();
  }
});
void test('cancelling one subscriber preserves shared work; cancelling last replaces worker', async () => {
  const { workers, compiler } = fixture();
  try {
    const first = new AbortController(),
      second = new AbortController();
    const a = compiler.run('a', {}, first.signal),
      shared = compiler.run('a', {}, second.signal);
    first.abort();
    await assert.rejects(a, { name: 'AbortError' });
    assert.equal(workers[0].terminated, false);
    workers[0].complete();
    await shared;
    const c = new AbortController(),
      cancelled = compiler.run('b', {}, c.signal);
    c.abort();
    await assert.rejects(cancelled, { name: 'AbortError' });
    assert.equal(workers[0].terminated, true);
    const retried = compiler.run('b', {});
    workers[1].complete();
    await retried;
  } finally {
    compiler.dispose();
  }
});
void test('cache evicts by byte budget and failed jobs can retry', async () => {
  const { workers, compiler } = fixture(55);
  try {
    const a = compiler.run('a', {});
    workers[0].complete();
    await a;
    const b = compiler.run('b', {});
    workers[0].complete();
    await b;
    const evicted = compiler.run('a', {});
    assert.equal(compiler.stats.builds, 3);
    workers[0].onmessage?.({ data: { ok: false, error: 'Bad geometry' } });
    await assert.rejects(evicted, /Bad geometry/);
    const retry = compiler.run('a', {});
    workers[0].complete();
    await retry;
  } finally {
    compiler.dispose();
  }
});
void test('timeout releases queue; dispose rejects pending work', async () => {
  const { workers, compiler } = fixture(undefined, 10);
  const timed = compiler.run('timeout', {});
  await assert.rejects(timed, /too long/);
  assert.equal(workers[0].terminated, true);
  const pending = compiler.run('pending', {});
  compiler.dispose();
  await assert.rejects(pending, { name: 'AbortError' });
});
void test('cancelled queued work never starts and a worker crash does not poison its key', async () => {
  const { workers, compiler } = fixture();
  try {
    const a = compiler.run('a', {}),
      b = compiler.run('b', {}),
      abort = new AbortController(),
      queued = compiler.run('q', {}, abort.signal);
    abort.abort();
    await assert.rejects(queued, { name: 'AbortError' });
    workers[0].onerror?.({});
    await assert.rejects(a, /engine failed/);
    workers[1].complete();
    await b;
    assert.equal(compiler.stats.builds, 2);
    const retry = compiler.run('a', {});
    workers[1].complete();
    await retry;
  } finally {
    compiler.dispose();
  }
});
