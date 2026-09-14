import { reviewProposal } from '../lib/projects/proposals';
import { sample, upgradeModel } from '../lib/cad/model';
const candidate = upgradeModel(structuredClone(sample));
candidate.operations[2].size[0] = 6;
candidate.operations[2].color = '#ff0000';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Miniflare } = createRequire(require.resolve('wrangler/package.json'))(
  'miniflare',
);
import { ProjectStore } from '../lib/projects/store';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
let intercepted = 0;
const mf = new Miniflare({
  modules: [
    { type: 'ESModule', path: 'tests/fixtures/generation-worker.mjs' },
    ...readdirSync('dist/server', { recursive: true })
      .filter((f) => String(f).endsWith('.js'))
      .map((f) => ({ type: 'ESModule' as const, path: 'dist/server/' + f })),
  ],
  modulesRoot: process.cwd(),
  compatibilityDate: '2026-05-15',
  compatibilityFlags: ['nodejs_compat'],
  durableObjects: {
    GENERATION_JOBS: { className: 'GenerationJob', useSQLite: true },
  },
  d1Databases: { DB: 'offline-test' },
  bindings: {
    OPENAI_API_KEY: 'offline-fake-key',
    OPENAI_MODEL: 'offline-model',
  },
  outboundService: async (request: Request) => {
    intercepted++;
    const path = new URL(request.url).pathname;
    if (path === '/v1/conversations')
      return Response.json({ id: 'conv_offline_worker' });
    if (path === '/v1/responses')
      return Response.json({
        status: 'completed',
        output: [
          {
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({
                  message: 'Offline worker response.',
                  model: candidate,
                }),
              },
            ],
          },
        ],
      });
    return new Response('Outbound network disabled by offline test', {
      status: 403,
    });
  },
});
try {
  const db = await mf.getD1Database('DB');
  for (const file of readdirSync('drizzle')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    for (const sql of readFileSync('drizzle/' + file, 'utf8')
      .split('--> statement-breakpoint')
      .filter((s) => s.trim()))
      await db.prepare(sql).run();
  const store = new ProjectStore(db as unknown as D1Database),
    p = await store.create('offline', { name: 'Offline worker' });
  const input = {
    projectId: p.id,
    branchId: p.activeBranchId,
    revisionId: p.selectedRevisionId,
    requestId: crypto.randomUUID(),
    message: 'Offline conversation',
  };
  const call = async (path: string) => {
    const r = await mf.dispatchFetch('http://offline' + path, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    assert.equal(r.status, 200, await r.clone().text());
    return r.json() as Promise<any>;
  };
  await call('/enqueue');
  let status: any;
  for (let i = 0; i < 40; i++) {
    status = await call('/status');
    if (status.status !== 'pending') break;
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.equal(status.status, 'completed', JSON.stringify(status));
  assert.equal(status.result.message, 'Offline worker response.');
  assert.equal(intercepted, 2);
  await call('/enqueue');
  await new Promise((r) => setTimeout(r, 750));
  assert.equal(intercepted, 2);
  const accepted = await reviewProposal(
    store,
    'offline',
    p.id,
    status.result.proposalId,
    'accept',
  );
  assert.equal(accepted.revisions.at(-1)?.model.operations[2].size[0], 6);
  assert.equal(accepted.revisions.at(-1)?.model.operations[2].color, '#ff0000');
  console.log(
    JSON.stringify({
      modelProposalAccepted: true,
      productionWorkerAlarm: true,
      rpc: true,
      completed: true,
      idempotent: true,
      locallyInterceptedRequests: intercepted,
      externalNetworkRequests: 0,
    }),
  );
} finally {
  await mf.dispose();
}
