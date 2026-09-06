export type Vec3 = [number, number, number];
export type Operation = {
  name: string;
  kind: 'box' | 'cylinder' | 'sphere';
  operation: 'add' | 'subtract';
  size: Vec3;
  position: Vec3;
  rotation: Vec3;
};
export type Model = { name: string; operations: Operation[] };
export type Reply = { message: string; model: Model | null };
const vectorSchema = {
  type: 'array',
  items: { type: 'number' },
  minItems: 3,
  maxItems: 3,
};
export const modelSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'operations'],
  properties: {
    name: { type: 'string' },
    operations: {
      type: 'array',
      minItems: 1,
      maxItems: 48,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'kind', 'operation', 'size', 'position', 'rotation'],
        properties: {
          name: { type: 'string' },
          kind: { type: 'string', enum: ['box', 'cylinder', 'sphere'] },
          operation: { type: 'string', enum: ['add', 'subtract'] },
          size: vectorSchema,
          position: vectorSchema,
          rotation: vectorSchema,
        },
      },
    },
  },
};
export const replySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['message', 'model'],
  properties: {
    message: { type: 'string' },
    model: { anyOf: [modelSchema, { type: 'null' }] },
  },
};
export function validateModel(value: unknown): Model {
  const m = value as Model;
  if (
    !m ||
    typeof m.name !== 'string' ||
    m.name.length > 120 ||
    !Array.isArray(m.operations) ||
    m.operations.length < 1 ||
    m.operations.length > 48
  )
    throw new Error(
      'The model must contain between 1 and 48 solid operations.',
    );
  m.operations.forEach((p, i) => {
    if (
      !p ||
      typeof p.name !== 'string' ||
      p.name.length > 120 ||
      !['box', 'cylinder', 'sphere'].includes(p.kind) ||
      !['add', 'subtract'].includes(p.operation) ||
      (i === 0 && p.operation !== 'add')
    )
      throw new Error('Invalid solid operation. Start with an added solid.');
    for (const field of ['size', 'position', 'rotation'] as const) {
      if (
        !Array.isArray(p[field]) ||
        p[field].length !== 3 ||
        p[field].some(
          (n) =>
            typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 1000,
        )
      )
        throw new Error(
          'Model coordinates must be finite and within 1,000 mm or degrees.',
        );
    }
    if (p.size.some((n) => n < 0.2 || n > 500))
      throw new Error('Solid dimensions must be between 0.2 and 500 mm.');
  });
  return m;
}
export const sample: Model = {
  name: 'Everyday tray',
  operations: [
    {
      name: 'Outer shell',
      kind: 'box',
      operation: 'add',
      size: [120, 80, 26],
      position: [0, 0, 13],
      rotation: [0, 0, 0],
    },
    {
      name: 'Open interior',
      kind: 'box',
      operation: 'subtract',
      size: [114, 74, 26],
      position: [0, 0, 16],
      rotation: [0, 0, 0],
    },
    {
      name: 'Divider',
      kind: 'box',
      operation: 'add',
      size: [3, 76, 23],
      position: [17, 0, 14.5],
      rotation: [0, 0, 0],
    },
  ],
};
