import { eq } from 'drizzle-orm'
import { db } from '../common/db.js'
import { users } from './../db/schema.js'
import { signJwt } from './auth.service.js'

type GoogleClaims = {
  email: string;
  name?: string | null;
  picture?: string | null;
  email_verified?: boolean | null;
};

export const authGoogleService = {
  async loginFromClaims(claims: GoogleClaims) {
    const email = claims.email;
    const name = claims.name || email;
    const image = claims.picture ?? null;
    const emailVerified = Boolean(claims.email_verified);

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    let userId: string;

    if (existing.length > 0) {
      userId = existing[0].id;
      await db
        .update(users)
        .set({ name, image, emailVerified, updatedAt: new Date() })
        .where(eq(users.id, userId));
    } else {
      const newUser = await db
        .insert(users)
        .values({
          name,
          email,
          password: `oauth:google`,
          emailVerified,
          image,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({ id: users.id })
        .then((rows) => rows[0]);
      userId = newUser.id;
    }

    const token = signJwt({ userId });
    return { token, userId };
  },
};
