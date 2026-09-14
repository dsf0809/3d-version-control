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
  const { store, sqlite } = fixture();
  try {
    let p = await store.create('alice', { name: 'Branch lock' });
    const originalId = p.selectedRevisionId;
    const link = await createShare(store, 'alice', p.id, originalId, false);
    const candidate = structuredClone(p.revisions[0].model);
    candidate.operations[2].size[0] = 6;
    const reply = await run(store, request(p), provider(candidate).fetcher);
    p = await reviewProposal(store, 'alice', p.id, reply.proposalId!, 'accept');
    p = await setDimensionLock(store, 'alice', p.id, {
      revisionId: p.selectedRevisionId,
      featureId: candidate.operations[2].id!,
      axis: 0,
      locked: true,
    });
    p = await store.fork('alice', p.id, p.activeBranchId, p.selectedRevisionId);
    assert.equal(p.dimensionLocks[0].value, 6);
    await assert.rejects(
      restoreRevision(store, 'alice', p.id, p.activeBranchId, originalId),
      /locked/,
    );
    assert.equal(
      (await readShare(store, link.token)).model.operations[2].size[0],
      3,
    );
  } finally {
    sqlite.close();
  }
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

void test('approval preference defaults to review, is owner scoped, and cannot change during generation', async () => {
  const { store, sqlite } = fixture();
  try {
    const p = await store.create('alice', { name: 'Permissions' });
    assert.equal(p.approvalMode, 'review');
    await assert.rejects(store.setApprovalMode('bob', p.id, 'auto'));
    await assert.rejects(store.setApprovalMode('alice', p.id, 'anything'));
    const input = request(p);
    await store.begin('alice', input);
    await assert.rejects(
      store.setApprovalMode('alice', p.id, 'auto'),
      /current edit/,
    );
    await store.fail(input, 'Test cancelled');
    await store.setApprovalMode('alice', p.id, 'auto');
    assert.equal((await store.detail('alice', p.id)).approvalMode, 'auto');
  } finally {
    sqlite.close();
  }
});
function patchProvider(baseId: string, featureId: string, value: number[]) {
  return (async (url: unknown, init: RequestInit) => {
    if (String(url).endsWith('/conversations'))
      return Response.json({ id: 'conv_offline_patch' });
    const body = JSON.parse(init.body as string);
    assert.equal(body.text.format.strict, true);
    assert.ok(body.text.format.schema.required.includes('edits'));
    assert.ok(body.instructions.includes(baseId));
    return Response.json({
      status: 'completed',
      output: [
        {
          content: [
            {
              type: 'output_text',
              text: JSON.stringify({
                message: 'Updated divider.',
                model: null,
                edits: {
                  baseId,
                  commands: [
                    { kind: 'set-vector', featureId, field: 'size', value },
                  ],
                },
              }),
            },
          ],
        },
      ],
    });
  }) as typeof fetch;
}
void test('targeted AI edits review by default, auto-save atomically when opted in, and retry idempotently', async () => {
  const { store, sqlite } = fixture();
  try {
    let p = await store.create('alice', { name: 'Targeted' });
    const feature = p.revisions[0].model.operations[2];
    const reviewed = await run(
      store,
      request(p),
      patchProvider(p.selectedRevisionId, feature.id!, [5, 76, 23]),
    );
    assert.ok(reviewed.proposalId);
    assert.equal((await store.detail('alice', p.id)).revisions.length, 1);
    p = await reviewProposal(
      store,
      'alice',
      p.id,
      reviewed.proposalId!,
      'discard',
    );
    p = await store.setApprovalMode('alice', p.id, 'auto');
    const input = request(p),
      fetcher = patchProvider(p.selectedRevisionId, feature.id!, [6, 76, 23]);
    const result = await run(store, input, fetcher);
    assert.equal(result.proposalId, undefined);
    assert.notEqual(result.revisionId, input.revisionId);
    assert.deepEqual(await run(store, input, fetcher), result);
    const saved = await store.detail('alice', p.id);
    assert.equal(saved.revisions.length, 2);
    assert.equal(saved.selectedRevisionId, result.revisionId);
    assert.equal(saved.revisions.at(-1)!.model.operations[2].size[0], 6);
    assert.equal(saved.messages.at(-1)!.updated, true);
  } finally {
    sqlite.close();
  }
});
void test('automatic edits enforce dimension locks and stale-base validation, leaving history untouched', async () => {
  const { store, sqlite } = fixture();
  try {
    let p = await store.create('alice', { name: 'Auto locks' });
    p = await store.setApprovalMode('alice', p.id, 'auto');
    const feature = p.revisions[0].model.operations[2];
    await setDimensionLock(store, 'alice', p.id, {
      revisionId: p.selectedRevisionId,
      featureId: feature.id!,
      axis: 0,
      locked: true,
    });
    await assert.rejects(
      run(
        store,
        request(p),
        patchProvider(p.selectedRevisionId, feature.id!, [5, 76, 23]),
      ),
      /locked/,
    );
    const bad = (async (url: unknown) =>
      String(url).endsWith('/conversations')
        ? Response.json({ id: 'conv_stale' })
        : Response.json({
            status: 'completed',
            output: [
              {
                content: [
                  {
                    type: 'output_text',
                    text: JSON.stringify({
                      message: 'Bad target',
                      model: null,
                      edits: {
                        baseId: 'stale',
                        commands: [{ kind: 'rename-model', name: 'Bad' }],
                      },
                    }),
                  },
                ],
              },
            ],
          })) as typeof fetch;
    await assert.rejects(run(store, request(p), bad), /stale/);
    assert.equal((await store.detail('alice', p.id)).revisions.length, 1);
  } finally {
    sqlite.close();
  }
});
void test('switching to auto never silently accepts an existing proposal or its refinement', async () => {
  const { store, sqlite } = fixture();
  try {
    let p = await store.create('alice', { name: 'Pending' });
    const proposed = await run(
      store,
      request(p),
      provider(p.revisions[0].model).fetcher,
    );
    p = await store.setApprovalMode('alice', p.id, 'auto');
    assert.equal(p.proposals[0].status, 'pending');
    assert.equal(p.revisions.length, 1);
    const input = { ...request(p), proposalId: proposed.proposalId };
    const result = await run(
      store,
      input,
      patchProvider(
        proposed.proposalId!,
        p.revisions[0].model.operations[2].id!,
        [5, 76, 23],
      ),
    );
    assert.ok(result.proposalId);
    assert.equal((await store.detail('alice', p.id)).revisions.length, 1);
  } finally {
    sqlite.close();
  }
});
void test('automatic application cannot commit after cancellation or an expired permission lease', async () => {
  const { store, sqlite } = fixture();
  try {
    let p = await store.create('alice', { name: 'Auto cancellation' });
    p = await store.setApprovalMode('alice', p.id, 'auto');
    for (const cancel of [true, false]) {
      const input = request(p);
      await store.begin('alice', input);
      if (cancel) await store.cancel('alice', input);
      else {
        sqlite
          .prepare('UPDATE branches SET lock_until=0 WHERE id=?')
          .run(input.branchId);
        await store.setApprovalMode('alice', p.id, 'review');
      }
      await assert.rejects(
        store.commit(
          input,
          {
            message: 'late',
            model: p.revisions[0].model,
            revisionId: crypto.randomUUID(),
            branchId: input.branchId,
          },
          null,
          true,
        ),
        /cancelled or superseded/,
      );
      assert.equal((await store.detail('alice', p.id)).revisions.length, 1);
    }
  } finally {
    sqlite.close();
  }
});

void test('independent branch views return matching discussion and proposals without changing saved selection', async () => {
  const { store, sqlite } = fixture();
  try {
    const original = await store.create('alice', { name: 'Independent tabs' });
    const fork = await store.fork(
      'alice',
      original.id,
      original.activeBranchId,
      original.selectedRevisionId,
    );
    const result = await run(
      store,
      request(fork, 'Branch-only edit'),
      provider(fork.revisions[0].model).fetcher,
    );
    const a = await store.detail('alice', original.id, {
      branchId: original.activeBranchId,
      revisionId: original.selectedRevisionId,
    });
    const b = await store.detail('alice', original.id, {
      branchId: fork.activeBranchId,
    });
    assert.equal(a.proposals.length, 0);
    assert.equal(b.proposals[0].id, result.proposalId);
    assert.ok(!a.messages.some((m) => m.content === 'Branch-only edit'));
    assert.ok(b.messages.some((m) => m.content === 'Branch-only edit'));
    assert.equal(
      (await store.detail('alice', original.id)).activeBranchId,
      fork.activeBranchId,
    );
    await assert.rejects(
      store.detail('bob', original.id, { branchId: fork.activeBranchId }),
    );
    await assert.rejects(
      store.detail('alice', original.id, { branchId: 'missing' }),
    );
    const accepted = await reviewProposal(
      store,
      'alice',
      original.id,
      result.proposalId!,
      'accept',
    );
    await assert.rejects(
      store.detail('alice', original.id, {
        branchId: original.activeBranchId,
        revisionId: accepted.selectedRevisionId,
      }),
    );
  } finally {
    sqlite.close();
  }
});

void test('message pages are bounded, chronological, branch-scoped and have no gaps or duplicates', async () => {
  const { store, sqlite } = fixture();
  try {
    const { messagePage } = await import('../lib/projects/messages');
    const p = await store.create('alice', { name: 'Long discussion' });
    for (let i = 0; i < 95; i++)
      sqlite
        .prepare(
          'INSERT INTO messages (id,project_id,branch_id,ordinal,role,content,revision_id,updated,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
        )
        .run(
          crypto.randomUUID(),
          p.id,
          p.activeBranchId,
          i,
          'user',
          'Message ' + i,
          p.selectedRevisionId,
          0,
          new Date().toISOString(),
        );
    const first = await store.detail('alice', p.id, {
      branchId: p.activeBranchId,
      pageMessages: true,
    });
    assert.equal(first.messages.length, 40);
    assert.equal(first.messages[0].content, 'Message 55');
    const second = await messagePage(
      store,
      'alice',
      p.id,
      p.activeBranchId,
      first.messageCursor!,
    );
    const third = await messagePage(
      store,
      'alice',
      p.id,
      p.activeBranchId,
      second.messageCursor!,
    );
    const all = [...third.messages, ...second.messages, ...first.messages];
    assert.equal(all.length, 95);
    assert.equal(new Set(all.map((m) => m.id)).size, 95);
    assert.equal(third.messageCursor, null);
    await assert.rejects(messagePage(store, 'bob', p.id, p.activeBranchId));
    await assert.rejects(messagePage(store, 'alice', p.id, 'foreign'));
    await assert.rejects(
      messagePage(store, 'alice', p.id, p.activeBranchId, -1),
    );
  } finally {
    sqlite.close();
  }
});
void test('saved turn status reports phases, results, cancellation and expired leases without another provider call', async () => {
  const { store, sqlite } = fixture();
  try {
    const { turnStatus, setTurnPhase } =
      await import('../lib/projects/turn-status');
    const p = await store.create('alice', { name: 'Recovery' }),
      input = request(p);
    await store.begin('alice', input);
    await setTurnPhase(store, input.requestId, 'validating');
    assert.equal(
      (await turnStatus(store, 'alice', p.id, input.requestId)).phase,
      'validating',
    );
    await assert.rejects(turnStatus(store, 'bob', p.id, input.requestId));
    await store.cancel('alice', input);
    assert.equal(
      (await turnStatus(store, 'alice', p.id, input.requestId)).status,
      'cancelled',
    );
    const next = request(p);
    await store.begin('alice', next);
    sqlite
      .prepare('UPDATE branches SET lock_until=0 WHERE id=?')
      .run(p.activeBranchId);
    assert.equal(
      (await turnStatus(store, 'alice', p.id, next.requestId)).status,
      'expired',
    );
    const completed = request(p);
    const mock = provider(null);
    await run(store, completed, mock.fetcher);
    const calls = mock.calls.length;
    const status = await turnStatus(store, 'alice', p.id, completed.requestId);
    assert.equal(status.status, 'completed');
    assert.equal(status.result?.model, null);
    assert.equal(mock.calls.length, calls);
  } finally {
    sqlite.close();
  }
});

void test('durable jobs survive runner recreation and deduplicate provider execution', async () => {
  const { store, sqlite } = fixture();
  try {
    const { BackgroundJob } = await import('../lib/projects/background-job');
    const values = new Map<string, any>();
    let alarm = 0;
    const storage: any = {
      get: async (k: string) => structuredClone(values.get(k)),
      put: async (k: string, v: any) => {
        values.set(k, structuredClone(v));
      },
      setAlarm: async (n: number) => {
        alarm = n;
      },
      transaction: async (fn: any) => fn(storage),
    };
    const p = await store.create('alice', { name: 'Background' }),
      input = request(p),
      mock = provider(null);
    await new BackgroundJob(
      storage,
      store,
      'offline',
      'mock',
      mock.fetcher,
    ).enqueue('alice', input);
    assert.ok(alarm > 0);
    assert.equal(
      (
        await new BackgroundJob(
          storage,
          store,
          'offline',
          'mock',
          mock.fetcher,
        ).status('alice', p.id)
      ).phase,
      'queued',
    );
    await assert.rejects(
      new BackgroundJob(
        storage,
        store,
        'offline',
        'mock',
        mock.fetcher,
      ).enqueue('alice', { ...input, message: 'Changed' }),
      /already used/,
    );
    const restarted = new BackgroundJob(
      storage,
      store,
      'offline',
      'mock',
      mock.fetcher,
    );
    await restarted.alarm();
    const count = mock.calls.length;
    await restarted.alarm();
    await restarted.enqueue('alice', input);
    assert.equal(mock.calls.length, count);
    assert.equal((await restarted.status('alice', p.id)).status, 'completed');
    await assert.rejects(restarted.status('bob', p.id));
    values.set('job', { ...values.get('job'), state: 'running' });
    await new BackgroundJob(
      storage,
      store,
      'offline',
      'mock',
      mock.fetcher,
    ).alarm();
    assert.equal(mock.calls.length, count);
  } finally {
    sqlite.close();
  }
});
void test('interrupted and cancelled jobs never automatically repeat a paid request', async () => {
  const { store, sqlite } = fixture();
  try {
    const { BackgroundJob } = await import('../lib/projects/background-job');
    const values = new Map<string, any>(),
      storage: any = {
        get: async (k: string) => values.get(k),
        put: async (k: string, v: any) => {
          values.set(k, v);
        },
        setAlarm: async () => {},
        transaction: async (fn: any) => fn(storage),
      };
    const p = await store.create('alice', { name: 'Interrupted' }),
      input = request(p);
    await store.begin('alice', input);
    values.set('job', { owner: 'alice', input, state: 'running' });
    let calls = 0;
    const noCalls = (async () => {
      calls++;
      throw Error('Unexpected provider call');
    }) as typeof fetch;
    const job = new BackgroundJob(storage, store, 'offline', 'mock', noCalls);
    await job.alarm();
    assert.equal(calls, 0);
    assert.equal((await job.status('alice', p.id)).status, 'failed');
    values.clear();
    const cancelled = request(p);
    await store.cancel('alice', cancelled);
    await job.enqueue('alice', cancelled);
    await job.alarm();
    assert.equal(calls, 0);
    assert.equal((await job.status('alice', p.id)).status, 'cancelled');
  } finally {
    sqlite.close();
  }
});
void test('revision snapshots page metadata and fetch only the requested model', async () => {
  const { store, sqlite } = fixture();
  try {
    const { projectSnapshot, revisionPage, getRevision } =
      await import('../lib/projects/revisions');
    const p = await store.create('alice', { name: 'Long history' });
    let parent = p.selectedRevisionId;
    for (let i = 1; i <= 85; i++) {
      const id = crypto.randomUUID();
      sqlite
        .prepare(
          'INSERT INTO revisions (id,project_id,branch_id,parent_id,ordinal,model_json,prompt,answer,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
        )
        .run(
          id,
          p.id,
          p.activeBranchId,
          parent,
          i,
          JSON.stringify(p.revisions[0].model),
          'Edit ' + i,
          'Saved',
          new Date().toISOString(),
        );
      parent = id;
    }
    sqlite
      .prepare('UPDATE branches SET head_revision_id=? WHERE id=?')
      .run(parent, p.activeBranchId);
    const snapshot = await projectSnapshot(store, 'alice', p.id, {
      branchId: p.activeBranchId,
    });
    assert.equal(snapshot.revisions.length, 1);
    assert.equal(snapshot.revisions[0].id, parent);
    assert.equal(snapshot.revisionIndex?.length, 40);
    assert.ok(snapshot.revisionIndex?.every((r) => !('model' in r)));
    const page = await revisionPage(
      store,
      'alice',
      p.id,
      snapshot.revisionCursor!,
    );
    assert.equal(page.revisionIndex.length, 40);
    assert.equal(
      new Set(
        [...page.revisionIndex, ...snapshot.revisionIndex!].map((r) => r.id),
      ).size,
      80,
    );
    assert.equal(
      (await getRevision(store, 'alice', p.id, p.selectedRevisionId)).ordinal,
      0,
    );
    await assert.rejects(getRevision(store, 'bob', p.id, parent));
    await assert.rejects(revisionPage(store, 'alice', p.id, -1));
  } finally {
    sqlite.close();
  }
});
void test('feature colors and links pass through proposals, acceptance and locked dependent edits', async () => {
  const { store, sqlite } = fixture();
  try {
    const { editProperties } =
      await import('../lib/projects/feature-properties');
    let p = await store.create('alice', { name: 'Linked features' });
    const model = p.revisions[0].model,
      source = model.operations[0].id!,
      target = model.operations[2].id!;
    p = await editProperties(store, 'alice', p.id, {
      branchId: p.activeBranchId,
      revisionId: p.selectedRevisionId,
      featureId: target,
      color: '#ff0000',
      relationships: [
        {
          target: { featureId: target, field: 'size', axis: 1 },
          source: { featureId: source, field: 'size', axis: 1 },
          factor: 1,
          offset: -4,
        },
      ],
    });
    const proposal = p.proposals.find((q) => q.status === 'pending')!;
    assert.equal(proposal.model.operations[2].color, '#ff0000');
    assert.equal(proposal.model.operations[2].size[1], 76);
    p = await reviewProposal(store, 'alice', p.id, proposal.id, 'accept');
    const saved = p.revisions.find((r) => r.id === p.selectedRevisionId)!.model;
    assert.equal(saved.relationships?.length, 1);
    p = await setDimensionLock(store, 'alice', p.id, {
      revisionId: p.selectedRevisionId,
      featureId: target,
      axis: 1,
      locked: true,
    });
    const edited = structuredClone(saved);
    edited.operations[0].size[1] = 90;
    await assert.rejects(
      run(store, request(p), provider(edited).fetcher),
      /locked/,
    );
    await assert.rejects(
      editFeature(store, 'alice', p.id, {
        branchId: p.activeBranchId,
        revisionId: p.selectedRevisionId,
        featureId: target,
        size: [3, 75, 23],
        position: saved.operations[2].position,
      }),
      /dimension link/,
    );
  } finally {
    sqlite.close();
  }
});

import {
  invite,
  join,
  team,
  removeMember,
  revokeInvite,
} from '../lib/projects/team';
import { prepareMerge } from '../lib/projects/merge';
import { mergeModels } from '../lib/cad/merge';
void test('team invitations enforce roles, private access, expiry, single use and revocation', async () => {
  const { store, sqlite } = fixture();
  try {
    const p = await store.create('alice', { name: 'Team' });
    await assert.rejects(store.detail('bob', p.id), /not found/);
    const invitation = await invite(store, 'alice', p.id, 'editor');
    assert.equal((await join(store, 'bob', invitation.token)).projectId, p.id);
    await join(store, 'bob', invitation.token); // idempotent redemption
    await assert.rejects(
      join(store, 'carol', invitation.token),
      /already used/,
    );
    assert.equal((await store.list('bob'))[0].role, 'editor');
    assert.equal((await store.detail('bob', p.id)).branches[0].canEdit, false);
    await assert.rejects(
      store.begin('bob', request(p)),
      /own contributor branch/,
    );
    await assert.rejects(store.update('bob', p.id, { name: 'Bad' }), /role/);
    await assert.rejects(store.archive('bob', p.id, true), /role/);
    await assert.rejects(store.setApprovalMode('bob', p.id, 'auto'), /role/);
    await assert.rejects(
      createShare(store, 'bob', p.id, p.selectedRevisionId, true),
      /role/,
    );
    await assert.rejects(invite(store, 'bob', p.id, 'editor'), /role/);
    const vi = await invite(store, 'alice', p.id, 'viewer');
    await join(store, 'carol', vi.token);
    assert.equal((await store.detail('carol', p.id)).role, 'viewer');
    await assert.rejects(
      store.fork('carol', p.id, p.activeBranchId, p.selectedRevisionId),
      /role/,
    );
    await assert.rejects(
      editFeature(store, 'carol', p.id, {
        branchId: p.activeBranchId,
        revisionId: p.selectedRevisionId,
        featureId: p.revisions[0].model.operations[2].id!,
        size: [6, 54, 19],
        position: [0, 0, 12.5],
      }),
      /role/,
    );
    await assert.rejects(
      setDimensionLock(store, 'carol', p.id, {
        revisionId: p.selectedRevisionId,
        featureId: p.revisions[0].model.operations[2].id!,
        axis: 0,
        locked: true,
      }),
      /role/,
    );
    const exp = await invite(store, 'alice', p.id, 'editor');
    await store
      .stmt('UPDATE project_invitations SET expires_at=0 WHERE id=?', exp.id)
      .run();
    await assert.rejects(join(store, 'eve', exp.token), /expired/);
    const revoked = await invite(store, 'alice', p.id, 'editor');
    await revokeInvite(store, 'alice', p.id, revoked.id);
    await assert.rejects(join(store, 'eve', revoked.token), /revoked/);
    await removeMember(store, 'alice', p.id, 'bob');
    await assert.rejects(store.detail('bob', p.id), /not found/);
    await assert.rejects(join(store, 'bob', invitation.token), /revoked/);
    assert.equal((await team(store, 'alice', p.id)).members.length, 2);
  } finally {
    sqlite.close();
  }
});
void test('contributors edit their own branches and owner merges with attribution and both histories', async () => {
  const { store, sqlite } = fixture();
  try {
    let p = await store.create('alice', { name: 'Merge' });
    const main = p.activeBranchId,
      baseId = p.selectedRevisionId;
    await join(
      store,
      'bob',
      (await invite(store, 'alice', p.id, 'editor')).token,
    );
    let branch = await store.fork('bob', p.id, main, baseId);
    const branchId = branch.activeBranchId;
    assert.equal(
      branch.branches.find((b) => b.id === branchId)?.createdBy,
      'bob',
    );
    assert.equal(branch.branches.find((b) => b.id === branchId)?.canEdit, true);
    const change = structuredClone(p.revisions[0].model);
    change.operations[2].color = '#ff0000';
    const response = await runTurn(
      store,
      'bob',
      request(branch),
      'mock',
      'mock',
      new AbortController().signal,
      provider(change).fetcher,
    );
    branch = await reviewProposal(
      store,
      'bob',
      p.id,
      response.proposalId!,
      'accept',
    );
    assert.equal(branch.revisions.at(-1)?.authorId, 'bob');
    await assert.rejects(
      prepareMerge(store, 'bob', p.id, {
        sourceBranchId: branchId,
        targetBranchId: main,
      }),
      /own contributor branch/,
    );
    const preview = await prepareMerge(store, 'alice', p.id, {
      sourceBranchId: branchId,
      targetBranchId: main,
      preview: true,
    });
    assert.equal(preview.conflicts.length, 0);
    const ready = await prepareMerge(store, 'alice', p.id, {
      sourceBranchId: branchId,
      targetBranchId: main,
      ...preview,
    });
    assert.equal('ready' in ready && ready.ready, true);
    p = await store.detail('alice', p.id, { branchId: main });
    assert.equal(p.selectedRevisionId, baseId);
    p = await reviewProposal(
      store,
      'alice',
      p.id,
      p.proposals.find((x) => x.status === 'pending')!.id,
      'accept',
    );
    const merged = p.revisions.find((r) => r.id === p.selectedRevisionId)!;
    assert.equal(merged.parentId, baseId);
    assert.equal(merged.mergeParentId, branch.selectedRevisionId);
    assert.equal(merged.model.operations[2].color, '#ff0000');
    await assert.rejects(
      prepareMerge(store, 'alice', p.id, {
        sourceBranchId: branchId,
        targetBranchId: main,
      }),
      /already included/,
    );
  } finally {
    sqlite.close();
  }
});
void test('three-way merge combines independent parameters and requires choices for conflicts', () => {
  const base = upgradeModel(sample),
    target = structuredClone(base),
    source = structuredClone(base);
  target.operations[2].color = '#ffffff';
  source.operations[2].size[0] = 5;
  const clean = mergeModels(base, target, source);
  assert.equal(clean.conflicts.length, 0);
  assert.equal(clean.model.operations[2].color, '#ffffff');
  assert.equal(clean.model.operations[2].size[0], 5);
  target.operations[2].size[0] = 7;
  const conflict = mergeModels(base, target, source);
  assert.equal(conflict.conflicts.length, 1);
  const choice = mergeModels(base, target, source, {
    [conflict.conflicts[0].path]: 'source',
  });
  assert.equal(choice.conflicts.length, 0);
  assert.equal(choice.model.operations[2].size[0], 5);
  source.operations.splice(2, 1);
  assert.ok(mergeModels(base, target, source).conflicts.length);
});
void test('revoking a contributor blocks queued work and prevents in-flight saves', async () => {
  const { store, sqlite } = fixture();
  try {
    const p = await store.create('alice', { name: 'Revoked' });
    await join(
      store,
      'bob',
      (await invite(store, 'alice', p.id, 'editor')).token,
    );
    const branch = await store.fork(
        'bob',
        p.id,
        p.activeBranchId,
        p.selectedRevisionId,
      ),
      input = request(branch);
    await store.begin('bob', input);
    await removeMember(store, 'alice', p.id, 'bob');
    await assert.rejects(
      saveProposal(
        store,
        input,
        {
          model: branch.revisions[0].model,
          message: 'Late result',
          revisionId: input.revisionId,
          branchId: input.branchId,
          proposalId: crypto.randomUUID(),
        },
        { added: 0, removed: 0, unchanged: 1 },
      ),
      /cancelled or superseded/,
    );
    const mock = provider(null);
    await assert.rejects(
      runTurn(
        store,
        'bob',
        { ...input, requestId: crypto.randomUUID() },
        'mock',
        'mock',
        new AbortController().signal,
        mock.fetcher,
      ),
      /not found/,
    );
    assert.equal(mock.calls.length, 0);
    assert.equal(
      (await store.detail('alice', p.id, { branchId: input.branchId }))
        .proposals.length,
      0,
    );
  } finally {
    sqlite.close();
  }
});

void test('personal AI keys are encrypted, isolated, replaceable and resolved for each owner', async () => {
 const {saveCredential,readCredential,hasCredential}=await import('../lib/projects/ai-credentials');
 const {store,sqlite}=fixture();
 const secret='offline-vault-secret-32-characters-long';
 const key='sk-offline-fixture-key-not-a-real-key';
 try {
  await assert.rejects(saveCredential(store,'alice',key,''));
  await saveCredential(store,'alice',key,secret);
  assert.equal(await hasCredential(store,'alice'),true);
  assert.equal(await hasCredential(store,'bob'),false);
  assert.equal(await readCredential(store,'alice',secret),key);
  assert.equal(await readCredential(store,'bob',secret,'fallback'),'fallback');
  const row=await store.stmt('SELECT encrypted_key FROM ai_credentials WHERE owner_id=?','alice').first<{encrypted_key:string}>();
  assert.ok(!row!.encrypted_key.includes(key));
  await assert.rejects(readCredential(store,'alice','wrong-secret-with-at-least-32-characters'));
  await store.stmt('INSERT INTO ai_credentials(owner_id,encrypted_key) VALUES (?,?)','bob',row!.encrypted_key).run();
  await assert.rejects(readCredential(store,'bob',secret));
  await saveCredential(store,'alice',key+'-replacement',secret);
  assert.equal(await readCredential(store,'alice',secret),key+'-replacement');
 }finally{sqlite.close();}
});
