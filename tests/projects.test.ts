import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { ProjectStore } from '../lib/projects/store';
import { runTurn } from '../lib/projects/service';
import { sample, type Model } from '../lib/cad/model';
import { initialRevision } from '../lib/cad/history';
import { compareGeometry } from '../lib/cad/geometry';
import { ownerOf, readBody } from '../lib/projects/http';
import type { ProjectDetail, TurnInput } from '../lib/projects/types';

// Execute production queries against SQLite, with D1-style atomic batches.
function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  for (const file of readdirSync('drizzle')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    sqlite.exec(readFileSync(`drizzle/${file}`, 'utf8'));
  class Statement {
    constructor(
      public sql: string,
      public args: SQLInputValue[] = [],
    ) {}
    bind(...args: SQLInputValue[]) {
      return new Statement(this.sql, args);
    }
    execute() {
      const stmt = sqlite.prepare(this.sql);
      const rows = stmt.all(...this.args);
      return {
        results: rows,
        success: true,
        meta: {
          changes: Number(sqlite.prepare('SELECT changes() AS n').get()!.n),
        },
      };
    }
    async first<T>() {
      return (this.execute().results[0] ?? null) as T | null;
    }
    async all() {
      return this.execute();
    }
    async run() {
      return this.execute();
    }
  }
  const db = {
    prepare: (sql: string) => new Statement(sql),
    batch: async (stmts: Statement[]) => {
      sqlite.exec('BEGIN');
      try {
        const results = stmts.map((s) => s.execute());
        sqlite.exec('COMMIT');
        return results;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  } as unknown as D1Database;
  return { store: new ProjectStore(db), sqlite };
}
function request(
  p: ProjectDetail,
  message = 'Please revise the part.',
): TurnInput {
  return {
    projectId: p.id,
    branchId: p.activeBranchId,
    revisionId: p.selectedRevisionId,
    requestId: crypto.randomUUID(),
    message,
  };
}
function provider(model: Model | null = sample) {
  const calls: {
    url: string;
    body: {
      conversation?: string;
      store?: boolean;
      input: { content: string }[];
      items: { content: string }[];
    };
  }[] = [];
  const fetcher = (async (url: unknown, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    calls.push({ url: String(url), body });
    return String(url).endsWith('/conversations')
      ? Response.json({ id: `conv_test_${calls.length}` })
      : Response.json({
          status: 'completed',
          output: [
            {
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({ message: 'Saved answer.', model }),
                },
              ],
            },
          ],
        });
  }) as typeof fetch;
  return { calls, fetcher };
}
void test('built-in demo has two comparable versions and is created once per owner', async () => {
  const { store, sqlite } = fixture();
  const p = await store.demo('alice');
  assert.equal(p.revisions.length, 2);
  assert.equal(p.selectedRevisionId, p.revisions[1].id);
  assert.equal(p.revisions[1].parentId, p.revisions[0].id);
  const { volumes } = compareGeometry(
    p.revisions[0].model,
    p.revisions[1].model,
  );
  assert.ok(volumes.added > 0 && volumes.removed > 0 && volumes.unchanged > 0);
  await store.update('alice', p.id, { name: 'My edited demo' });
  const reopened = await store.demo('alice');
  assert.equal(reopened.id, p.id);
  assert.equal(reopened.name, 'My edited demo');
  assert.notEqual((await store.demo('bob')).id, p.id);
  sqlite.close();
});
const run = (
  store: ProjectStore,
  input: TurnInput,
  fetcher: typeof fetch,
  signal = new AbortController().signal,
) => runTurn(store, 'alice', input, 'test-key', 'test-model', signal, fetcher);

void test('projects survive reopen, enforce ownership and keep conversation IDs server-only', async () => {
  const { store, sqlite } = fixture();
  const p = await store.create('alice', {
    name: 'Enclosure',
    requirements: '3 mm walls',
  });
  await store.update('alice', p.id, {
    name: 'Sensor enclosure',
    brief: 'Outdoor sensor',
    requirements: '3 mm walls',
  });
  const reopened = await new ProjectStore(store.db).detail('alice', p.id);
  assert.equal(reopened.name, 'Sensor enclosure');
  assert.equal(reopened.requirements, '3 mm walls');
  assert.deepEqual(reopened.revisions[0].model, sample);
  assert.equal((await store.list('bob')).length, 0);
  await assert.rejects(store.detail('bob', p.id), /not found/);
  await assert.rejects(
    store.update('bob', p.id, { name: 'hijack' }),
    /not found/,
  );
  assert.ok(!JSON.stringify(reopened).includes('conversation_id'));
  sqlite.close();
});
void test('two turns reuse one durable conversation and atomically save model, chat and comparison', async () => {
  const { store, sqlite } = fixture();
  let p = await store.create('alice', {
    name: 'Enclosure',
    requirements: '3 mm walls',
  });
  const ai = provider();
  const input = request(p);
  const first = await run(store, input, ai.fetcher);
  p = await store.detail('alice', p.id);
  assert.equal(p.revisions.length, 2);
  assert.equal(p.messages.length, 2);
  assert.equal(p.selectedRevisionId, first.revisionId);
  assert.ok(p.revisions[1].summary);
  assert.equal(p.revisions[1].parentId, input.revisionId);
  const cached = await run(store, input, ai.fetcher);
  assert.deepEqual(cached, first);
  assert.equal(ai.calls.length, 2);
  await run(store, request(p, 'Keep V0 dimensions.'), ai.fetcher);
  assert.equal(
    ai.calls.filter((c) => c.url.endsWith('/conversations')).length,
    1,
  );
  const responses = ai.calls.filter((c) => c.url.endsWith('/responses'));
  assert.equal(responses[0].body.conversation, responses[1].body.conversation);
  assert.equal(responses[1].body.input.length, 1);
  assert.equal(responses[1].body.store, true);
  assert.ok(responses[1].body.input[0].content.includes('3 mm walls'));
  p = await store.detail('alice', p.id);
  assert.equal(p.messages.length, 4);
  assert.deepEqual(
    p.revisions.map((r) => r.ordinal),
    [0, 1, 2],
  );
  sqlite.close();
});
void test('forks seed the selected ancestry without later discussion or another branch conversation', async () => {
  const { store, sqlite } = fixture();
  let p = await store.create('alice', { name: 'Part' });
  const ai = provider();
  await run(store, request(p, 'first-edit'), ai.fetcher);
  p = await store.detail('alice', p.id);
  const v1 = p.selectedRevisionId;
  const main = p.activeBranchId;
  await run(store, request(p, 'future-edit'), ai.fetcher);
  p = await store.fork('alice', p.id, main, v1);
  assert.equal(p.messages.length, 2);
  assert.ok(!p.messages.some((m) => m.content.includes('future-edit')));
  assert.equal(
    p.branches.find((b) => b.id === p.activeBranchId)!.conversationReady,
    false,
  );
  await run(store, request(p, 'branch-edit'), ai.fetcher);
  const seeds = ai.calls.filter((c) => c.url.endsWith('/conversations'));
  assert.equal(seeds.length, 2);
  assert.ok(seeds[1].body.items[0].content.includes('first-edit'));
  assert.ok(!seeds[1].body.items[0].content.includes('future-edit'));
  p = await store.detail('alice', p.id);
  assert.equal(p.revisions.at(-1)!.parentId, v1);
  assert.equal(
    p.branches.find((b) => b.id === main)!.headRevisionId,
    p.revisions[2].id,
  );
  sqlite.close();
});
void test('ordinary discussion persists without a model revision', async () => {
  const { store, sqlite } = fixture();
  const p = await store.create('alice', { name: 'Part' });
  await run(store, request(p, 'Which material?'), provider(null).fetcher);
  const saved = await store.detail('alice', p.id);
  assert.equal(saved.revisions.length, 1);
  assert.equal(saved.messages.length, 2);
  assert.equal(saved.messages[1].updated, false);
  sqlite.close();
});
void test('invalid solid fails without a revision and rebuilds context on the next request', async () => {
  const { store, sqlite } = fixture();
  const p = await store.create('alice', { name: 'Part' });
  const empty: Model = {
    ...sample,
    operations: [
      sample.operations[0],
      { ...sample.operations[0], operation: 'subtract' },
    ],
  };
  await assert.rejects(
    run(store, request(p), provider(empty).fetcher),
    /empty/,
  );
  const saved = await store.detail('alice', p.id);
  assert.equal(saved.messages.length, 0);
  assert.equal(saved.revisions.length, 1);
  assert.equal(saved.branches[0].conversationReady, false);
  const ai = provider(null);
  await run(store, request(p, 'Try again'), ai.fetcher);
  assert.equal(
    ai.calls.filter((c) => c.url.endsWith('/conversations')).length,
    1,
  );
  sqlite.close();
});
void test('branch locking prevents concurrent and stale edits, cancellation blocks late commits', async () => {
  const { store, sqlite } = fixture();
  const p = await store.create('alice', { name: 'Part' }),
    input = request(p);
  await store.begin('alice', input);
  await store.setConversation(input, 'conv_pending');
  await assert.rejects(store.begin('alice', request(p)), /request in progress/);
  assert.equal((await store.cancel('alice', input)).status, 'cancelled');
  await assert.rejects(
    store.commit(
      input,
      {
        model: sample,
        message: 'Late answer',
        revisionId: crypto.randomUUID(),
        branchId: input.branchId,
      },
      null,
    ),
    /cancelled/,
  );
  assert.equal((await store.detail('alice', p.id)).messages.length, 0);
  const beforeStart = request(p);
  await store.cancel('alice', beforeStart);
  await assert.rejects(store.begin('alice', beforeStart), /did not complete/);
  await run(store, request(p), provider().fetcher);
  await assert.rejects(store.begin('alice', request(p)), /branch changed/);
  sqlite.close();
});
void test('expired locks reset provider state and cannot commit over the new request', async () => {
  const { store, sqlite } = fixture();
  const p = await store.create('alice', { name: 'Part' }),
    old = request(p);
  await store.begin('alice', old);
  await store.setConversation(old, 'conv_old');
  sqlite
    .prepare('UPDATE branches SET lock_until=1 WHERE id=?')
    .run(old.branchId);
  const next = request(p),
    started = await store.begin('alice', next);
  assert.equal(started.branch!.conversation_id, null);
  await assert.rejects(
    store.commit(
      old,
      {
        model: null,
        message: 'old',
        revisionId: old.revisionId,
        branchId: old.branchId,
      },
      null,
    ),
    /superseded/,
  );
  await store.commit(
    next,
    {
      model: null,
      message: 'new',
      revisionId: next.revisionId,
      branchId: next.branchId,
    },
    null,
  );
  assert.equal((await store.detail('alice', p.id)).messages[1].content, 'new');
  sqlite.close();
});
void test('legacy import is idempotent and reconstructs branches', async () => {
  const { store, sqlite } = fixture();
  const history = [
    initialRevision,
    { ...initialRevision, id: 'a', parentId: 'initial', prompt: 'A' },
    { ...initialRevision, id: 'b', parentId: 'initial', prompt: 'B' },
  ];
  const p = await store.create(
    'alice',
    { name: 'Imported' },
    history,
    'test-import',
  );
  const duplicate = await store.create(
    'alice',
    { name: 'Imported' },
    history,
    'test-import',
  );
  assert.equal(p.id, duplicate.id);
  assert.equal(p.branches.length, 2);
  assert.equal(p.revisions[1].parentId, p.revisions[0].id);
  assert.equal(p.revisions[2].parentId, p.revisions[0].id);
  sqlite.close();
});
void test('HTTP guards require identity, same origin and bounded JSON', async () => {
  assert.throws(
    () => ownerOf(new Request('http://localhost/api/projects')),
    /Sign in/,
  );
  await assert.rejects(
    readBody(
      new Request('http://localhost/api/projects', {
        method: 'POST',
        headers: {
          origin: 'https://other.test',
          'Content-Type': 'application/json',
        },
        body: '{}',
      }),
    ),
    /Cross-origin/,
  );
  await assert.rejects(
    readBody(
      new Request('http://localhost/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"long":"payload"}',
      }),
      5,
    ),
    /too large/,
  );
});
