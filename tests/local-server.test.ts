import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../lib/server/sqlite';
import { Accounts, readCookie } from '../lib/server/auth';
import { JobRunner } from '../lib/server/jobs';
import { ProjectStore } from '../lib/projects/store';
import { runTurn } from '../lib/projects/service';
import {
  SERVER_OWNER,
  chargeSharedUsage,
  connectionSummary,
  envConnection,
  resolveConnection,
  saveConnection,
  setSharingPolicy,
} from '../lib/projects/ai-credentials';
import { relaxSchema, requestStructured } from '../lib/ai-providers';
import { sample, upgradeModel } from '../lib/cad/model';
import type { ProjectDetail } from '../lib/projects/types';

const secret = 'offline-vault-secret-32-characters-long';
const fixture = () => {
  const db = openDatabase(':memory:', 'drizzle');
  return { db, store: new ProjectStore(db), accounts: new Accounts(db) };
};
const turn = (p: ProjectDetail, message = 'Please revise the part.') => ({
  projectId: p.id,
  branchId: p.activeBranchId,
  revisionId: p.selectedRevisionId,
  requestId: crypto.randomUUID(),
  message,
});
const reply = (model: unknown = upgradeModel(sample)) =>
  JSON.stringify({ message: 'Saved answer.', model, edits: null });

/** An OpenAI-protocol mock recording every call; no network access. */
function openaiMock() {
  const calls: string[] = [];
  const fetcher = (async (url: unknown) => {
    calls.push(String(url));
    return String(url).endsWith('/conversations')
      ? Response.json({ id: 'conv_offline' })
      : Response.json({
          status: 'completed',
          output: [{ content: [{ type: 'output_text', text: reply() }] }],
        });
  }) as typeof fetch;
  return { calls, fetcher };
}

void test('SQLite adapter runs migrations once, reports changes and rolls back failed batches', async () => {
  const { db, store } = fixture();
  try {
    const applied = db.sqlite
      .prepare('SELECT COUNT(*) AS n FROM d1_migrations')
      .get() as { n: number };
    const { migrate } = await import('../lib/server/sqlite');
    migrate(db.sqlite, 'drizzle');
    assert.equal(
      (
        db.sqlite.prepare('SELECT COUNT(*) AS n FROM d1_migrations').get() as {
          n: number;
        }
      ).n,
      applied.n,
    );
    await store
      .stmt("INSERT INTO server_settings(key,value) VALUES ('a','1')")
      .run();
    const updated = await store
      .stmt(
        "UPDATE server_settings SET value='2' WHERE key='a' RETURNING value",
      )
      .run();
    assert.equal(updated.meta.changes, 1);
    await assert.rejects(
      db.batch([
        store.stmt("INSERT INTO server_settings(key,value) VALUES ('b','1')"),
        store.stmt("INSERT INTO server_settings(key,value) VALUES ('a','dup')"),
      ]),
    );
    assert.equal(
      await store.stmt("SELECT * FROM server_settings WHERE key='b'").first(),
      null,
    );
  } finally {
    db.close();
  }
});

void test('first account becomes admin and keeps projects from the earlier single local identity', async () => {
  const { db, store, accounts } = fixture();
  try {
    const legacy = await store.create('local_seedy', {
      name: 'Before accounts',
    });
    const admin = await accounts.setup({
      username: 'Owner',
      password: 'correct horse',
    });
    assert.equal(admin.id, 'local_seedy');
    assert.equal(admin.role, 'admin');
    assert.equal(admin.username, 'owner');
    assert.equal((await store.list(admin.id))[0].id, legacy.id);
    await assert.rejects(
      accounts.setup({ username: 'again', password: 'password1' }),
      /already been set up/,
    );
  } finally {
    db.close();
  }
});

void test('sign-in, sessions, disabling, password resets and join codes protect accounts', async () => {
  const { db, accounts } = fixture();
  try {
    await accounts.setup({ username: 'admin', password: 'admin-password' });
    const member = await accounts.create(
      { username: 'sam', password: 'temporary1' },
      { mustChangePassword: true },
    );
    await assert.rejects(
      accounts.create({ username: 'SAM', password: 'whatever1' }),
      /taken/,
    );
    await assert.rejects(
      accounts.create({ username: 'x', password: 'whatever1' }),
      /2–32/,
    );
    await assert.rejects(
      accounts.create({ username: 'kim', password: 'short' }),
      /8 characters/,
    );
    await assert.rejects(accounts.login('sam', 'wrong-password'), /incorrect/);
    await assert.rejects(
      accounts.login('nobody', 'wrong-password'),
      /incorrect/,
    );
    const user = await accounts.login(' Sam ', 'temporary1');
    assert.equal(user.mustChangePassword, true);
    const { token } = await accounts.createSession(member.id);
    assert.equal((await accounts.sessionUser(token))?.id, member.id);
    assert.equal(await accounts.sessionUser('forged'), null);
    assert.equal(readCookie(`a=1; form_session=${token}`), token);

    await accounts.changePassword(member.id, 'temporary1', 'my-own-password');
    assert.equal(await accounts.sessionUser(token), null, 'other sessions end');
    assert.equal(
      (await accounts.login('sam', 'my-own-password')).mustChangePassword,
      false,
    );

    const admin = (await accounts.login('admin', 'admin-password'))!;
    const second = await accounts.createSession(member.id);
    await accounts.update(admin, { userId: member.id, disabled: true });
    assert.equal(await accounts.sessionUser(second.token), null);
    await assert.rejects(accounts.login('sam', 'my-own-password'), /disabled/);
    await assert.rejects(
      accounts.update(admin, { userId: admin.id, disabled: true }),
      /own account/,
    );

    await assert.rejects(
      accounts.signup({ username: 'kim', password: 'password1', code: '' }),
      /join code/,
    );
    const code = (await accounts.setJoinCode(true))!;
    await assert.rejects(
      accounts.signup({
        username: 'kim',
        password: 'password1',
        code: 'wrong',
      }),
      /join code/,
    );
    assert.equal(
      (await accounts.signup({ username: 'kim', password: 'password1', code }))
        .role,
      'member',
    );
    await accounts.setJoinCode(false);
    await assert.rejects(
      accounts.signup({ username: 'lee', password: 'password1', code }),
      /join code/,
    );
  } finally {
    db.close();
  }
});

void test('AI connections are encrypted per person; personal keys win over the shared limited key', async () => {
  const { db, store } = fixture();
  const key = 'sk-ant-offline-fixture-key-not-real';
  try {
    assert.equal(await resolveConnection(store, 'alice', secret), null);
    await saveConnection(
      store,
      SERVER_OWNER,
      { provider: 'openai', key: 'sk-offline-server-key-0000' },
      secret,
      true,
    );
    const shared = (await resolveConnection(store, 'alice', secret))!;
    assert.equal(shared.source, 'server');
    assert.equal(shared.model, 'gpt-6-astra');

    await saveConnection(
      store,
      'alice',
      { provider: 'anthropic', key },
      secret,
      false,
    );
    const personal = (await resolveConnection(store, 'alice', secret))!;
    assert.deepEqual(
      {
        source: personal.source,
        provider: personal.provider,
        model: personal.model,
        key: personal.key,
      },
      {
        source: 'personal',
        provider: 'anthropic',
        model: 'claude-opus-5-5',
        key,
      },
    );
    const row = await store
      .stmt("SELECT encrypted_key FROM ai_connections WHERE owner_id='alice'")
      .first<{ encrypted_key: string }>();
    assert.ok(!row!.encrypted_key.includes(key));
    await assert.rejects(
      resolveConnection(
        store,
        'alice',
        'wrong-secret-with-at-least-32-characters',
      ),
    );
    // A sealed key copied to another owner cannot be opened.
    await store
      .stmt(
        "INSERT INTO ai_connections(owner_id,provider,model,encrypted_key,updated_at) VALUES ('bob','anthropic','',?,'')",
        row!.encrypted_key,
      )
      .run();
    await assert.rejects(resolveConnection(store, 'bob', secret));

    // Keeping the saved key while changing the model; summaries never expose keys.
    await saveConnection(
      store,
      'alice',
      { provider: 'anthropic', model: 'claude-sonnet-5-5' },
      secret,
      false,
    );
    assert.deepEqual(await connectionSummary(store, 'alice'), {
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
      baseUrl: null,
      hasKey: true,
    });
    await assert.rejects(
      saveConnection(
        store,
        'carol',
        { provider: 'gemini', key: 'gemini-offline-key' },
        secret,
        false,
      ),
      /model name/,
    );
    await assert.rejects(
      saveConnection(
        store,
        'carol',
        { provider: 'openai', key: 'not-an-openai-key' },
        secret,
        false,
      ),
      /OpenAI/,
    );
    await assert.rejects(
      saveConnection(
        store,
        'carol',
        { provider: 'compatible', model: 'm', baseUrl: 'http://10.0.0.5/v1' },
        secret,
        false,
      ),
      /administrator/,
    );
    await saveConnection(
      store,
      'carol',
      { provider: 'ollama', model: 'local-model' },
      secret,
      false,
    );
    assert.equal(
      (await resolveConnection(store, 'carol', secret))?.provider,
      'ollama',
    );

    await setSharingPolicy(store, { shared: false });
    await store
      .stmt("DELETE FROM ai_connections WHERE owner_id IN ('bob','carol')")
      .run();
    assert.equal(await resolveConnection(store, 'dana', secret), null);

    await setSharingPolicy(store, { shared: true, dailyLimit: 2 });
    await chargeSharedUsage(store, 'dana', 2);
    await chargeSharedUsage(store, 'dana', 2);
    await assert.rejects(chargeSharedUsage(store, 'dana', 2), /today’s limit/);
    await chargeSharedUsage(store, 'erin', 2);
    await assert.rejects(chargeSharedUsage(store, 'fay', 0), /today’s limit/);
  } finally {
    db.close();
  }
});

void test('environment connections support the earlier OpenAI variables and other providers', () => {
  assert.equal(envConnection({}), null);
  assert.deepEqual(
    envConnection({ OPENAI_API_KEY: 'sk-env', OPENAI_MODEL: 'm1' }),
    {
      provider: 'openai',
      model: 'm1',
      key: 'sk-env',
    },
  );
  assert.equal(
    envConnection({ ANTHROPIC_API_KEY: 'sk-ant-env' })?.model,
    'claude-opus-5-5',
  );
  assert.equal(
    envConnection({ AI_PROVIDER: 'gemini', AI_API_KEY: 'k' }),
    null,
    'model required',
  );
  assert.equal(
    envConnection({ AI_PROVIDER: 'compatible', AI_MODEL: 'm' }),
    null,
    'endpoint required',
  );
  assert.deepEqual(
    envConnection({
      AI_PROVIDER: 'compatible',
      AI_MODEL: 'm',
      AI_BASE_URL: 'http://gpu:8000/v1',
    }),
    {
      provider: 'compatible',
      model: 'm',
      key: '',
      baseUrl: 'http://gpu:8000/v1',
    },
  );
});

void test('Anthropic requests use structured output, server fallbacks and no automatic retries', async () => {
  type Sent = { url: string; body: Body; headers: Headers };
  type Body = {
    fallbacks?: unknown;
    system?: string;
    output_config: {
      format: {
        type: string;
        schema: { properties: { n: { minimum?: number } } };
      };
    };
  };
  const sent: Sent[] = [];
  let status = 200;
  const fetcher = (async (url: unknown, init: RequestInit) => {
    sent.push({
      url: String(url),
      body: JSON.parse(init.body as string) as Body,
      headers: new Headers(init.headers),
    });
    if (status !== 200)
      return Response.json(
        { type: 'error', error: { type: 'api_error', message: 'x' } },
        { status },
      );
    return Response.json({
      id: 'msg_offline',
      type: 'message',
      role: 'assistant',
      model: 'claude-opus-5-5',
      content: [
        { type: 'thinking', thinking: '', signature: 's' },
        { type: 'text', text: '{"ok":true}' },
      ],
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1 },
    });
  }) as typeof fetch;
  const ai = {
    provider: 'anthropic' as const,
    model: 'claude-opus-5-5',
    key: 'sk-ant-offline',
  };
  const schema = {
    type: 'object',
    properties: { n: { type: 'integer', minimum: 0 } },
  };
  const text = await requestStructured(
    ai,
    {
      instructions: 'Be brief.',
      input: [{ role: 'user', content: 'Hi' }],
      schema,
    },
    undefined,
    fetcher,
  );
  assert.equal(text, '{"ok":true}');
  assert.match(sent[0].url, /^https:\/\/api\.anthropic\.com\/v1\/messages/);
  const auth =
    sent[0].headers.get('x-api-key') ?? sent[0].headers.get('authorization');
  assert.match(auth ?? '', /sk-ant-offline$/);
  assert.match(
    sent[0].headers.get('anthropic-beta') ?? '',
    /server-side-fallback-2026-07-01/,
  );
  assert.equal(sent[0].body.fallbacks, 'default');
  assert.equal(sent[0].body.system, 'Be brief.');
  assert.equal(sent[0].body.output_config.format.type, 'json_schema');
  assert.equal(
    sent[0].body.output_config.format.schema.properties.n.minimum,
    undefined,
  );
  status = 500;
  await assert.rejects(
    requestStructured(
      ai,
      { instructions: '', input: [{ role: 'user', content: 'Hi' }], schema },
      undefined,
      fetcher,
    ),
    /could not complete the request \(500\)/,
  );
  assert.equal(sent.length, 2, 'a failed paid request is not retried');
  status = 401;
  await assert.rejects(
    requestStructured(
      { ...ai, model: 'claude-haiku-5-5' },
      { instructions: '', input: [{ role: 'user', content: 'Hi' }], schema },
      undefined,
      fetcher,
    ),
    /key was rejected/,
  );
  assert.equal(
    sent[2].body.fallbacks,
    undefined,
    'fallbacks only on supported models',
  );
});

void test('OpenAI-compatible providers use chat completions with a relaxed schema', async () => {
  type ChatBody = {
    messages: unknown[];
    response_format: { json_schema: { schema: { maxItems?: number } } };
  };
  let sent: { url: string; body: ChatBody; auth: string | null } | null = null;
  let content: string | null = '```json\n{"ok":1}\n```';
  const fetcher = (async (url: unknown, init: RequestInit) => {
    sent = {
      url: String(url),
      body: JSON.parse(init.body as string) as ChatBody,
      auth: new Headers(init.headers).get('authorization'),
    };
    return Response.json({
      choices: [{ finish_reason: 'stop', message: { content } }],
    });
  }) as typeof fetch;
  const req = {
    instructions: 'System text',
    input: [{ role: 'user' as const, content: 'Hi' }],
    schema: { type: 'object', maxItems: 3 },
  };
  assert.equal(
    await requestStructured(
      { provider: 'gemini', model: 'g', key: 'gk' },
      req,
      undefined,
      fetcher,
    ),
    '{"ok":1}',
  );
  assert.equal(
    sent!.url,
    'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  );
  assert.equal(sent!.auth, 'Bearer gk');
  assert.deepEqual(sent!.body.messages[0], {
    role: 'system',
    content: 'System text',
  });
  assert.equal(
    sent!.body.response_format.json_schema.schema.maxItems,
    undefined,
  );
  await requestStructured(
    { provider: 'ollama', model: 'm', key: '' },
    req,
    undefined,
    fetcher,
  );
  assert.equal(sent!.url, 'http://127.0.0.1:11434/v1/chat/completions');
  assert.equal(sent!.auth, null);
  content = null;
  await assert.rejects(
    requestStructured(
      { provider: 'ollama', model: 'm', key: '' },
      req,
      undefined,
      fetcher,
    ),
    /incomplete/,
  );
  assert.deepEqual(relaxSchema({ a: [{ pattern: 'x', type: 'string' }] }), {
    a: [{ type: 'string' }],
  });
});

void test('providers without saved conversations get recent discussion and never create one', async () => {
  const { db, store } = fixture();
  try {
    const p = await store.create('alice', { name: 'Claude part' });
    const urls: string[] = [];
    let prompt = '';
    const fetcher = (async (url: unknown, init: RequestInit) => {
      urls.push(String(url));
      prompt = (
        JSON.parse(init.body as string) as { messages: { content: string }[] }
      ).messages[0].content;
      return Response.json({
        id: 'msg',
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5-5',
        content: [{ type: 'text', text: reply() }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 1, output_tokens: 1 },
      });
    }) as typeof fetch;
    const ai = {
      provider: 'anthropic' as const,
      model: 'claude-opus-5-5',
      key: 'sk-ant-offline',
    };
    const first = await runTurn(
      store,
      'alice',
      turn(p, 'First request'),
      ai,
      '',
      AbortSignal.timeout(5000),
      fetcher,
    );
    assert.ok(first.proposalId);
    await runTurn(
      store,
      'alice',
      { ...turn(p, 'Second request'), proposalId: first.proposalId },
      ai,
      '',
      AbortSignal.timeout(5000),
      fetcher,
    );
    assert.ok(urls.every((u) => u.includes('api.anthropic.com/v1/messages')));
    assert.match(prompt, /recentDiscussion/);
    assert.match(prompt, /First request/);
    const branch = await store
      .stmt('SELECT conversation_id FROM branches WHERE id=?', p.activeBranchId)
      .first<{ conversation_id: string | null }>();
    assert.equal(branch!.conversation_id, null);
  } finally {
    db.close();
  }
});

void test('job runner executes durable jobs once and reconciles jobs interrupted by a restart', async () => {
  const { db, store } = fixture();
  try {
    await saveConnection(
      store,
      'alice',
      { provider: 'openai', key: 'sk-offline-alice-key-000' },
      secret,
      false,
    );
    const p = await store.create('alice', { name: 'Queued' });
    const mock = openaiMock();
    const runner = new JobRunner(db, secret, 2, mock.fetcher);
    const input = turn(p);
    await runner.job('alice', input.requestId).enqueue('alice', input);
    assert.ok(runner.exists('alice', input.requestId));
    assert.equal(
      (await runner.job('alice', input.requestId).status('alice', p.id)).phase,
      'queued',
    );
    await runner.tick();
    assert.equal(mock.calls.length, 0, 'alarm is not yet due');
    db.sqlite.prepare('UPDATE generation_jobs SET alarm_at=0').run();
    await runner.tick();
    assert.deepEqual(mock.calls, [
      'https://api.openai.com/v1/conversations',
      'https://api.openai.com/v1/responses',
    ]);
    const done = await runner
      .job('alice', input.requestId)
      .status('alice', p.id);
    assert.equal(done.status, 'completed');
    await runner.job('alice', input.requestId).enqueue('alice', input);
    db.sqlite.prepare('UPDATE generation_jobs SET alarm_at=0').run();
    await runner.tick();
    assert.equal(
      mock.calls.length,
      2,
      'duplicate enqueue does not call the provider again',
    );
    await assert.rejects(
      runner.job('bob', input.requestId).status('bob', p.id),
    );

    // Simulate a process that died mid-generation.
    const other = await store.create('alice', { name: 'Interrupted' });
    const stuck = turn(other, 'Interrupted');
    await store.begin('alice', stuck);
    const data = JSON.stringify({
      job: { owner: 'alice', input: stuck, state: 'running' },
    });
    db.sqlite
      .prepare(
        "INSERT INTO generation_jobs(id,data,created_at) VALUES (?,?,'')",
      )
      .run(`alice:${stuck.requestId}`, data);
    const restarted = new JobRunner(db, secret, 2, mock.fetcher);
    restarted.start();
    restarted.stop();
    await restarted.tick();
    assert.equal(
      mock.calls.length,
      2,
      'interrupted paid request is not replayed',
    );
    assert.equal(
      (await restarted.job('alice', stuck.requestId).status('alice', other.id))
        .status,
      'failed',
    );
  } finally {
    db.close();
  }
});

void test('runtime opens a data folder, creates a private secret and identifies callers by session cookie', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'form-runtime-'));
  const saved = { ...process.env };
  try {
    process.env.FORM_DATA_DIR = dir;
    process.env.FORM_SKIP_LEGACY_IMPORT = '1';
    process.env.FORM_DISABLE_JOBS = '1';
    delete process.env.AI_KEY_ENCRYPTION_SECRET;
    const { runtime } = await import('../lib/server/runtime');
    const { ownerOf, accounts } = await import('../lib/server/auth');
    const rt = runtime();
    assert.ok(rt.secret.length >= 32);
    assert.equal(rt.config.dbPath, join(dir, 'form.db'));
    await assert.rejects(
      ownerOf(new Request('http://localhost/api/projects')),
      /Sign in/,
    );
    const user = await accounts().setup({
      username: 'owner',
      password: 'owner-password',
    });
    const { token } = await accounts().createSession(user.id);
    const request = new Request('http://localhost/api/projects', {
      headers: { cookie: `form_session=${token}` },
    });
    assert.equal(await ownerOf(request), user.id);
    rt.db.close();
  } finally {
    process.env = saved;
    rmSync(dir, { recursive: true, force: true });
  }
});
