import modeling from '@jscad/modeling';
import { validateModel, type Model, type Operation } from './model';
const {
  primitives,
  booleans,
  transforms,
  geometries,
  modifiers,
  measurements,
} = modeling;
export function featureSolid(op: Operation) {
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
  return part;
}
export function buildSolid(input: Model) {
  const model = validateModel(input);
  let result: ReturnType<typeof primitives.cuboid> | undefined;
  for (const op of model.operations) {
    const part = featureSolid(op);
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
function surfaceOwnership(model: Model, positions: Float32Array) {
  type Face = {
    owner: number;
    vertices: number[][];
    plane: number[];
    min: number[];
    max: number[];
  };
  const key = (p: number[]) => {
    const sign = p.slice(0, 3).find((n) => Math.abs(n) > 1e-8)! < 0 ? -1 : 1;
    return p.map((n) => Math.round(n * sign * 1e4)).join(':');
  };
  const buckets = new Map<string, Face[]>();
  model.operations.forEach((op, owner) => {
    for (const poly of geometries.geom3.toPolygons(featureSolid(op))) {
      const vertices = poly.vertices as number[][],
        plane = Array.from(geometries.poly3.plane(poly));
      const f = {
        owner,
        vertices,
        plane,
        min: [0, 1, 2].map((i) => Math.min(...vertices.map((v) => v[i]))),
        max: [0, 1, 2].map((i) => Math.max(...vertices.map((v) => v[i]))),
      };
      const k = key(plane);
      buckets.set(k, [...(buckets.get(k) || []), f]);
    }
  });
  const owners = new Uint16Array(positions.length / 9);
  for (let i = 0; i < positions.length; i += 9) {
    const a = Array.from(positions.slice(i, i + 3)),
      b = Array.from(positions.slice(i + 3, i + 6)),
      c = Array.from(positions.slice(i + 6, i + 9));
    const u = b.map((n, j) => n - a[j]),
      v = c.map((n, j) => n - a[j]),
      normal = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
      ];
    const len = Math.hypot(...normal);
    normal.forEach((n, j) => (normal[j] = n / len));
    const p = [...normal, normal.reduce((n, v, j) => n + v * a[j], 0)],
      center = a.map((n, j) => (n + b[j] + c[j]) / 3);
    for (const f of buckets.get(key(p)) || []) {
      if (center.some((n, j) => n < f.min[j] - 1e-3 || n > f.max[j] + 1e-3))
        continue;
      let inside = true;
      for (let j = 0; j < f.vertices.length; j++) {
        const x = f.vertices[j],
          y = f.vertices[(j + 1) % f.vertices.length],
          e = y.map((n, k) => n - x[k]),
          r = center.map((n, k) => n - x[k]);
        const cross = [
          e[1] * r[2] - e[2] * r[1],
          e[2] * r[0] - e[0] * r[2],
          e[0] * r[1] - e[1] * r[0],
        ];
        if (cross.reduce((n, v, k) => n + v * f.plane[k], 0) < -1e-3) {
          inside = false;
          break;
        }
      }
      if (inside) owners[i / 9] = f.owner;
    }
  }
  return {
    owners,
    featureIds: model.operations.map((o, i) => o.id || `feature-${i}`),
  };
}
export function buildGeometry(input: Model) {
  const solid = buildSolid(input),
    bounds = measurements.measureBoundingBox(solid);
  const positions = meshPositions(solid);
  const ownership = surfaceOwnership(validateModel(input), positions);
  return {
    positions,
    ...ownership,
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
/** Server validation: build each input once, validate output mesh, measure differences without triangulating all three. */
export function validateComparison(before: Model, after: Model) {
  const a = buildSolid(before),
    b = buildSolid(after);
  meshPositions(b);
  return {
    added: Math.max(0, measurements.measureVolume(booleans.subtract(b, a))),
    removed: Math.max(0, measurements.measureVolume(booleans.subtract(a, b))),
    unchanged: Math.max(
      0,
      measurements.measureVolume(booleans.intersect(a, b)),
    ),
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
