import type { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import crypto from 'node:crypto';
import { env } from './../common/env.js';
import { db } from '../common/db.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';

function b64urlToBuffer(input: string) {
  const pad = input.length % 4;
  const normalized = (pad ? input + '='.repeat(4 - pad) : input).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64');
}

function verifyJwt(token: string) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, sigPart] = parts;

  const data = `${headerPart}.${payloadPart}`;
  const expectedSig = crypto.createHmac('sha256', env.JWT_SECRET).update(data).digest();
  const providedSig = b64urlToBuffer(sigPart);
  if (providedSig.length !== expectedSig.length) return null;
  if (!crypto.timingSafeEqual(providedSig, expectedSig)) return null;

  const payloadJson = b64urlToBuffer(payloadPart).toString('utf8');
  try {
    const payload = JSON.parse(payloadJson) as { userId?: string; exp?: number };
    if (!payload?.userId) return null;

    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number') return null;
    if (payload.exp <= now) return null;

    return payload;
  } catch {
    return null;
  }
}

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new HTTPException(401, { message: 'Authorization header is missing or malformed' });
  }

  const token = authHeader.slice('Bearer '.length).trim();
  const payload = verifyJwt(token);
  if (!payload?.userId) {
    throw new HTTPException(401, { message: 'Invalid or expired token' });
  }

  const userData = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
      emailVerified: users.emailVerified,
    })
    .from(users)
    .where(eq(users.id, payload.userId))
    .limit(1);

  if (userData.length === 0) {
    throw new HTTPException(401, { message: 'Invalid user' });
  }

  c.set('user', userData[0]);
  await next();
}
