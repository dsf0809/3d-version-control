/** At most one pending frame; draw again only while controls are settling. */
export function createRenderScheduler(
  draw: () => boolean,
  request: (callback: () => void) => number,
  cancel: (id: number) => void,
) {
  let frame: number | null = null,
    disposed = false;
  const render = () => {
    frame = null;
    if (disposed) return;
    if (draw()) invalidate();
  };
  const invalidate = () => {
    if (!disposed && frame === null) frame = request(render);
  };
  return {
    invalidate,
    dispose: () => {
      disposed = true;
      if (frame !== null) cancel(frame);
      frame = null;
    },
  };
}
