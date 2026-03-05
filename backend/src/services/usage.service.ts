import { eq, and } from 'drizzle-orm'
import { db } from '../common/db.js'
import { startOfDay, startOfWeek, startOfMonth } from 'date-fns'
import { subscription, userUsage } from '../db/schema.js'

export const DEFAULT_LIMITS = {
  promptsDay: 50,
  promptsWeek: 250,
  promptsMonth: 1000,
};

export async function getUserUsage(userId: string) {
  const limits = DEFAULT_LIMITS;

  const [subData, usageData] = await Promise.all([
    db
      .select({ id: subscription.id })
      .from(subscription)
      .where(and(eq(subscription.referenceId, userId), eq(subscription.status, 'active')))
      .limit(1),
    db
      .select({
        dayCount: userUsage.dayCount,
        weekCount: userUsage.weekCount,
        monthCount: userUsage.monthCount,
        dayWindowStart: userUsage.dayWindowStart,
        weekWindowStart: userUsage.weekWindowStart,
        monthWindowStart: userUsage.monthWindowStart,
      })
      .from(userUsage)
      .where(eq(userUsage.userId, userId))
      .limit(1),
  ]);

  const dayCount = usageData[0]?.dayCount ?? 0;
  const weekCount = usageData[0]?.weekCount ?? 0;
  const monthCount = usageData[0]?.monthCount ?? 0;

  const limitReached =
    dayCount >= limits.promptsDay ||
    weekCount >= limits.promptsWeek ||
    monthCount >= limits.promptsMonth;

  return {
    dayCount,
    weekCount,
    monthCount,
    limits,
    limitReached,
    isSubscribed: subData.length > 0,
  };
}

export async function incrementUserUsage(userId: string) {
  const now = new Date();
  const startOfToday = startOfDay(now);
  const startOfWeekDate = startOfWeek(now);
  const startOfMonthDate = startOfMonth(now);

  const usageData = await db
    .select({
      dayCount: userUsage.dayCount,
      weekCount: userUsage.weekCount,
      monthCount: userUsage.monthCount,
      dayWindowStart: userUsage.dayWindowStart,
      weekWindowStart: userUsage.weekWindowStart,
      monthWindowStart: userUsage.monthWindowStart,
    })
    .from(userUsage)
    .where(eq(userUsage.userId, userId))
    .limit(1);

  const existing = usageData[0];

  const dayCount = existing && existing.dayWindowStart >= startOfToday ? existing.dayCount + 1 : 1;
  const weekCount = existing && existing.weekWindowStart >= startOfWeekDate ? existing.weekCount + 1 : 1;
  const monthCount = existing && existing.monthWindowStart >= startOfMonthDate ? existing.monthCount + 1 : 1;

  const upsertData = {
    userId,
    dayCount,
    weekCount,
    monthCount,
    dayWindowStart: startOfToday,
    weekWindowStart: startOfWeekDate,
    monthWindowStart: startOfMonthDate,
  };

  try {
    await db.insert(userUsage).values(upsertData);
  } catch {
    await db
      .update(userUsage)
      .set({
        dayCount: upsertData.dayCount,
        weekCount: upsertData.weekCount,
        monthCount: upsertData.monthCount,
        dayWindowStart: upsertData.dayWindowStart,
        weekWindowStart: upsertData.weekWindowStart,
        monthWindowStart: upsertData.monthWindowStart,
      })
      .where(eq(userUsage.userId, userId));
  }

  return { success: true };
}
