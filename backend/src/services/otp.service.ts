import crypto from 'node:crypto'
import { eq, and, isNull, desc } from 'drizzle-orm'
import { db } from '../common/db.js'
import { HTTPException } from 'hono/http-exception'
import { emailOtp } from '../db/schema.js'

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

function randomCode() {
  return (Math.floor(100000 + Math.random() * 900000)).toString();
}

function hashOtp(email: string, code: string) {
  return crypto.createHash('sha256').update(`${email}:${code}`).digest('hex');
}

export const otpService = {
  async issue(email: string) {
    const code = randomCode();
    const otpHash = hashOtp(email, code);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await db.insert(emailOtp).values({
      email,
      otpHash,
      expiresAt,
      createdAt: new Date(),
    });

    return { code, expiresAt };
  },

  async verify(email: string, code: string) {
    const otpHash = hashOtp(email, code);

    const record = await db
      .select({
        id: emailOtp.id,
        consumedAt: emailOtp.consumedAt,
        expiresAt: emailOtp.expiresAt,
        attempts: emailOtp.attempts,
      })
      .from(emailOtp)
      .where(and(eq(emailOtp.email, email), eq(emailOtp.otpHash, otpHash)))
      .orderBy(desc(emailOtp.createdAt))
      .limit(1);

    if (record.length === 0) {
      throw new HTTPException(400, { message: 'Invalid code' });
    }

    const row = record[0];

    if (row.consumedAt) {
      throw new HTTPException(400, { message: 'Code already used' });
    }

    if (row.expiresAt.getTime() < Date.now()) {
      throw new HTTPException(400, { message: 'Code expired' });
    }

    if (row.attempts >= OTP_MAX_ATTEMPTS) {
      throw new HTTPException(429, { message: 'Too many attempts' });
    }

    await db
      .update(emailOtp)
      .set({ consumedAt: new Date() })
      .where(eq(emailOtp.id, row.id));

    return { ok: true as const };
  },

  async incrementAttempt(email: string, code: string) {
    const otpHash = hashOtp(email, code);
    const record = await db
      .select({
        id: emailOtp.id,
        attempts: emailOtp.attempts,
      })
      .from(emailOtp)
      .where(
        and(
          eq(emailOtp.email, email),
          eq(emailOtp.otpHash, otpHash),
          isNull(emailOtp.consumedAt)
        )
      )
      .orderBy(desc(emailOtp.createdAt))
      .limit(1);

    if (record.length === 0) return;

    await db
      .update(emailOtp)
      .set({ attempts: record[0].attempts + 1 })
      .where(eq(emailOtp.id, record[0].id));
  },
};
