import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { ProjectStore } from '../lib/projects/store';
import { setDimensionLock } from '../lib/projects/locks';
import {
  createShare,
  readShare,
  revokeShare,
  listShares,
} from '../lib/projects/shares';
import {
  reviewProposal,
  saveProposal,
  restoreRevision,
  editFeature,
} from '../lib/projects/proposals';
import { runTurn } from '../lib/projects/service';
import {
  sample,
  upgradeModel,
  validateGeneratedModel,
  type Model,
} from '../lib/cad/model';
import { initialRevision } from '../lib/cad/history';
import { compareGeometry, buildGeometry, binarySTL } from '../lib/cad/geometry';
import { ownerOf, readBody } from '../lib/projects/http';
import type { ProjectDetail, TurnInput } from '../lib/projects/types';

// Execute production queries against SQLite, with D1-style atomic batches.
void test('locks survive forks and reject conflicting restoration; share stays on its original revision', async () => {
  const {store,sqlite} = fixture();
  try {
    let p = await store.create('alice',{name:'Branch lock'});
    const originalId = p.selectedRevisionId;
    const link = await createShare(store,'alice',p.id,originalId,false);
    const candidate = structuredClone(p.revisions[0].model); candidate.operations[2].size[0] = 6;
    const reply = await run(store,request(p),provider(candidate).fetcher);
    p = await reviewProposal(store,'alice',p.id,reply.proposalId!,'accept');
    p = await setDimensionLock(store,'alice',p.id,{revisionId:p.selectedRevisionId,featureId:candidate.operations[2].id!,axis:0,locked:true});
    p = await store.fork('alice',p.id,p.activeBranchId,p.selectedRevisionId);
    assert.equal(p.dimensionLocks[0].value,6);
    await assert.rejects(restoreRevision(store,'alice',p.id,p.activeBranchId,originalId),/locked/);
    assert.equal((await readShare(store,link.token)).model.operations[2].size[0],3);
  } finally {sqlite.close();}
});
void test('dimension locks block AI, manual edits and acceptance; unlock permits changes', async () => {
  const { store, sqlite } = fixture();
  try {
    let p = await store.create('alice', { name: 'Locked' });
    const model = p.revisions[0].model,
      feature = model.operations[2];
    p = await setDimensionLock(store, 'alice', p.id, {
      revisionId: p.selectedRevisionId,
      featureId: feature.id!,
      axis: 0,
      locked: true,
    });
    assert.equal(p.dimensionLocks[0].value, 3);
    const changed = structuredClone(model);
    changed.operations[2].size[0] = 5;
    await assert.rejects(
      run(store, request(p), provider(changed).fetcher),
      /locked/,
    );
    await assert.rejects(
      editFeature(store, 'alice', p.id, {
        branchId: p.activeBranchId,
        revisionId: p.selectedRevisionId,
        featureId: feature.id!,
        size: [5, 76, 23],
        position: feature.position,
      }),
      /locked/,
    );
    await assert.rejects(
      setDimensionLock(store, 'bob', p.id, {
        revisionId: p.selectedRevisionId,
        featureId: feature.id!,
        axis: 0,
        locked: false,
      }),
    );
    p = await setDimensionLock(store, 'alice', p.id, {
      revisionId: p.selectedRevisionId,
      featureId: feature.id!,
      axis: 0,
      locked: false,
    });
    const result = await run(store, request(p), provider(changed).fetcher);
    await setDimensionLock(store, 'alice', p.id, {
      revisionId: p.selectedRevisionId,
      featureId: feature.id!,
      axis: 0,
      locked: true,
    });
    await assert.rejects(
      reviewProposal(store, 'alice', p.id, result.proposalId!, 'accept'),
      /locked/,
    );
    await setDimensionLock(store, 'alice', p.id, {
      revisionId: p.selectedRevisionId,
      featureId: feature.id!,
      axis: 0,
      locked: false,
    });
    assert.equal(
      (await reviewProposal(store, 'alice', p.id, result.proposalId!, 'accept'))
        .revisions.length,
      2,
    );
  } finally {
    sqlite.close();
  }
});
void test('fixed revision shares exclude private context, enforce exports and revoke access', async () => {
  const { store, sqlite } = fixture();
  try {
    const p = await store.create('alice', {
      name: 'Private',
      brief: 'Secret notes',
    });
    const link = await createShare(
      store,
      'alice',
      p.id,
      p.selectedRevisionId,
      false,
    );
    const data = await readShare(store, link.token);
    assert.deepEqual(Object.keys(data).sort(), [
      'allowExport',
      'model',
      'ordinal',
    ]);
    await assert.rejects(readShare(store, link.token, true), /disabled/);
    await assert.rejects(
      createShare(store, 'bob', p.id, p.selectedRevisionId, true),
    );
    await assert.rejects(revokeShare(store, 'bob', p.id, link.id));
    assert.ok(
      !JSON.stringify(await listShares(store, 'alice', p.id)).includes(
        link.token,
      ),
    );
    const download = await createShare(
      store,
      'alice',
      p.id,
      p.selectedRevisionId,
      true,
    );
    assert.equal((await readShare(store, download.token, true)).ordinal, 0);
    await revokeShare(store, 'alice', p.id, link.id);
    await assert.rejects(readShare(store, link.token), /revoked/);
    await assert.rejects(readShare(store, 'invalid'));
  } finally {
    sqlite.close();
  }
});
void test('imported JSON is the starting model for offline AI editing', async () => {
  const { store, sqlite } = fixture();
  try {
    const source = structuredClone(sample);
    source.operations[2].position[0] = -12;
    const p = await store.create('alice', {
      name: 'Import',
      startingModel: source,
    });
    assert.equal(p.revisions[0].model.operations[2].position[0], -12);
    const ai = provider(null);
    await run(store, request(p, 'Explain this part'), ai.fetcher);
    assert.ok(
      ai.calls
        .find((c) => c.url.endsWith('/responses'))!
        .body.input[0].content.includes(JSON.stringify(p.revisions[0].model)),
    );
    await assert.rejects(
      store.create('alice', { name: 'Bad', startingModel: {} }),
    );
  } finally {
    sqlite.close();
  }
});
void test('project navigation preserves selected revisions and proposals through rename and archive', async () => {
  const { store, sqlite } = fixture();
  try {
    const a = await store.create('alice', { name: 'Project A' });
    const result = await run(store, request(a), provider().fetcher);
    const b = await store.create('alice', { name: 'Project B' });
    await store.update('alice', a.id, {
      name: 'Renamed A',
      brief: 'Brief',
      requirements: 'Requirements',
    });
    await assert.rejects(store.archive('bob', a.id, true), /not found/);
    await assert.rejects(store.archive('alice', a.id, 'yes'));
    let saved = await store.archive('alice', a.id, true);
    assert.equal(saved.archived, true);
    assert.equal(saved.name, 'Renamed A');
    assert.equal(saved.selectedRevisionId, a.selectedRevisionId);
    assert.equal(saved.activeBranchId, a.activeBranchId);
    assert.equal(saved.proposals[0].id, result.proposalId);
    assert.equal(saved.proposals[0].status, 'pending');
    const list = await store.list('alice');
    assert.equal(list.length, 2);
    assert.equal(list.find((p) => p.id === b.id)!.archived, false);
    assert.equal((await store.list('bob')).length, 0);
    saved = await new ProjectStore(store.db).archive('alice', a.id, false);
    assert.equal(saved.archived, false);
    assert.equal(saved.messages.length, 2);
    assert.equal(saved.proposals[0].id, result.proposalId);
  } finally {
    sqlite.close();
  }
});
void test('manual feature edits validate, refine, reload, accept and discard without AI', async () => {
  const { store, sqlite } = fixture();
  try {
    let p = await store.create('alice', { name: 'Inspector' });
    const original = p.revisions[0].model;
    const feature = original.operations[2];
    const body = {
      branchId: p.activeBranchId,
      revisionId: p.selectedRevisionId,
      featureId: feature.id!,
      size: feature.size,
      position: [0, feature.position[1], feature.position[2]],
    };
    await assert.rejects(editFeature(store, 'bob', p.id, body));
    await assert.rejects(
      editFeature(store, 'alice', p.id, { ...body, size: [0, 2, 3] }),
    );
    await assert.rejects(
      editFeature(store, 'alice', p.id, { ...body, position: ['', 2, 3] }),
    );
    await assert.rejects(
      editFeature(store, 'alice', p.id, { ...body, featureId: 'missing' }),
    );
    p = await editFeature(store, 'alice', p.id, body);
    const first = p.proposals.find((q) => q.status === 'pending')!;
    assert.equal(p.revisions.length, 1);
    assert.deepEqual(p.revisions[0].model, original);
    await assert.rejects(editFeature(store, 'alice', p.id, body), /proposal/i);
    p = await editFeature(store, 'alice', p.id, {
      ...body,
      proposalId: first.id,
      position: [-10, feature.position[1], feature.position[2]],
    });
    p = await new ProjectStore(store.db).detail('alice', p.id);
    const second = p.proposals.find((q) => q.status === 'pending')!;
    assert.equal(second.parentProposalId, first.id);
    assert.equal(second.model.operations[2].position[0], -10);
    assert.deepEqual(
      second.model.operations.filter((o) => o.id !== feature.id),
      original.operations.filter((o) => o.id !== feature.id),
    );
    assert.ok(
      second.summary.added > 0 &&
        second.summary.removed > 0 &&
        second.summary.unchanged > 0,
    );
    p = await reviewProposal(store, 'alice', p.id, second.id, 'accept');
    assert.equal(p.revisions.length, 2);
    assert.equal(p.revisions[1].model.operations[2].id, feature.id);
    await assert.rejects(editFeature(store, 'alice', p.id, body));
    p = await editFeature(store, 'alice', p.id, {
      ...body,
      revisionId: p.selectedRevisionId,
    });
    p = await reviewProposal(
      store,
      'alice',
      p.id,
      p.proposals.find((q) => q.status === 'pending')!.id,
      'discard',
    );
    assert.equal(p.revisions.length, 2);
    assert.equal(p.revisions[1].model.operations[2].position[0], -10);
  } finally {
    sqlite.close();
  }
});
void test('legacy migration preserves geometry, persisted IDs, and demo identity', async () => {
  const { store, sqlite } = fixture();
  const p = await store.demo('alice');
  const legacy = structuredClone(sample);
  sqlite
    .prepare('UPDATE revisions SET model_json=? WHERE id=?')
    .run(JSON.stringify(legacy), p.revisions[0].id);
  const saved = await store.detail('alice', p.id),
    model = saved.revisions[0].model;
  assert.equal(model.schemaVersion, 2);
  assert.ok(model.operations.every((o) => o.id));
  assert.deepEqual(
    binarySTL(buildGeometry(model).positions),
    binarySTL(buildGeometry(legacy).positions),
  );
  assert.deepEqual(
    model.operations.map((o) => o.id),
    saved.revisions[1].model.operations.map((o) => o.id),
  );
  assert.equal(
    JSON.parse(
      sqlite
        .prepare('SELECT model_json FROM revisions WHERE id=?')
        .get(p.revisions[0].id)!.model_json as string,
    ).schemaVersion,
    2,
  );
  const renamed = structuredClone(model);
  renamed.operations[2].name = 'Partition';
  renamed.operations[2].position[0] = -10;
  assert.equal(
    validateGeneratedModel(renamed, model).operations[2].id,
    model.operations[2].id,
  );
  const churn = structuredClone(model);
  churn.operations[2].id = 'replacement';
  assert.throws(() => validateGeneratedModel(churn, model), /identity/);
  const duplicate = structuredClone(model);
  duplicate.operations[1].id = duplicate.operations[0].id;
  assert.throws(() => validateGeneratedModel(duplicate), /unique/);
  assert.throws(() => validateGeneratedModel(legacy), /version 2/);
  sqlite.close();
});
void test('proposal reload, accept, idempotency, export and revision parent work together', async () => {
  const { store, sqlite } = fixture();
  const p = await store.create('alice', { name: 'Review' });
  const candidate = structuredClone(sample);
  candidate.operations[2].position[0] = -17;
  const result = await run(store, request(p), provider(candidate).fetcher);
  let saved = await new ProjectStore(store.db).detail('alice', p.id);
  assert.equal(saved.revisions.length, 1);
  assert.equal(saved.selectedRevisionId, p.selectedRevisionId);
  assert.equal(saved.proposals[0].status, 'pending');
  assert.deepEqual(
    binarySTL(buildGeometry(saved.revisions[0].model).positions),
    binarySTL(buildGeometry(sample).positions),
  );
  await assert.rejects(
    reviewProposal(store, 'bob', p.id, result.proposalId!, 'accept'),
    /not found/,
  );
  saved = await reviewProposal(
    store,
    'alice',
    p.id,
    result.proposalId!,
    'accept',
  );
  assert.equal(saved.revisions.length, 2);
  assert.equal(saved.revisions[1].parentId, p.selectedRevisionId);
  assert.equal(saved.proposals[0].status, 'accepted');
  assert.deepEqual(
    binarySTL(buildGeometry(saved.revisions[1].model).positions),
    binarySTL(buildGeometry(candidate).positions),
  );
  assert.equal(
    (await reviewProposal(store, 'alice', p.id, result.proposalId!, 'accept'))
      .revisions.length,
    2,
  );
  assert.ok(
    saved.messages.some(
      (m) => m.updated && m.revisionId === saved.selectedRevisionId,
    ),
  );
  await assert.rejects(
    reviewProposal(store, 'alice', p.id, result.proposalId!, 'discard'),
    /already/,
  );
  sqlite.close();
});
void test('discard reconstructs accepted context and refinement supersedes only on success', async () => {
  const { store, sqlite } = fixture();
  let p = await store.create('alice', { name: 'Review' });
  const first = await run(store, request(p), provider().fetcher);
  p = await store.detail('alice', p.id);
  const refinedInput = {
    ...request(p, 'Refine'),
    proposalId: first.proposalId,
  };
  const failing = (async () =>
    Response.json({}, { status: 500 })) as typeof fetch;
  await assert.rejects(run(store, refinedInput, failing));
  assert.equal(
    (await store.detail('alice', p.id)).proposals[0].status,
    'pending',
  );
  const ai = provider();
  const next = await run(
    store,
    { ...refinedInput, requestId: crypto.randomUUID() },
    ai.fetcher,
  );
  p = await store.detail('alice', p.id);
  assert.equal(
    p.proposals.find((q) => q.id === first.proposalId)!.status,
    'superseded',
  );
  assert.equal(
    p.proposals.find((q) => q.id === next.proposalId)!.parentProposalId,
    first.proposalId,
  );
  await reviewProposal(store, 'alice', p.id, next.proposalId!, 'discard');
  p = await store.detail('alice', p.id);
  assert.equal(p.revisions.length, 1);
  const after = provider(null);
  await run(store, request(p, 'What is accepted?'), after.fetcher);
  const payload = after.calls.find((c) => c.url.endsWith('/responses'))!.body
    .input[0].content;
  assert.ok(payload.includes('discarded'));
  assert.ok(payload.includes('"editingProposal":null'));
  assert.ok(payload.includes('selectedModel'));
  sqlite.close();
});
void test('review rejects stale and busy proposals and rolls back failed acceptance', async () => {
  const { store, sqlite } = fixture();
  const p = await store.create('alice', { name: 'Review' });
  const result = await run(store, request(p), provider().fetcher);
  const input = { ...request(p, 'Refine'), proposalId: result.proposalId };
  await store.begin('alice', input);
  await assert.rejects(
    reviewProposal(store, 'alice', p.id, result.proposalId!, 'accept'),
    /in progress/,
  );
  await store.fail(input, 'Test reset');
  sqlite.exec(
    "CREATE TRIGGER fail_review BEFORE INSERT ON revisions BEGIN SELECT RAISE(ABORT,'injected failure'); END",
  );
  await assert.rejects(
    reviewProposal(store, 'alice', p.id, result.proposalId!, 'accept'),
    /injected/,
  );
  assert.equal(
    (await store.detail('alice', p.id)).proposals[0].status,
    'pending',
  );
  sqlite.exec('DROP TRIGGER fail_review');
  sqlite
    .prepare('UPDATE branches SET head_revision_id=? WHERE id=?')
    .run('changed-head', p.activeBranchId);
  await assert.rejects(
    reviewProposal(store, 'alice', p.id, result.proposalId!, 'accept'),
    /stale/,
  );
  assert.equal(
    (await reviewProposal(store, 'alice', p.id, result.proposalId!, 'discard'))
      .proposals[0].status,
    'discarded',
  );
  sqlite.close();
});
void test('cancelled refinement cannot replace the existing proposal', async () => {
  const { store, sqlite } = fixture();
  const p = await store.create('alice', { name: 'Review' }),
    first = await run(store, request(p), provider().fetcher);
  const input = { ...request(p, 'Refine'), proposalId: first.proposalId };
  await store.begin('alice', input);
  await store.cancel('alice', input);
  await assert.rejects(
    saveProposal(
      store,
      input,
      {
        model: upgradeModel(sample),
        message: 'Late',
        branchId: p.activeBranchId,
        revisionId: p.selectedRevisionId,
        proposalId: crypto.randomUUID(),
      },
      {},
    ),
    /cancelled/,
  );
  const saved = await store.detail('alice', p.id);
  assert.equal(saved.proposals.length, 1);
  assert.equal(saved.proposals[0].status, 'pending');
  sqlite.close();
});
void test('restoration creates a reviewable proposal and preserves the original history', async () => {
  const { store, sqlite } = fixture();
  const p = await store.demo('alice');
  let restored = await restoreRevision(
    store,
    'alice',
    p.id,
    p.activeBranchId,
    p.revisions[0].id,
  );
  assert.equal(restored.revisions.length, 2);
  assert.equal(restored.proposals[0].baseRevisionId, p.revisions[1].id);
  restored = await reviewProposal(
    store,
    'alice',
    p.id,
    restored.proposals[0].id,
    'accept',
  );
  assert.equal(restored.revisions.length, 3);
  assert.equal(restored.revisions[2].parentId, p.revisions[1].id);
  assert.deepEqual(restored.revisions[2].model, p.revisions[0].model);
  sqlite.close();
});
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
function provider(model: Model | null = sample, replies?: (Model | null)[]) {
  let responseIndex = 0;
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
    assert.ok(
      String(url) === 'https://api.openai.com/v1/conversations' ||
        String(url) === 'https://api.openai.com/v1/responses',
      'Unexpected provider endpoint',
    );
    if (String(url).endsWith('/responses') && replies) {
      assert.ok(
        responseIndex < replies.length,
        'Mock reply sequence exhausted',
      );
      model = replies[responseIndex++];
    }
    return String(url).endsWith('/conversations')
      ? Response.json({ id: `conv_test_${calls.length}` })
      : Response.json({
          status: 'completed',
          output: [
            {
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({
                    message: 'Saved answer.',
                    model: model ? upgradeModel(model) : null,
                  }),
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

void test('offline conversation: propose, refine, reload, compare, accept and export', async () => {
  const { store, sqlite } = fixture();
  try {
    let p = await store.create('alice', { name: 'Offline conversation QA' });
    const original = p.revisions[0].model;
    const centered = structuredClone(original);
    centered.operations[2].position[0] = 0;
    const refined = structuredClone(centered);
    refined.operations[2].position[0] = -10;
    const ai = provider(null, [centered, refined, null]);
    const first = await run(
      store,
      request(p, 'Center the existing divider at X=0.'),
      ai.fetcher,
    );
    p = await new ProjectStore(store.db).detail('alice', p.id);
    assert.equal(p.revisions.length, 1);
    assert.deepEqual(p.revisions[0].model, original);
    const second = await run(
      store,
      {
        ...request(
          p,
          'Refine the pending proposal: move the divider to X=-10.',
        ),
        proposalId: first.proposalId,
      },
      ai.fetcher,
    );
    p = await new ProjectStore(store.db).detail('alice', p.id);
    const pending = p.proposals.find((q) => q.id === second.proposalId)!;
    assert.equal(pending.status, 'pending');
    assert.equal(pending.parentProposalId, first.proposalId);
    assert.equal(
      p.proposals.find((q) => q.id === first.proposalId)!.status,
      'superseded',
    );
    assert.deepEqual(pending.model, refined);
    assert.deepEqual(
      pending.model.operations.map((o) => o.id),
      original.operations.map((o) => o.id),
    );
    const volumes = compareGeometry(original, pending.model).volumes;
    assert.ok(
      volumes.added > 0 && volumes.removed > 0 && volumes.unchanged > 0,
    );
    const responses = ai.calls.filter((c) => c.url.endsWith('/responses'));
    assert.equal(
      responses[0].body.conversation,
      responses[1].body.conversation,
    );
    assert.ok(
      responses[1].body.input[0].content.includes(JSON.stringify(centered)),
    );
    assert.ok(
      responses[1].body.input[0].content.includes(JSON.stringify(original)),
    );
    p = await reviewProposal(
      store,
      'alice',
      p.id,
      second.proposalId!,
      'accept',
    );
    p = await new ProjectStore(store.db).detail('alice', p.id);
    assert.equal(p.revisions.length, 2);
    assert.equal(p.revisions[1].parentId, p.revisions[0].id);
    assert.deepEqual(p.revisions[1].model, refined);
    assert.deepEqual(
      binarySTL(buildGeometry(p.revisions[1].model).positions),
      binarySTL(buildGeometry(refined).positions),
    );
    await run(store, request(p, 'What model is accepted now?'), ai.fetcher);
    const last = ai.calls.filter((c) => c.url.endsWith('/responses')).at(-1)!;
    assert.notEqual(last.body.conversation, responses[0].body.conversation);
    assert.ok(last.body.input[0].content.includes('"editingProposal":null'));
    assert.ok(last.body.input[0].content.includes(JSON.stringify(refined)));
    assert.equal(
      ai.calls.filter((c) => c.url.endsWith('/conversations')).length,
      2,
    );
    assert.equal((await store.detail('alice', p.id)).revisions.length, 2);
  } finally {
    sqlite.close();
  }
});

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
  assert.deepEqual(reopened.revisions[0].model, upgradeModel(sample));
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
  assert.equal(p.revisions.length, 1);
  assert.equal(p.messages.length, 2);
  assert.equal(p.selectedRevisionId, first.revisionId);
  assert.ok(p.proposals[0].summary);
  assert.equal(p.proposals[0].baseRevisionId, input.revisionId);
  const cached = await run(store, input, ai.fetcher);
  assert.deepEqual(cached, first);
  assert.equal(ai.calls.length, 2);
  await run(
    store,
    { ...request(p, 'Keep V0 dimensions.'), proposalId: first.proposalId },
    ai.fetcher,
  );
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
    [0],
  );
  sqlite.close();
});
void test('forks seed the selected ancestry without later discussion or another branch conversation', async () => {
  const { store, sqlite } = fixture();
  let p = await store.create('alice', { name: 'Part' });
  const ai = provider();
  const first = await run(store, request(p, 'first-edit'), ai.fetcher);
  await reviewProposal(store, 'alice', p.id, first.proposalId!, 'accept');
  p = await store.detail('alice', p.id);
  const v1 = p.selectedRevisionId;
  const main = p.activeBranchId;
  const future = await run(store, request(p, 'future-edit'), ai.fetcher);
  await reviewProposal(store, 'alice', p.id, future.proposalId!, 'accept');
  p = await store.fork('alice', p.id, main, v1);
  assert.equal(p.messages.length, 3);
  assert.ok(!p.messages.some((m) => m.content.includes('future-edit')));
  assert.equal(
    p.branches.find((b) => b.id === p.activeBranchId)!.conversationReady,
    false,
  );
  const branch = await run(store, request(p, 'branch-edit'), ai.fetcher);
  await reviewProposal(store, 'alice', p.id, branch.proposalId!, 'accept');
  const seeds = ai.calls.filter((c) => c.url.endsWith('/conversations'));
  assert.equal(seeds.length, 3);
  assert.ok(seeds[2].body.items[0].content.includes('first-edit'));
  assert.ok(!seeds[2].body.items[0].content.includes('future-edit'));
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
  const proposed = await run(store, request(p), provider().fetcher);
  await reviewProposal(store, 'alice', p.id, proposed.proposalId!, 'accept');
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
