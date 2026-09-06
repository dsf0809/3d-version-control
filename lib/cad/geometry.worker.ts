import { buildGeometry, compareGeometry } from './geometry';
self.onmessage = (event) => {
  try {
    if (event.data.mode === 'compare') {
      const result = compareGeometry(event.data.before, event.data.after);
      self.postMessage(
        { ok: true, ...result },
        {
          transfer: [
            result.added.buffer,
            result.removed.buffer,
            result.unchanged.buffer,
          ],
        },
      );
    } else {
      const result = buildGeometry(event.data.model);
      self.postMessage(
        { ok: true, ...result },
        { transfer: [result.positions.buffer] },
      );
    }
  } catch (error) {
    self.postMessage({
      ok: false,
      error:
        error instanceof Error ? error.message : 'Unable to build geometry.',
    });
  }
};
