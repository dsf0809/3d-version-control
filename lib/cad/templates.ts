import { upgradeModel, type Model, type Operation } from './model';
export type TemplateId = 'tray' | 'enclosure' | 'bracket';
export type TemplateDimensions = {
  width: number;
  depth: number;
  height: number;
  wall: number;
};
export const templates: Record<
  TemplateId,
  { name: string; dimensions: TemplateDimensions }
> = {
  tray: {
    name: 'Organizer tray',
    dimensions: { width: 120, depth: 80, height: 26, wall: 3 },
  },
  enclosure: {
    name: 'Open enclosure',
    dimensions: { width: 100, depth: 70, height: 40, wall: 3 },
  },
  bracket: {
    name: 'L bracket',
    dimensions: { width: 80, depth: 40, height: 50, wall: 4 },
  },
};
export function createTemplate(
  id: TemplateId,
  dimensions: TemplateDimensions = templates[id]?.dimensions,
): Model {
  if (!templates[id] || !dimensions)
    throw new Error('Choose a starting model.');
  const { width: w, depth: d, height: h, wall: t } = dimensions;
  if (
    [w, d, h, t].some((n) => !Number.isFinite(n) || n < 0.2 || n > 500) ||
    w <= t * 2 ||
    d <= t * 2 ||
    h <= t * 2
  )
    throw new Error(
      'Dimensions must be 0.2–500 mm and more than twice the wall thickness.',
    );
  const box = (
    name: string,
    size: Operation['size'],
    position: Operation['position'],
    operation: Operation['operation'] = 'add',
  ): Operation => ({
    name,
    kind: 'box',
    operation,
    size,
    position,
    rotation: [0, 0, 0],
  });
  const operations: Operation[] =
    id === 'bracket'
      ? [
          box('Base', [w, d, t], [0, 0, t / 2]),
          box('Upright', [t, d, h], [-w / 2 + t / 2, 0, h / 2]),
        ]
      : [
          box('Outer shell', [w, d, h], [0, 0, h / 2]),
          box(
            'Open interior',
            [w - 2 * t, d - 2 * t, h],
            [0, 0, h / 2 + t],
            'subtract',
          ),
        ];
  if (id === 'tray')
    operations.push(box('Divider', [t, d - 2 * t, h - t], [0, 0, (h + t) / 2]));
  return upgradeModel({ name: templates[id].name, operations });
}
