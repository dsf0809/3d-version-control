import type { PerspectiveCamera } from 'three';

/** Keep pixel scale fixed as the viewport grows around the same camera target. */
export function resizeCamera(
  camera: PerspectiveCamera,
  width: number,
  height: number,
  previousHeight: number,
) {
  if (width <= 0 || height <= 0) return;
  if (previousHeight > 0) camera.zoom *= previousHeight / height;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

export function fitCameraDistance(camera: PerspectiveCamera, radius: number) {
  const verticalHalf = camera.getEffectiveFOV() * Math.PI / 360;
  const limitingHalf = Math.atan(Math.tan(verticalHalf) * Math.min(camera.aspect, 1));
  return radius / Math.sin(limitingHalf) * 1.05;
}

/** Offset the projection when layout moves the canvas center, without moving the camera. */
export function anchorCamera(
  camera: PerspectiveCamera, width: number, height: number,
  centerShiftX: number, centerShiftY: number,
) {
  camera.setViewOffset(width, height, centerShiftX, centerShiftY, width, height);
}
