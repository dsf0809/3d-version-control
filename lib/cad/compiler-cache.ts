/** Reuses completed geometry and at most two worker instances. No React dependency. */
export interface GeometryWorkerLike {
  onmessage: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  postMessage(payload: unknown): void;
  terminate(): void;
}
type Subscriber = {
  resolve(value: any): void;
  reject(error: Error): void;
  cleanup(): void;
};
type Job = {
  key: string;
  payload: unknown;
  subscribers: Set<Subscriber>;
  slot?: Slot;
  timer?: ReturnType<typeof setTimeout>;
};
type Slot = { worker: GeometryWorkerLike; job?: Job };
const cancelled = () => new DOMException('Cancelled', 'AbortError');
function bytes(value: any): number {
  if (ArrayBuffer.isView(value)) return value.byteLength;
  if (value && typeof value === 'object')
    return Object.values(value).reduce<number>((n, v) => n + bytes(v), 0);
  return 8;
}
export class GeometryCompiler {
  private slots: Slot[] = [];
  private jobs = new Map<string, Job>();
  private cache = new Map<string, { value: any; size: number }>();
  private cacheBytes = 0;
  readonly stats = { hits: 0, builds: 0, workers: 0 };
  constructor(
    private factory: () => GeometryWorkerLike,
    private budget = 64 * 1024 * 1024,
    private timeout = 20000,
  ) {}
  run<T>(key: string, payload: unknown, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(cancelled());
    const cached = this.cache.get(key);
    if (cached) {
      this.stats.hits++;
      this.cache.delete(key);
      this.cache.set(key, cached);
      return Promise.resolve(cached.value);
    }
    let job = this.jobs.get(key);
    if (!job) {
      job = { key, payload: structuredClone(payload), subscribers: new Set() };
      this.jobs.set(key, job);
    }
    const current = job;
    return new Promise<T>((resolve, reject) => {
      const abort = () => {
        current.subscribers.delete(subscriber);
        subscriber.cleanup();
        reject(cancelled());
        if (!current.subscribers.size)
          this.finish(current, undefined, cancelled(), true);
      };
      const subscriber: Subscriber = {
        resolve,
        reject,
        cleanup: () => signal?.removeEventListener('abort', abort),
      };
      current.subscribers.add(subscriber);
      signal?.addEventListener('abort', abort, { once: true });
      this.pump();
    });
  }
  private pump() {
    for (const job of this.jobs.values()) {
      if (job.slot) continue;
      let slot = this.slots.find((s) => !s.job);
      if (!slot && this.slots.length < 2) {
        try {
          slot = { worker: this.factory() };
          this.stats.workers++;
          this.slots.push(slot);
        } catch (error) {
          this.finish(
            job,
            undefined,
            error instanceof Error
              ? error
              : new Error('Unable to start geometry engine.'),
          );
          return;
        }
      }
      if (!slot) return;
      slot.job = job;
      job.slot = slot;
      this.stats.builds++;
      slot.worker.onmessage = ({ data }) =>
        this.finish(
          job,
          data.ok ? data : undefined,
          data.ok ? undefined : new Error(data.error),
        );
      slot.worker.onerror = () =>
        this.finish(
          job,
          undefined,
          new Error('The geometry engine failed. Try again.'),
          true,
        );
      job.timer = setTimeout(
        () =>
          this.finish(
            job,
            undefined,
            new Error('Geometry took too long. Try fewer features.'),
            true,
          ),
        this.timeout,
      );
      try {
        slot.worker.postMessage(job.payload);
      } catch (error) {
        this.finish(
          job,
          undefined,
          error instanceof Error ? error : new Error('Geometry failed.'),
          true,
        );
      }
    }
  }
  private finish(job: Job, value?: any, error?: Error, terminate = false) {
    if (this.jobs.get(job.key) !== job) return;
    this.jobs.delete(job.key);
    clearTimeout(job.timer);
    if (job.slot) {
      const slot = job.slot;
      slot.worker.onmessage = null;
      slot.worker.onerror = null;
      slot.job = undefined;
      if (terminate) {
        slot.worker.terminate();
        this.slots = this.slots.filter((s) => s !== slot);
      }
    }
    if (!error && value) {
      const size = bytes(value) + job.key.length * 2;
      if (size <= this.budget) {
        this.cache.set(job.key, { value, size });
        this.cacheBytes += size;
        while (this.cacheBytes > this.budget || this.cache.size > 100) {
          const key = this.cache.keys().next().value!;
          this.cacheBytes -= this.cache.get(key)!.size;
          this.cache.delete(key);
        }
      }
    }
    for (const sub of job.subscribers) {
      sub.cleanup();
      if (error) sub.reject(error);
      else sub.resolve(value);
    }
    job.subscribers.clear();
    this.pump();
  }
  dispose() {
    const jobs = [...this.jobs.values()];
    this.jobs.clear();
    for (const slot of this.slots) slot.worker.terminate();
    for (const job of jobs) {
      clearTimeout(job.timer);
      for (const sub of job.subscribers) {
        sub.cleanup();
        sub.reject(cancelled());
      }
    }
    this.slots = [];
    this.cache.clear();
    this.cacheBytes = 0;
  }
}
