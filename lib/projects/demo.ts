import { sample } from '../cad/model';
import type { Revision } from '../cad/history';

export const demoProject = {
  name: 'Demo — tray comparison',
  brief:
    'Explore two versions of a divided tray. Select Changes Comparison to see the old divider in red, its new position in green, and the unchanged tray in gray.',
  requirements:
    'Keep the tray 120 × 80 × 26 mm. V0 has the divider at X = 17 mm; V1 moves it to X = −17 mm.',
};
export function demoHistory(): Revision[] {
  const before = structuredClone(sample);
  const after = structuredClone(sample);
  after.name = 'Everyday tray — divider moved';
  after.operations.find((o) => o.name === 'Divider')!.position[0] = -17;
  return [
    {
      id: 'demo-v0',
      parentId: null,
      createdAt: '',
      prompt: 'Original tray with a divider on the right.',
      model: before,
    },
    {
      id: 'demo-v1',
      parentId: 'demo-v0',
      createdAt: '',
      prompt: 'Move the divider 34 mm left; preserve the outer tray.',
      model: after,
    },
  ];
}
