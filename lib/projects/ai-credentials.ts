import type { ProjectStore } from './store';
import { HttpError } from './http';
import {
  PROVIDERS,
  isProvider,
  type AIConnection,
  type ProviderId,
} from '../ai-providers';
const enc = new TextEncoder();
export const SERVER_OWNER = '@server';

async function cipher(secret: string) {
  if (secret.length < 32)
    throw new HttpError(
      503,
      'Secure key storage is not configured on this server.',
    );
  return crypto.subtle.importKey(
    'raw',
    await crypto.subtle.digest('SHA-256', enc.encode(secret)),
    'AES-GCM',
    false,
    ['encrypt', 'decrypt'],
  );
}
async function seal(owner: string, key: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: enc.encode(owner) },
    await cipher(secret),
    enc.encode(key),
  );
  return JSON.stringify({
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(encrypted)),
  });
}
async function open(owner: string, sealed: string, secret: string) {
  try {
    const value = JSON.parse(sealed);
    const decoded = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: new Uint8Array(value.iv),
        additionalData: enc.encode(owner),
      },
      await cipher(secret),
      new Uint8Array(value.data),
    );
    return new TextDecoder().decode(decoded);
  } catch {
    throw new HttpError(
      503,
      'The saved AI connection could not be opened. Please apply the key again.',
    );
  }
}

export type ConnectionSummary = {
  provider: ProviderId;
  model: string;
  baseUrl: string | null;
  hasKey: boolean;
};
type Row = {
  provider: string;
  model: string;
  base_url: string | null;
  encrypted_key: string | null;
};
const rowOf = (store: ProjectStore, owner: string) =>
  store
    .stmt(
      'SELECT provider,model,base_url,encrypted_key FROM ai_connections WHERE owner_id=?',
      owner,
    )
    .first<Row>();

export async function connectionSummary(
  store: ProjectStore,
  owner: string,
): Promise<ConnectionSummary | null> {
  const row = await rowOf(store, owner);
  if (!row || !isProvider(row.provider)) return null;
  return {
    provider: row.provider,
    model: row.model || PROVIDERS[row.provider].defaultModel,
    baseUrl: row.base_url,
    hasKey: !!row.encrypted_key,
  };
}

function validUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, 'Enter a valid endpoint URL.');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new HttpError(
      400,
      'Use an http(s) endpoint URL without credentials.',
    );
  return url.toString().replace(/\/+$/, '');
}

/**
 * Save a connection. An empty key keeps the existing key for the same provider.
 * Custom endpoints let the server fetch arbitrary hosts, so only trusted
 * accounts may set them.
 */
export async function saveConnection(
  store: ProjectStore,
  owner: string,
  body: {
    provider?: unknown;
    model?: unknown;
    key?: unknown;
    baseUrl?: unknown;
  },
  secret: string,
  allowCustomUrl: boolean,
) {
  if (!isProvider(body.provider))
    throw new HttpError(400, 'Choose an AI provider.');
  const info = PROVIDERS[body.provider];
  const model = typeof body.model === 'string' ? body.model.trim() : '';
  if (!model && !info.defaultModel)
    throw new HttpError(400, 'Enter a model name.');
  if (model.length > 200 || /\s/.test(model))
    throw new HttpError(400, 'Enter a valid model name.');
  const key = typeof body.key === 'string' ? body.key.trim() : '';
  if (key && (key.length < 8 || key.length > 1024 || /\s/.test(key)))
    throw new HttpError(400, 'Enter a valid API key.');
  if (body.provider === 'openai' && key && !key.startsWith('sk-'))
    throw new HttpError(400, 'Enter a valid OpenAI API key.');
  let baseUrl: string | null = null;
  if (info.customUrl) {
    const raw = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : '';
    if (raw && !allowCustomUrl)
      throw new HttpError(
        403,
        'Only an administrator can set a custom endpoint on this server.',
      );
    baseUrl = raw ? validUrl(raw) : null;
    if (!baseUrl && !info.baseUrl)
      throw new HttpError(400, 'Enter the endpoint URL.');
  }
  const existing = await rowOf(store, owner);
  const sealed = key
    ? await seal(owner, key, secret)
    : existing?.provider === body.provider
      ? existing.encrypted_key
      : null;
  if (info.keyRequired && !sealed)
    throw new HttpError(400, 'Enter your API key.');
  await store
    .stmt(
      'INSERT INTO ai_connections(owner_id,provider,model,base_url,encrypted_key,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(owner_id) DO UPDATE SET provider=excluded.provider,model=excluded.model,base_url=excluded.base_url,encrypted_key=excluded.encrypted_key,updated_at=excluded.updated_at',
      owner,
      body.provider,
      model,
      baseUrl,
      sealed,
      new Date().toISOString(),
    )
    .run();
}
export async function deleteConnection(store: ProjectStore, owner: string) {
  await store.stmt('DELETE FROM ai_connections WHERE owner_id=?', owner).run();
}

async function readConnection(
  store: ProjectStore,
  owner: string,
  secret: string,
): Promise<AIConnection | null> {
  const row = await rowOf(store, owner);
  if (!row || !isProvider(row.provider)) return null;
  return {
    provider: row.provider,
    model: row.model || PROVIDERS[row.provider].defaultModel,
    key: row.encrypted_key ? await open(owner, row.encrypted_key, secret) : '',
    ...(row.base_url ? { baseUrl: row.base_url } : {}),
  };
}

/** Host connection from environment variables, if configured there. */
export function envConnection(
  env: Record<string, string | undefined> = process.env,
): AIConnection | null {
  const provider =
    env.AI_PROVIDER ||
    (env.OPENAI_API_KEY ? 'openai' : env.ANTHROPIC_API_KEY ? 'anthropic' : '');
  if (!isProvider(provider)) return null;
  const info = PROVIDERS[provider];
  const key =
    env.AI_API_KEY ||
    (provider === 'openai' && env.OPENAI_API_KEY) ||
    (provider === 'anthropic' && env.ANTHROPIC_API_KEY) ||
    '';
  const model =
    env.AI_MODEL ||
    (provider === 'openai' && env.OPENAI_MODEL) ||
    info.defaultModel;
  const baseUrl = env.AI_BASE_URL || undefined;
  if ((info.keyRequired && !key) || !model || !(baseUrl || info.baseUrl))
    return null;
  return { provider, model, key, ...(baseUrl ? { baseUrl } : {}) };
}

export type SharingPolicy = { shared: boolean; dailyLimit: number };
export async function sharingPolicy(
  store: ProjectStore,
): Promise<SharingPolicy> {
  const row = await store
    .stmt("SELECT value FROM server_settings WHERE key='ai_sharing'")
    .first<{ value: string }>();
  const saved = row ? (JSON.parse(row.value) as Partial<SharingPolicy>) : {};
  return {
    shared: saved.shared ?? true,
    dailyLimit:
      saved.dailyLimit ?? (Number(process.env.AI_SHARED_DAILY_LIMIT) || 50),
  };
}
export async function setSharingPolicy(
  store: ProjectStore,
  body: Partial<SharingPolicy>,
) {
  const current = await sharingPolicy(store);
  const limit = body.dailyLimit ?? current.dailyLimit;
  if (!Number.isInteger(limit) || limit < 0 || limit > 100000)
    throw new HttpError(400, 'Enter a daily limit between 0 and 100000.');
  const next = { shared: body.shared ?? current.shared, dailyLimit: limit };
  await store
    .stmt(
      "INSERT INTO server_settings(key,value) VALUES ('ai_sharing',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      JSON.stringify(next),
    )
    .run();
  return next;
}

/** The host connection (saved by an admin, else from the environment). */
export async function serverConnection(store: ProjectStore, secret: string) {
  return (await readConnection(store, SERVER_OWNER, secret)) ?? envConnection();
}

/** A personal connection wins; otherwise the shared host connection, if allowed. */
export async function resolveConnection(
  store: ProjectStore,
  owner: string,
  secret: string,
): Promise<AIConnection | null> {
  const personal = await readConnection(store, owner, secret);
  if (personal) return { ...personal, source: 'personal' };
  const policy = await sharingPolicy(store);
  if (!policy.shared) return null;
  const host = await serverConnection(store, secret);
  return host ? { ...host, source: 'server' } : null;
}

const today = () => new Date().toISOString().slice(0, 10);
export async function usageToday(store: ProjectStore, owner: string) {
  const row = await store
    .stmt(
      'SELECT count FROM ai_usage WHERE user_id=? AND day=?',
      owner,
      today(),
    )
    .first<{ count: number }>();
  return row?.count ?? 0;
}
/** Count one request against the shared connection's daily allowance. */
export async function chargeSharedUsage(
  store: ProjectStore,
  owner: string,
  limit: number,
) {
  const r =
    limit < 1
      ? null
      : await store
          .stmt(
            'INSERT INTO ai_usage(user_id,day,count) VALUES (?,?,1) ON CONFLICT(user_id,day) DO UPDATE SET count=count+1 WHERE count<?',
            owner,
            today(),
            limit,
          )
          .run();
  if (!r?.meta.changes)
    throw new HttpError(
      429,
      'You have reached today’s limit for the shared AI connection. Add your own API key or try again tomorrow.',
    );
}
