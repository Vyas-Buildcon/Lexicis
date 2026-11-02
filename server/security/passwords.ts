import crypto from 'crypto';

const SCHEME = 'scrypt';
const KEY_LENGTH = 64;

export function isPasswordHash(stored: string | undefined): boolean {
  return !!stored && stored.startsWith(`${SCHEME}$`);
}

/** Returns `scrypt$<salt>$<hash>` (hex encoded). */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH);
  return `${SCHEME}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string | undefined): boolean {
  if (!stored || !isPasswordHash(stored)) return false;
  const [, saltHex, hashHex] = stored.split('$');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}
