import {
  BackgroundJob,
  type JobStorage,
  type JobTransaction,
} from '../projects/background-job';
import { ProjectStore } from '../projects/store';
import { resolveConnection } from '../projects/ai-credentials';
import { HttpError } from '../projects/http';
import type { SqliteDatabase } from './sqlite';

type Data = Record<string, unknown>;

/** Durable per-job key/value storage with an alarm, mirroring a Durable Object. */
export class SqliteJobStorage implements JobStorage {
  constructor(
    private db: SqliteDatabase,
    private id: string,
    private wake: () => void = () => {},
  ) {}
  private read(): Data {
    const row = this.db.sqlite
      .prepare('SELECT data FROM generation_jobs WHERE id=?')
      .get(this.id) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : {};
  }
  private ensure() {
    this.db.sqlite
      .prepare(
        "INSERT OR IGNORE INTO generation_jobs(id,data,created_at) VALUES (?,'{}',?)",
      )
      .run(this.id, new Date().toISOString());
  }
  private write(key: string, value: unknown) {
    this.ensure();
    const data = this.read();
    data[key] = value;
    this.db.sqlite
      .prepare('UPDATE generation_jobs SET data=? WHERE id=?')
      .run(JSON.stringify(data), this.id);
  }
  private alarm(time: number) {
    this.ensure();
    this.db.sqlite
      .prepare('UPDATE generation_jobs SET alarm_at=? WHERE id=?')
      .run(time, this.id);
  }
  async get<T>(key: string) {
    return this.read()[key] as T | undefined;
  }
  async put(key: string, value: unknown) {
    this.write(key, value);
  }
  async setAlarm(time: number) {
    this.alarm(time);
    this.wake();
  }
  /** Writes are buffered and committed together, like a storage transaction. */
  async transaction<T>(fn: (tx: JobTransaction) => Promise<T>) {
    const ops: (() => void)[] = [];
    let alarmSet = false;
    const result = await fn({
      get: (key) => this.get(key),
      put: async (key, value) => void ops.push(() => this.write(key, value)),
      setAlarm: async (time) => {
        alarmSet = true;
        ops.push(() => this.alarm(time));
      },
    });
    this.db.transaction(() => ops.forEach((op) => op()));
    if (alarmSet) this.wake();
    return result;
  }
}

const GENERATION_TIMEOUT = 300000;

/** Runs due job alarms in this process, at most `limit` at a time. */
export class JobRunner {
  private timer?: ReturnType<typeof setInterval>;
  private running = new Set<string>();
  constructor(
    private db: SqliteDatabase,
    private secret: string,
    private limit = Number(process.env.FORM_JOB_CONCURRENCY) || 4,
    private fetcher: typeof fetch = fetch,
  ) {}
  job(owner: string, requestId: string) {
    const id = owner + ':' + requestId;
    const store = new ProjectStore(this.db);
    return new BackgroundJob(
      new SqliteJobStorage(this.db, id, () => void this.tick()),
      store,
      async (who) => {
        const ai = await resolveConnection(store, who, this.secret);
        if (!ai) throw new HttpError(503, 'No AI connection is available.');
        return ai;
      },
      '',
      this.fetcher,
      GENERATION_TIMEOUT,
    );
  }
  exists(owner: string, requestId: string) {
    return !!this.db.sqlite
      .prepare('SELECT 1 FROM generation_jobs WHERE id=?')
      .get(owner + ':' + requestId);
  }
  start() {
    // A job left "running" by a previous process is reconciled by its alarm.
    this.db.sqlite
      .prepare(
        "UPDATE generation_jobs SET alarm_at=? WHERE alarm_at IS NULL AND json_extract(data,'$.job.state') IN ('queued','running')",
      )
      .run(Date.now());
    this.timer = setInterval(() => void this.tick(), 1000);
    this.timer.unref?.();
    void this.tick();
  }
  stop() {
    clearInterval(this.timer);
  }
  /** Run due alarms; returns once those started in this tick settle. */
  tick() {
    const due = this.db.sqlite
      .prepare(
        'SELECT id FROM generation_jobs WHERE alarm_at IS NOT NULL AND alarm_at<=? ORDER BY alarm_at LIMIT ?',
      )
      .all(Date.now(), Math.max(0, this.limit - this.running.size)) as {
      id: string;
    }[];
    const work: Promise<void>[] = [];
    for (const { id } of due) {
      if (this.running.has(id)) continue;
      this.db.sqlite
        .prepare('UPDATE generation_jobs SET alarm_at=NULL WHERE id=?')
        .run(id);
      const sep = id.lastIndexOf(':');
      this.running.add(id);
      work.push(
        this.job(id.slice(0, sep), id.slice(sep + 1))
          .alarm()
          .catch((e) => console.error('Generation job failed', e))
          .finally(() => void this.running.delete(id)),
      );
    }
    return Promise.all(work).then(() => {});
  }
}
