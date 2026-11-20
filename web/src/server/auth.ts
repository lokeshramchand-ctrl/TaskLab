import 'server-only';
import crypto from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { db, getSetting, setSetting } from './db';

/* Single-owner accounts. Passwords are scrypt-hashed; sessions are an HMAC-signed JWT (short
   lived) plus a random refresh token (stored hashed, rotated on every use). Browsers carry both
   in httpOnly cookies, the phone sends the access token as a Bearer header. */

const ACCESS_TTL = 15 * 60; // seconds
const REFRESH_TTL = 60 * 24 * 3600;

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

function secret(): Buffer {
  let s = getSetting('jwt_secret');
  if (!s) {
    s = crypto.randomBytes(32).toString('hex');
    setSetting('jwt_secret', s);
  }
  return Buffer.from(s, 'hex');
}

function sign(payload: Record<string, unknown>): string {
  const head = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret()).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

export function verify(token: string | undefined | null): { sub: string } | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const expect = crypto.createHmac('sha256', secret()).update(`${parts[0]}.${parts[1]}`).digest();
  let got: Buffer;
  try {
    got = Buffer.from(parts[2], 'base64url');
  } catch {
    return null;
  }
  if (got.length !== expect.length || !crypto.timingSafeEqual(got, expect)) return null;
  try {
    const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (typeof p.exp !== 'number' || p.exp < Date.now() / 1000) return null;
    return { sub: String(p.sub) };
  } catch {
    return null;
  }
}

export const hasOwner = () => !!db().prepare('SELECT 1 FROM owner WHERE id = 1').get();

export function createOwner(username: string, password: string) {
  if (hasOwner()) throw new Error('already set up');
  if (username.trim().length < 2) throw new Error('username too short');
  if (password.length < 8) throw new Error('password must be at least 8 characters');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  db().prepare('INSERT INTO owner (id, username, salt, hash, created) VALUES (1, ?, ?, ?, ?)').run(username.trim(), salt, hash, Date.now());
}

export function checkPassword(username: string, password: string): boolean {
  const row = db().prepare('SELECT username, salt, hash FROM owner WHERE id = 1').get() as { username: string; salt: string; hash: string } | undefined;
  if (!row || row.username.toLowerCase() !== username.trim().toLowerCase()) {
    crypto.scryptSync(password, 'x'.repeat(32), 64); // keep timing similar
    return false;
  }
  const h = crypto.scryptSync(password, row.salt, 64);
  return crypto.timingSafeEqual(h, Buffer.from(row.hash, 'hex'));
}

export type Tokens = { access: string; refresh: string; expiresIn: number };

export function issueTokens(username: string, device = 'web'): Tokens {
  const now = Math.floor(Date.now() / 1000);
  const access = sign({ sub: username, iat: now, exp: now + ACCESS_TTL });
  const refresh = crypto.randomBytes(32).toString('base64url');
  const d = db();
  d.prepare('DELETE FROM refresh WHERE expires < ?').run(Date.now());
  d.prepare('INSERT INTO refresh (hash, expires, device) VALUES (?, ?, ?)').run(sha(refresh), Date.now() + REFRESH_TTL * 1000, device);
  return { access, refresh, expiresIn: ACCESS_TTL };
}

/** Rotates a refresh token: the presented one stops working, a new pair is returned. */
export function rotate(refresh: string, device = 'web'): Tokens | null {
  const d = db();
  const row = d.prepare('SELECT expires FROM refresh WHERE hash = ?').get(sha(refresh)) as { expires: number } | undefined;
  if (!row || row.expires < Date.now()) return null;
  d.prepare('DELETE FROM refresh WHERE hash = ?').run(sha(refresh));
  const owner = d.prepare('SELECT username FROM owner WHERE id = 1').get() as { username: string } | undefined;
  return owner ? issueTokens(owner.username, device) : null;
}

export function revokeAll() {
  db().prepare('DELETE FROM refresh').run();
}

const COOKIE = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.LOMU_SECURE_COOKIES === '1', path: '/' };

export async function setAuthCookies(t: Tokens) {
  const c = await cookies();
  c.set('lomu_at', t.access, { ...COOKIE, maxAge: ACCESS_TTL });
  c.set('lomu_rt', t.refresh, { ...COOKIE, maxAge: REFRESH_TTL });
}

export async function clearAuthCookies() {
  const c = await cookies();
  c.delete('lomu_at');
  c.delete('lomu_rt');
}

/** True inside the Windows desktop app, which runs this server for itself on 127.0.0.1. */
export const isLocalMode = () => !!process.env.LOMU_LOCAL_TOKEN;

/**
 * Desktop app: the app shell adds a per-launch secret header to every request it makes to its own server,
 * so there is no login screen. Nothing else on the machine knows the secret.
 */
function localOwner(h: Headers): string | null {
  const want = process.env.LOMU_LOCAL_TOKEN;
  const got = h.get('x-lomu-local');
  if (!want || !got) return null;
  const a = Buffer.from(got);
  const b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (!hasOwner()) createOwner('local', crypto.randomBytes(24).toString('hex'));
  return (db().prepare('SELECT username FROM owner WHERE id = 1').get() as { username: string }).username;
}

/** Returns the signed-in owner, or null. Reads the Bearer header first, then the cookie. */
export async function currentUser(): Promise<string | null> {
  const h = await headers();
  const local = localOwner(h);
  if (local) return local;
  const bearer = h.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  const c = await cookies();
  const v = verify(bearer ?? c.get('lomu_at')?.value);
  return v?.sub ?? null;
}

/**
 * Gate for every API route. Until an owner account exists the app is open (first-run setup);
 * after that every request needs a valid session. Returns a 401 Response to send, or null.
 */
export async function gate(): Promise<Response | null> {
  if (!hasOwner()) return null;
  if (await currentUser()) return null;
  return Response.json({ error: 'unauthorized' }, { status: 401 });
}
