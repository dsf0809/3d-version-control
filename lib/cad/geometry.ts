import modeling from '@jscad/modeling';
import { validateModel, type Model } from './model';
const {
  primitives,
  booleans,
  transforms,
  geometries,
  modifiers,
  measurements,
} = modeling;
export function buildSolid(input: Model) {
  const model = validateModel(input);
  let result: ReturnType<typeof primitives.cuboid> | undefined;
  for (const op of model.operations) {
    let part =
      op.kind === 'box'
        ? primitives.cuboid({ size: op.size })
        : op.kind === 'cylinder'
          ? transforms.scale(
              [op.size[0] / 2, op.size[1] / 2, 1],
              primitives.cylinder({
                radius: 1,
                height: op.size[2],
                segments: 48,
              }),
            )
          : transforms.scale(
              op.size.map((n) => n / 2) as [number, number, number],
              primitives.sphere({ radius: 1, segments: 32 }),
            );
    part = transforms.translate(
      op.position,
      transforms.rotate(
        op.rotation.map((n) => (n * Math.PI) / 180) as [number, number, number],
        part,
      ),
    );
    result = result
      ? op.operation === 'add'
        ? booleans.union(result, part)
        : booleans.subtract(result, part)
      : part;
  }
  if (!result || measurements.measureVolume(result) < 0.001)
    throw new Error(
      'This edit produced an empty solid. Try different dimensions.',
    );
  return result;
}
function meshPositions(result: ReturnType<typeof primitives.cuboid>) {
  // JSCAD 2.13 ships a mismatched default-export declaration for this runtime function.
  const generalize = modifiers.generalize as unknown as (
    options: { snap: boolean; triangulate: boolean },
    geometry: ReturnType<typeof primitives.cuboid>,
  ) => ReturnType<typeof primitives.cuboid>;
  const solid = generalize({ snap: false, triangulate: true }, result);
  const polygons = geometries.geom3.toPolygons(solid);
  const positions: number[] = [];
  for (const poly of polygons) {
    for (let i = 1; i < poly.vertices.length - 1; i++) {
      positions.push(
        ...poly.vertices[0],
        ...poly.vertices[i],
        ...poly.vertices[i + 1],
      );
    }
  }
  if (positions.length > 1800000 || positions.some((n) => !Number.isFinite(n)))
    throw new Error(
      'The geometry is too complex or invalid. Try a simpler part.',
    );
  return new Float32Array(positions);
}
export function buildGeometry(input: Model) {
  const solid = buildSolid(input),
    bounds = measurements.measureBoundingBox(solid);
  return {
    positions: meshPositions(solid),
    dimensions: bounds[1].map((n, i) => n - bounds[0][i]),
    volume: measurements.measureVolume(solid),
  };
}
export function compareGeometry(before: Model, after: Model) {
  const a = buildSolid(before),
    b = buildSolid(after);
  const added = booleans.subtract(b, a),
    removed = booleans.subtract(a, b),
    unchanged = booleans.intersect(a, b);
  return {
    added: meshPositions(added),
    removed: meshPositions(removed),
    unchanged: meshPositions(unchanged),
    volumes: {
      added: Math.max(0, measurements.measureVolume(added)),
      removed: Math.max(0, measurements.measureVolume(removed)),
      unchanged: Math.max(0, measurements.measureVolume(unchanged)),
    },
  };
}
export function binarySTL(positions: Float32Array) {
  const count = positions.length / 9;
  const buffer = new ArrayBuffer(84 + count * 50);
  const view = new DataView(buffer);
  view.setUint32(80, count, true);
  for (let i = 0; i < count; i++) {
    const k = i * 9,
      o = 84 + i * 50;
    const ax = positions[k + 3] - positions[k],
      ay = positions[k + 4] - positions[k + 1],
      az = positions[k + 5] - positions[k + 2];
    const bx = positions[k + 6] - positions[k],
      by = positions[k + 7] - positions[k + 1],
      bz = positions[k + 8] - positions[k + 2];
    const nx = ay * bz - az * by,
      ny = az * bx - ax * bz,
      nz = ax * by - ay * bx;
    const length = Math.hypot(nx, ny, nz) || 1;
    [nx / length, ny / length, nz / length].forEach((n, j) =>
      view.setFloat32(o + j * 4, n, true),
    );
    for (let j = 0; j < 9; j++)
      view.setFloat32(o + 12 + j * 4, positions[k + j], true);
  }
  return buffer;
}
