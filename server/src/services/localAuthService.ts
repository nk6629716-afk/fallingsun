import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { db } from '../db/database';

const deriveKey = promisify(scrypt);
const sessions = new Map<string, { userId: string; expiresAt: number }>();
const SESSION_LIFETIME_MS = 12 * 60 * 60 * 1000;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = await deriveKey(password, salt, 64) as Buffer;
  return `${salt}:${key.toString('hex')}`;
}

export async function verifyPassword(userId: string, password: string): Promise<boolean> {
  const encoded = db.getPasswordHash(userId);
  if (!encoded) return false;
  const [salt, hash] = encoded.split(':');
  const actual = await deriveKey(password, salt, 64) as Buffer;
  const expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Local prototype sessions expire, can be revoked, and require login after a server restart. */
export function issueSession(userId: string): string {
  for (const [token, session] of sessions) {
    if (session.expiresAt <= Date.now()) sessions.delete(token);
  }
  const token = `sentinel-session-${randomBytes(32).toString('hex')}`;
  sessions.set(token, { userId, expiresAt: Date.now() + SESSION_LIFETIME_MS });
  return token;
}

export function getSessionUser(token: string) {
  const session = sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  const user = db.getUserById(session.userId);
  return user?.status === 'approved' ? user : null;
}

export function revokeSession(token: string): void {
  sessions.delete(token);
}
