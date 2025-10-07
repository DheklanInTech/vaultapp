import crypto from 'crypto';
import { Buffer } from 'buffer';

const DEFAULT_ITERATIONS = 120000;

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const iterations = DEFAULT_ITERATIONS;
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex');
  return `pbkdf2$${iterations}$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, iterStr, salt, hash] = stored.split('$');
    if (scheme !== 'pbkdf2') return false;
    const iterations = parseInt(iterStr, 10) || DEFAULT_ITERATIONS;
    const test = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'));
  } catch {
    return false;
  }
}

