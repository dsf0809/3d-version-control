import { relationshipSchema } from './relationships';
import {
  modelSchema,
  validateGeneratedModel,
  type Model,
  type Operation,
} from './model';
const object = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const text = { type: 'string' };
const vector = {
  type: 'array',
  items: { type: 'number' },
  minItems: 3,
  maxItems: 3,
};
const command = (kind: string, properties: Record<string, unknown>) =>
  object({ kind: { type: 'string', enum: [kind] }, ...properties });
export const editSchema = object({
  baseId: text,
  commands: {
    type: 'array',
    minItems: 1,
    maxItems: 96,
    items: {
      anyOf: [
        command('set-vector', {
          featureId: text,
          field: { type: 'string', enum: ['size', 'position', 'rotation'] },
          value: vector,
        }),
        command('rename-feature', { featureId: text, name: text }),
        command('rename-model', { name: text }),
        command('set-color', {
          featureId: text,
          color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
        }),
        command('set-relationships', { relationships: relationshipSchema }),
        command('add-feature', {
          feature: modelSchema.properties.operations.items,
          index: { type: 'integer', minimum: 0, maximum: 48 },
        }),
        command('remove-feature', { featureId: text }),
        command('move-feature', {
          featureId: text,
          index: { type: 'integer', minimum: 0, maximum: 47 },
        }),
      ],
    },
  },
});
function exact(
  value: unknown,
  keys: string[],
): asserts value is Record<string, any> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(value, k))
  )
    throw new Error('Invalid edit command fields.');
}
/** Commands are data, never executable code. Apply atomically to an isolated model. */
export function applyEdits(
  base: Model,
  raw: unknown,
  expectedBaseId: string,
): Model {
  exact(raw, ['baseId', 'commands']);
  if (raw.baseId !== expectedBaseId)
    throw new Error(
      'The AI edit targets a stale revision or proposal. Try again.',
    );
  if (
    !Array.isArray(raw.commands) ||
    raw.commands.length < 1 ||
    raw.commands.length > 96
  )
    throw new Error('Provide between 1 and 96 edit commands.');
  const result = structuredClone(base);
  for (const value of raw.commands) {
    const c = value as Record<string, any>;
    if (!c || typeof c !== 'object') throw new Error('Invalid edit command.');
    if (c.kind === 'set-relationships') {
      exact(c, ['kind', 'relationships']);
      result.relationships = structuredClone(c.relationships);
      continue;
    }
    if (c.kind === 'rename-model') {
      exact(c, ['kind', 'name']);
      result.name = c.name;
      continue;
    }
    if (c.kind === 'add-feature') {
      exact(c, ['kind', 'feature', 'index']);
      exact(c.feature, [
        'id',
        'name',
        'kind',
        'operation',
        'size',
        'position',
        'rotation',
        ...(Object.hasOwn(c.feature, 'color') ? ['color'] : []),
      ]);
      if (
        !Number.isInteger(c.index) ||
        c.index < 0 ||
        c.index > result.operations.length ||
        result.operations.some((f) => f.id === c.feature.id)
      )
        throw new Error('Invalid insertion index or duplicate feature ID.');
      result.operations.splice(
        c.index,
        0,
        structuredClone(c.feature) as Operation,
      );
    } else {
      const index = result.operations.findIndex((f) => f.id === c.featureId);
      if (typeof c.featureId !== 'string' || index < 0)
        throw new Error('The AI edit references an unknown feature.');
      const feature = result.operations[index];
      switch (c.kind) {
        case 'set-vector':
          exact(c, ['kind', 'featureId', 'field', 'value']);
          if (!['size', 'position', 'rotation'].includes(c.field))
            throw new Error('Unsupported feature field.');
          feature[c.field as 'size'] = structuredClone(c.value);
          break;
        case 'set-color':
          exact(c, ['kind', 'featureId', 'color']);
          feature.color = c.color;
          break;
        case 'rename-feature':
          exact(c, ['kind', 'featureId', 'name']);
          feature.name = c.name;
          break;
        case 'remove-feature':
          exact(c, ['kind', 'featureId']);
          result.operations.splice(index, 1);
          break;
        case 'move-feature':
          exact(c, ['kind', 'featureId', 'index']);
          if (
            !Number.isInteger(c.index) ||
            c.index < 0 ||
            c.index >= result.operations.length
          )
            throw new Error('Invalid feature order.');
          result.operations.splice(index, 1);
          result.operations.splice(c.index, 0, feature);
          break;
        default:
          throw new Error('Unsupported edit command.');
      }
    }
    if (result.operations.length > 48)
      throw new Error('Maximum 48 solid operations.');
  }
  return validateGeneratedModel(result, base);
}
