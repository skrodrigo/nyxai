import type { Context, Next } from 'hono';
import { db } from '../db/index.js';

export { db };

export function withDb(c: Context, next: Next) {
  if (!c.get('db')) {
    c.set('db', db);
  }
  return next();
}
