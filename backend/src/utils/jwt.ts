import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';
import { HttpError } from './httpError.js';

export type Role = 'customer' | 'rider' | 'admin';

export interface TokenPayload {
  sub: string;
  role: Role;
}

export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
    issuer: 'amit-ride',
  });
}

export function verifyAccessToken(token: string): TokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { issuer: 'amit-ride' });
    if (typeof decoded === 'string' || !decoded.sub || !decoded.role) {
      throw new Error('Malformed token');
    }
    return { sub: String(decoded.sub), role: decoded.role as Role };
  } catch {
    throw HttpError.unauthorized('Session expired or invalid. Please sign in again.');
  }
}
