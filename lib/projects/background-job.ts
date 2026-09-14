import { runTurn } from './service';
import { ProjectStore, validateTurn } from './store';
import { HttpError } from './http';
import { turnStatus, type TurnStatus } from './turn-status';
import type { TurnInput } from './types';
export type JobRecord = {
  owner: string;
  input: TurnInput;
  state: 'queued' | 'running' | 'finished' | 'interrupted';
  error?: string;
};
export interface JobTransaction {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  setAlarm(time: number): Promise<void>;
}
export interface JobStorage extends JobTransaction {
  transaction<T>(fn: (tx: JobTransaction) => Promise<T>): Promise<T>;
}
/** Persist before execution. An interrupted provider request is never replayed automatically. */
export class BackgroundJob {
  constructor(
    private storage: JobStorage,
    private store: ProjectStore,
    private key: string,
    private model: string,
    private fetcher: typeof fetch = fetch,
  ) {}
  async enqueue(owner: string, raw: unknown) {
    const input = validateTurn(raw);
    await this.store.assertBranchWrite(owner, input.projectId, input.branchId);
    const old = await this.storage.get<JobRecord>('job');
    if (old) {
      if (
        old.owner !== owner ||
        JSON.stringify(old.input) !== JSON.stringify(input)
      )
        throw new HttpError(409, 'Request identifier already used.');
      return;
    }
    // Alarm and payload are written before RPC responds; alarms retry storage failures.
    await this.storage.transaction(async (tx) => {
      await tx.put('job', {
        owner,
        input,
        state: 'queued',
      } satisfies JobRecord);
      await tx.setAlarm(Date.now() + 500);
    });
  }
  async status(owner: string, projectId: string): Promise<TurnStatus> {
    const j = await this.storage.get<JobRecord>('job');
    if (!j || j.owner !== owner || j.input.projectId !== projectId)
      throw new HttpError(404, 'Request not found.');
    await this.store.own(owner, projectId);
    try {
      return await turnStatus(this.store, owner, projectId, j.input.requestId);
    } catch (e) {
      if (!(e instanceof HttpError) || e.status !== 404) throw e;
    }
    return j.state === 'queued'
      ? { status: 'pending', phase: 'queued' }
      : {
          status: 'failed',
          phase: 'failed',
          error:
            j.error ||
            'The job stopped before starting. Send a new request to retry.',
        };
  }
  async alarm() {
    const j = await this.storage.get<JobRecord>('job');
    if (!j || j.state === 'finished' || j.state === 'interrupted') return;
    if (j.state === 'running') {
      // A prior isolate died. Reconcile a committed result, otherwise stop safely.
      let completed = false;
      try {
        completed =
          (
            await turnStatus(
              this.store,
              j.owner,
              j.input.projectId,
              j.input.requestId,
            )
          ).status === 'completed';
      } catch {}
      if (!completed)
        await this.store.fail(
          j.input,
          'The worker restarted during generation. Send a new request to retry; no automatic paid retry was made.',
        );
      await this.storage.put('job', {
        ...j,
        state: completed ? 'finished' : 'interrupted',
      });
      return;
    }
    await this.storage.put('job', { ...j, state: 'running' });
    try {
      await runTurn(
        this.store,
        j.owner,
        j.input,
        this.key,
        this.model,
        AbortSignal.timeout(120000),
        this.fetcher,
      );
      await this.storage.put('job', { ...j, state: 'finished' });
    } catch (e) {
      await this.storage.put('job', {
        ...j,
        state: 'finished',
        error: e instanceof Error ? e.message : 'Generation failed.',
      });
    }
  }
}
