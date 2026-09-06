import type { Model } from './model';
import GeometryWorker from './geometry.worker.ts?worker';
export type Compiled = {
  positions: Float32Array;
  dimensions: number[];
  volume: number;
};
export type Comparison = {
  added: Float32Array;
  removed: Float32Array;
  unchanged: Float32Array;
  volumes: { added: number; removed: number; unchanged: number };
};
function runWorker<T>(payload: unknown, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    // Let Vite resolve a browser-served URL across client and SSR transforms.
    const worker = new GeometryWorker();
    let timer: ReturnType<typeof setTimeout>;
    const cleanup = () => {
      clearTimeout(timer);
      worker.terminate();
      signal?.removeEventListener('abort', abort);
    };
    const abort = () => {
      cleanup();
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => {
      cleanup();
      reject(new Error('Geometry took too long. Try fewer features.'));
    }, 20000);
    worker.onmessage = ({ data }) => {
      cleanup();
      if (data.ok) resolve(data);
      else reject(new Error(data.error));
    };
    worker.onerror = () => {
      cleanup();
      reject(
        new Error('The geometry engine could not start. Reload and try again.'),
      );
    };
    worker.postMessage(payload);
  });
}
export const compileModel = (model: Model, signal?: AbortSignal) =>
  runWorker<Compiled>({ mode: 'model', model }, signal);
export const compileComparison = (
  before: Model,
  after: Model,
  signal?: AbortSignal,
) => runWorker<Comparison>({ mode: 'compare', before, after }, signal);
