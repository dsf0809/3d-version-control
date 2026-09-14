import type { Model } from './model';
export type DimensionRef = {
  featureId: string;
  field: 'size' | 'position';
  axis: 0 | 1 | 2;
};
export type DimensionLink = {
  target: DimensionRef;
  source: DimensionRef;
  factor: number;
  offset: number;
};
const refSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['featureId', 'field', 'axis'],
  properties: {
    featureId: { type: 'string' },
    field: { type: 'string', enum: ['size', 'position'] },
    axis: { type: 'integer', enum: [0, 1, 2] },
  },
};
export const relationshipSchema = {
  type: 'array',
  maxItems: 144,
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['target', 'source', 'factor', 'offset'],
    properties: {
      target: refSchema,
      source: refSchema,
      factor: { type: 'number' },
      offset: { type: 'number' },
    },
  },
};
const key = (r: DimensionRef) => `${r.featureId}:${r.field}:${r.axis}`;
export function resolveRelationships(input: Model): Model {
  if (input.relationships == null) return input;
  if (!Array.isArray(input.relationships))
    throw new Error('Dimension links must be an array.');
  if (!input.relationships.length) return input;
  if (!Array.isArray(input.relationships) || input.relationships.length > 144)
    throw new Error('Maximum 144 dimension links.');
  const model = structuredClone(input),
    features = new Map(model.operations.map((o) => [o.id, o])),
    links = new Map<string, DimensionLink>();
  for (const link of model.relationships!) {
    if (
      !link ||
      !Number.isFinite(link.factor) ||
      Math.abs(link.factor) > 100 ||
      !Number.isFinite(link.offset) ||
      Math.abs(link.offset) > 1000
    )
      throw new Error('Invalid dimension link scale or offset.');
    for (const ref of [link.target, link.source])
      if (
        !ref ||
        !features.has(ref.featureId) ||
        !['size', 'position'].includes(ref.field) ||
        ![0, 1, 2].includes(ref.axis)
      )
        throw new Error('Dimension link references a missing feature or axis.');
    if (links.has(key(link.target)))
      throw new Error('A dimension can have only one source.');
    links.set(key(link.target), link);
  }
  const visited = new Set<string>(),
    active = new Set<string>();
  const evaluate = (id: string) => {
    if (visited.has(id)) return;
    if (active.has(id))
      throw new Error('Dimension links cannot contain cycles.');
    const link = links.get(id);
    if (!link) return;
    active.add(id);
    evaluate(key(link.source));
    const source = features.get(link.source.featureId)!,
      target = features.get(link.target.featureId)!;
    target[link.target.field][link.target.axis] =
      source[link.source.field][link.source.axis] * link.factor + link.offset;
    active.delete(id);
    visited.add(id);
  };
  for (const id of links.keys()) evaluate(id);
  return model;
}
