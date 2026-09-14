import type { Model } from './model';
export type MergeConflict = {
  path: string;
  base: unknown;
  target: unknown;
  source: unknown;
};
export type MergeChoices = Record<string, 'source' | 'target'>;
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
/** Conservative three-way source merge. Arrays other than feature dimensions are atomic. */
export function mergeModels(
  base: Model,
  target: Model,
  source: Model,
  choices: MergeChoices = {},
) {
  const conflicts: MergeConflict[] = [];
  function merge(b: any, t: any, s: any, path: string): any {
    if (equal(t, s) || equal(b, s)) return t;
    if (equal(b, t)) return s;
    if (
      b &&
      t &&
      s &&
      typeof b === 'object' &&
      typeof t === 'object' &&
      typeof s === 'object' &&
      !Array.isArray(b) &&
      !Array.isArray(t) &&
      !Array.isArray(s)
    ) {
      const result: Record<string, unknown> = Object.create(null);
      for (const key of new Set([
        ...Object.keys(b),
        ...Object.keys(t),
        ...Object.keys(s),
      ]))
        result[key] = merge(b[key], t[key], s[key], `${path}.${key}`);
      return result;
    }
    if (
      Array.isArray(b) &&
      Array.isArray(t) &&
      Array.isArray(s) &&
      /\.(size|position)$/.test(path) &&
      b.length === 3 &&
      t.length === 3 &&
      s.length === 3
    )
      return b.map((v, i) => merge(v, t[i], s[i], `${path}.${i}`));
    if (choices[path] === 'source') return s;
    if (choices[path] === 'target') return t;
    conflicts.push({
      path,
      base: b ?? null,
      target: t ?? null,
      source: s ?? null,
    });
    return t;
  }
  const maps = [base, target, source].map((m) =>
    Object.fromEntries(m.operations.map((o) => [o.id!, o])),
  );
  const operations = merge(maps[0], maps[1], maps[2], 'features') as Record<
    string,
    Model['operations'][number] | undefined
  >;
  // Preserve order of shared operations; independent additions can be appended safely only when one side changed order.
  const order = merge(
    base.operations.map((o) => o.id),
    target.operations.map((o) => o.id),
    source.operations.map((o) => o.id),
    'featureOrder',
  ) as string[];
  const ids = [...new Set([...order, ...Object.keys(operations)])];
  const model = {
    ...target,
    name: merge(base.name, target.name, source.name, 'name'),
    relationships: merge(
      base.relationships || [],
      target.relationships || [],
      source.relationships || [],
      'relationships',
    ),
    operations: ids.map((id) => operations[id]).filter(Boolean),
  } as Model;
  return { model, conflicts };
}
