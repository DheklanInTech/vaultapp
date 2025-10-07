import crypto from 'crypto';
import { Buffer } from 'buffer';

const base64url = (input) => Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const base64urlJson = (obj) => base64url(JSON.stringify(obj));
const fromBase64url = (b64) => Buffer.from(b64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

const ALG = 'HS256';

export function signToken(payload, { expiresIn = 60 * 60 * 24 * 7 } = {}) {
  const header = { alg: ALG, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + expiresIn };
  const secret = process.env.JWT_SECRET || 'dev-secret-change-me';
  const msg = `${base64urlJson(header)}.${base64urlJson(body)}`;
  const sig = crypto.createHmac('sha256', secret).update(msg).digest('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${msg}.${sig}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') throw new Error('Invalid token');
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) throw new Error('Malformed token');
  const secret = process.env.JWT_SECRET || 'dev-secret-change-me';
  const expected = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  if (s !== expected) throw new Error('Bad signature');
  const payload = JSON.parse(fromBase64url(p));
  if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) throw new Error('Token expired');
  return payload;
}

