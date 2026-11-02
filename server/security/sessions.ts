/**
 * Stateless session tokens: base64url(payload) + "." + HMAC-SHA256 signature.
 * Each token carries a fingerprint of the user's password hash, so changing
 * the password invalidates every existing session.
 */
import crypto from 'crypto';
import { config } from '../config';

interface SessionPayload {
  uid: string;
  exp: number; // epoch ms
  pv: string; // password-hash fingerprint
}

const b64url = (input: Buffer | string) => Buffer.from(input).toString('base64url');

function sign(data: string): string {
  return crypto.createHmac('sha256', config.session.secret).update(data).digest('base64url');
}

export function passwordFingerprint(passwordHash: string | undefined): string {
  return crypto.createHash('sha256').update(passwordHash || '').digest('base64url').slice(0, 16);
}

export function createSessionToken(userId: string, passwordHash: string | undefined) {
  const expiresAt = Date.now() + config.session.ttlHours * 60 * 60 * 1000;
  const payload: SessionPayload = { uid: userId, exp: expiresAt, pv: passwordFingerprint(passwordHash) };
  const body = b64url(JSON.stringify(payload));
  return { token: `${body}.${sign(body)}`, expiresAt };
}

/** Returns the payload of a valid, unexpired token, otherwise null. */
export function readSessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;

  const expected = Buffer.from(sign(body));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    if (typeof payload.uid !== 'string' || typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
