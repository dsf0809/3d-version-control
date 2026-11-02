import {
  createHash,
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';
import { HttpError } from '../projects/http';
import type { SqlDatabase } from './sqlite';
import { runtime } from './runtime';

export const SESSION_COOKIE = 'form_session';
const SESSION_DAYS = 30;

export type User = {
  id: string;
  username: string;
  displayName: string;
  role: 'admin' | 'member';
  mustChangePassword: boolean;
};
type UserRow = {
  id: string;
  username: string;
  display_name: string;
  role: string;
  disabled: number;
  must_change_password: number;
  password_hash: string;
};
const toUser = (r: UserRow): User => ({
  id: r.id,
  username: r.username,
  displayName: r.display_name,
  role: r.role === 'admin' ? 'admin' : 'member',
  mustChangePassword: !!r.must_change_password,
});

const scryptAsync = (
  password: string,
  salt: Buffer,
  len: number,
  opts: ScryptOptions,
) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, len, opts, (e, key) =>
      e ? reject(e) : resolve(key),
    ),
  );
const COST = { N: 16384, r: 8, p: 1 };
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 32, COST);
  return `scrypt$${COST.N}$${COST.r}$${COST.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [kind, N, r, p, salt, hash] = stored.split('$');
  if (kind !== 'scrypt' || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scryptAsync(
    password,
    Buffer.from(salt, 'base64'),
    expected.length,
    {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    },
  );
  return timingSafeEqual(key, expected);
}
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

export function validateUsername(raw: unknown) {
  const username = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!/^[a-z0-9][a-z0-9._-]{1,31}$/.test(username))
    throw new HttpError(
      400,
      'Use 2–32 letters, numbers, dots, dashes or underscores for the username.',
    );
  return username;
}
export function validatePassword(raw: unknown) {
  if (typeof raw !== 'string' || raw.length < 8 || raw.length > 200)
    throw new HttpError(400, 'Use a password of at least 8 characters.');
  return raw;
}
const validateName = (raw: unknown, fallback: string) => {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (name.length > 60)
    throw new HttpError(400, 'Use a display name of up to 60 characters.');
  return name || fallback;
};

/** Account and session storage. */
export class Accounts {
  constructor(private db: SqlDatabase) {}
  private stmt(sql: string, ...args: unknown[]) {
    return this.db.prepare(sql).bind(...args);
  }
  async count() {
    return (await this.stmt('SELECT COUNT(*) AS n FROM users').first<{
      n: number;
    }>())!.n;
  }
  async byId(id: string) {
    const r = await this.stmt(
      'SELECT * FROM users WHERE id=? AND disabled=0',
      id,
    ).first<UserRow>();
    return r ? toUser(r) : null;
  }
  async create(
    body: { username?: unknown; displayName?: unknown; password?: unknown },
    opts: {
      role?: 'admin' | 'member';
      mustChangePassword?: boolean;
      id?: string;
    } = {},
  ) {
    const username = validateUsername(body.username);
    const password = validatePassword(body.password);
    const id = opts.id ?? crypto.randomUUID();
    try {
      await this.stmt(
        'INSERT INTO users(id,username,display_name,password_hash,role,must_change_password,created_at) VALUES (?,?,?,?,?,?,?)',
        id,
        username,
        validateName(body.displayName, username),
        await hashPassword(password),
        opts.role ?? 'member',
        opts.mustChangePassword ? 1 : 0,
        new Date().toISOString(),
      ).run();
    } catch (e) {
      if (String(e).includes('UNIQUE'))
        throw new HttpError(409, 'That username is already taken.');
      throw e;
    }
    return (await this.byId(id))!;
  }
  /**
   * The first account becomes the administrator. Projects created before
   * accounts existed (by the single local identity) are kept by reusing that
   * owner identifier for the administrator.
   */
  async setup(body: {
    username?: unknown;
    displayName?: unknown;
    password?: unknown;
  }) {
    if (await this.count())
      throw new HttpError(409, 'This server has already been set up.');
    const legacy = await this.stmt(
      'SELECT owner_id FROM projects GROUP BY owner_id ORDER BY COUNT(*) DESC LIMIT 1',
    ).first<{ owner_id: string }>();
    return this.create(body, { role: 'admin', id: legacy?.owner_id });
  }
  async login(username: unknown, password: unknown) {
    const name =
      typeof username === 'string' ? username.trim().toLowerCase() : '';
    const r = await this.stmt(
      'SELECT * FROM users WHERE username=?',
      name,
    ).first<UserRow>();
    // Hash even for unknown users so timing does not reveal account names.
    const ok = await verifyPassword(
      typeof password === 'string' ? password : '',
      r?.password_hash ?? (await hashPassword('unused-password')),
    );
    if (!r || !ok)
      throw new HttpError(401, 'The username or password is incorrect.');
    if (r.disabled) throw new HttpError(403, 'This account has been disabled.');
    return toUser(r);
  }
  async changePassword(userId: string, current: unknown, next: unknown) {
    const r = await this.stmt(
      'SELECT * FROM users WHERE id=?',
      userId,
    ).first<UserRow>();
    if (
      !r ||
      !(await verifyPassword(
        typeof current === 'string' ? current : '',
        r.password_hash,
      ))
    )
      throw new HttpError(400, 'Your current password is incorrect.');
    await this.setPassword(userId, next, false);
    // Sign out other devices.
    await this.stmt('DELETE FROM sessions WHERE user_id=?', userId).run();
  }
  async setPassword(userId: string, next: unknown, mustChange: boolean) {
    await this.stmt(
      'UPDATE users SET password_hash=?,must_change_password=? WHERE id=?',
      await hashPassword(validatePassword(next)),
      mustChange ? 1 : 0,
      userId,
    ).run();
  }
  async list() {
    return (
      await this.stmt(
        'SELECT id,username,display_name AS displayName,role,disabled,must_change_password AS mustChangePassword,created_at AS createdAt FROM users ORDER BY created_at',
      ).all()
    ).results;
  }
  async update(
    actor: User,
    body: {
      userId?: unknown;
      disabled?: unknown;
      role?: unknown;
      password?: unknown;
    },
  ) {
    const target = typeof body.userId === 'string' ? body.userId : '';
    const r = await this.stmt(
      'SELECT * FROM users WHERE id=?',
      target,
    ).first<UserRow>();
    if (!r) throw new HttpError(404, 'Account not found.');
    if (
      target === actor.id &&
      (body.disabled === true || body.role === 'member')
    )
      throw new HttpError(
        400,
        'You cannot disable or demote your own account.',
      );
    if (typeof body.disabled === 'boolean') {
      await this.stmt(
        'UPDATE users SET disabled=? WHERE id=?',
        body.disabled ? 1 : 0,
        target,
      ).run();
      if (body.disabled)
        await this.stmt('DELETE FROM sessions WHERE user_id=?', target).run();
    }
    if (body.role === 'admin' || body.role === 'member')
      await this.stmt(
        'UPDATE users SET role=? WHERE id=?',
        body.role,
        target,
      ).run();
    if (body.password !== undefined) {
      await this.setPassword(target, body.password, true);
      await this.stmt('DELETE FROM sessions WHERE user_id=?', target).run();
    }
  }
  async names(ids: string[]) {
    const out: Record<string, string> = {};
    for (const id of new Set(ids)) {
      const r = await this.stmt(
        'SELECT display_name,username FROM users WHERE id=?',
        id,
      ).first<{
        display_name: string;
        username: string;
      }>();
      if (r) out[id] = `${r.display_name} (@${r.username})`;
    }
    return out;
  }

  async createSession(userId: string) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + SESSION_DAYS * 86400000;
    await this.stmt(
      'INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)',
      sha256(token),
      userId,
      expiresAt,
      new Date().toISOString(),
    ).run();
    await this.stmt(
      'DELETE FROM sessions WHERE expires_at<?',
      Date.now(),
    ).run();
    return { token, expiresAt };
  }
  async sessionUser(token: string | null | undefined) {
    if (!token) return null;
    const r = await this.stmt(
      'SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.disabled=0',
      sha256(token),
      Date.now(),
    ).first<UserRow>();
    return r ? toUser(r) : null;
  }
  async endSession(token: string | null | undefined) {
    if (token)
      await this.stmt(
        'DELETE FROM sessions WHERE token_hash=?',
        sha256(token),
      ).run();
  }

  /** Self-service sign-up requires the current join code; null disables it. */
  async joinCode() {
    const r = await this.stmt(
      "SELECT value FROM server_settings WHERE key='join_code'",
    ).first<{
      value: string;
    }>();
    return r?.value || null;
  }
  async setJoinCode(enabled: boolean) {
    const code = enabled ? randomBytes(6).toString('base64url') : '';
    await this.stmt(
      "INSERT INTO server_settings(key,value) VALUES ('join_code',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      code,
    ).run();
    return code || null;
  }
  async signup(body: {
    username?: unknown;
    displayName?: unknown;
    password?: unknown;
    code?: unknown;
  }) {
    const code = await this.joinCode();
    const given = typeof body.code === 'string' ? body.code.trim() : '';
    if (
      !code ||
      given.length !== code.length ||
      !timingSafeEqual(Buffer.from(given), Buffer.from(code))
    )
      throw new HttpError(
        403,
        'The join code is not valid. Ask the server administrator for a new one.',
      );
    return this.create(body);
  }
}

export const accounts = () => new Accounts(runtime().db);

export function readCookie(
  header: string | null | undefined,
  name = SESSION_COOKIE,
) {
  for (const part of (header ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}
const isSecure = (request: Request) =>
  new URL(request.url).protocol === 'https:' ||
  (!!process.env.FORM_TRUST_PROXY &&
    request.headers.get('x-forwarded-proto') === 'https');
export function sessionCookie(
  request: Request,
  token: string,
  expiresAt: number,
) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expiresAt).toUTCString()}${isSecure(request) ? '; Secure' : ''}`;
}
export const clearedCookie = `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

export async function currentUser(request: Request) {
  return accounts().sessionUser(readCookie(request.headers.get('cookie')));
}
/** The signed-in account's identifier, used as the project owner/actor. */
export async function ownerOf(request: Request) {
  const user = await currentUser(request);
  if (!user) throw new HttpError(401, 'Sign in to access your projects.');
  return user.id;
}
export async function requireAdmin(request: Request) {
  const user = await currentUser(request);
  if (!user) throw new HttpError(401, 'Sign in to continue.');
  if (user.role !== 'admin')
    throw new HttpError(403, 'Only an administrator can do this.');
  return user;
}

/** Simple in-memory limiter for sign-in attempts per client address and name. */
const attempts = new Map<string, { n: number; until: number }>();
/** Forwarded addresses are client-controlled unless a trusted proxy sets them. */
export function clientAddress(request: Request) {
  if (!process.env.FORM_TRUST_PROXY) return 'direct';
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'direct'
  );
}
export function checkRateLimit(key: string, max = 8, windowMs = 15 * 60000) {
  const now = Date.now();
  const a = attempts.get(key);
  if (a && a.until > now && a.n >= max)
    throw new HttpError(
      429,
      'Too many attempts. Wait a few minutes and try again.',
    );
  if (!a || a.until <= now) attempts.set(key, { n: 1, until: now + windowMs });
  else a.n++;
  if (attempts.size > 10000)
    for (const [k, v] of attempts) if (v.until <= now) attempts.delete(k);
}
export const clearRateLimit = (key: string) => attempts.delete(key);
