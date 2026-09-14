import type { Object3D } from 'three';
export const comparisonLayers = ['removed', 'added', 'unchanged'] as const;
export type ComparisonLayer = (typeof comparisonLayers)[number];
export type ComparisonVisibility = Record<ComparisonLayer, boolean>;
export const defaultComparisonVisibility: ComparisonVisibility = {
  removed: true, added: true, unchanged: true,
};
/** Toggle existing objects only: no geometry compilation or camera changes. */
export function applyComparisonVisibility(objects: readonly Object3D[], visibility: ComparisonVisibility) {
  for (const object of objects) {
    if (comparisonLayers.includes(object.name as ComparisonLayer))
      object.visible = visibility[object.name as ComparisonLayer];
  }
}
