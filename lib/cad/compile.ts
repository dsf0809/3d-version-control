import { GeometryCompiler } from './compiler-cache';
import type { Model } from './model';
import GeometryWorker from './geometry.worker.ts?worker';
export type Compiled = {
  positions: Float32Array;
  owners?: Uint16Array;
  featureIds?: string[];
  dimensions: number[];
  volume: number;
};
export type Comparison = {
  added: Float32Array;
  removed: Float32Array;
  unchanged: Float32Array;
  volumes: { added: number; removed: number; unchanged: number };
};
// Geometry keys exclude labels and IDs because they do not affect the solid.
// Include the engine version so a change to tessellation invalidates old entries.
export function geometryKey(model: Model) {
  return JSON.stringify([
    'jscad-2.13:mesh-v2',
    model.operations.map(
      ({ id, kind, operation, size, position, rotation }) => [
        id,
        kind,
        operation,
        size,
        position,
        rotation,
      ],
    ),
  ]);
}
const compiler = new GeometryCompiler(() => new GeometryWorker());
if (typeof window !== 'undefined')
  window.addEventListener('pagehide', () => compiler.dispose());
export const compileModel = (model: Model, signal?: AbortSignal) =>
  compiler.run<Compiled>(
    'model:' + geometryKey(model),
    { mode: 'model', model },
    signal,
  );
export const compileComparison = (
  before: Model,
  after: Model,
  signal?: AbortSignal,
) =>
  compiler.run<Comparison>(
    'compare:' + geometryKey(before) + ':' + geometryKey(after),
    { mode: 'compare', before, after },
    signal,
  );
