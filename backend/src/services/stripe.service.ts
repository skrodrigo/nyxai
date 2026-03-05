import type Stripe from 'stripe';
import { eq, and, isNull } from 'drizzle-orm';
import { stripe } from './../common/stripe.js';
import { db } from '../common/db.js';
import { env } from './../common/env.js';
import { users, subscription, userUsage } from '../db/schema.js';

function getWebUrl() {
  return env.WEB_URL.replace(/\/$/, '');
}

export type StripePlan = 'pro_monthly' | 'pro_yearly';

function getPriceIdForPlan(plan: StripePlan) {
  if (plan === 'pro_monthly') return env.STRIPE_PRICE_PRO_MONTHLY;
  if (plan === 'pro_yearly') {
    if (!env.STRIPE_PRICE_PRO_YEARLY) throw new Error('Missing STRIPE_PRICE_PRO_YEARLY');
    return env.STRIPE_PRICE_PRO_YEARLY;
  }
  throw new Error('Invalid plan');
}

export const stripeService = {
  async validatePromotionCode(code: string): Promise<
    | { valid: true; promotionCodeId: string; coupon: { id: string; name: string | null; percentOff: number | null; amountOff: number | null; currency: string | null; duration: 'once' | 'repeating' | 'forever' | null; durationInMonths: number | null } }
    | { valid: false; error: string }
  > {
    try {
      const promotionCodes = await stripe.promotionCodes.list({
        limit: 100,
      });

      const promoCode = promotionCodes.data.find(
        (p) => p.code.toUpperCase() === code.toUpperCase()
      );

      if (!promoCode) {
        return { valid: false, error: 'Promotion code not found' };
      }

      if (!promoCode.active) {
        return { valid: false, error: 'Promotion code is inactive' };
      }

      if (promoCode.expires_at && promoCode.expires_at < Math.floor(Date.now() / 1000)) {
        return { valid: false, error: 'Promotion code has expired' };
      }

      if (promoCode.max_redemptions && promoCode.times_redeemed >= promoCode.max_redemptions) {
        return { valid: false, error: 'Promotion code redemption limit reached' };
      }

      const coupon = promoCode.coupon;
      if (!coupon || !coupon.valid) {
        return { valid: false, error: 'Associated coupon is no longer valid' };
      }

      return {
        valid: true,
        promotionCodeId: promoCode.id,
        coupon: {
          id: coupon.id,
          name: coupon.name,
          percentOff: coupon.percent_off,
          amountOff: coupon.amount_off,
          currency: coupon.currency,
          duration: coupon.duration as 'once' | 'repeating' | 'forever' | null,
          durationInMonths: coupon.duration_in_months,
        },
      };
    } catch (err) {
      console.error('[stripe] Failed to validate promotion code:', err);
      return { valid: false, error: 'Failed to validate promotion code' };
    }
  },
  async getOrCreateCustomerForUser(userId: string, requestId?: string) {
    const userData = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        stripeCustomerId: users.stripeCustomerId,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (userData.length === 0) throw new Error('User not found');
    const userRow = userData[0];

    if (userRow.stripeCustomerId) {
      try {
        const existing = await stripe.customers.retrieve(userRow.stripeCustomerId);
        if (existing && !('deleted' in existing)) {
          return { customerId: userRow.stripeCustomerId };
        }
      } catch {
        await db
          .update(users)
          .set({ stripeCustomerId: null })
          .where(and(eq(users.id, userRow.id), eq(users.stripeCustomerId, userRow.stripeCustomerId)));
      }
    }

    const customer = await stripe.customers.create(
      {
        email: userRow.email,
        name: userRow.name ?? undefined,
        metadata: { userId: userRow.id },
      },
      requestId
        ? {
          idempotencyKey: `customer:${userRow.id}:${requestId}`,
        }
        : undefined,
    );

    await db
      .update(users)
      .set({ stripeCustomerId: customer.id })
      .where(eq(users.id, userRow.id));

    return { customerId: customer.id };
  },

  async getProPrices() {
    let monthly: Stripe.Price | null = null;
    try {
      monthly = await stripe.prices.retrieve(env.STRIPE_PRICE_PRO_MONTHLY);
    } catch {
      monthly = null;
    }

    const yearlyId = env.STRIPE_PRICE_PRO_YEARLY ?? null;
    let yearly: Stripe.Price | null = null;
    if (yearlyId) {
      try {
        yearly = await stripe.prices.retrieve(yearlyId);
      } catch {
        yearly = null;
      }
    }

    return {
      pro_monthly: monthly
        ? {
          id: monthly.id,
          currency: monthly.currency,
          unitAmount: monthly.unit_amount,
          recurring: monthly.recurring,
        }
        : null,
      pro_yearly: yearly
        ? {
          id: yearly.id,
          currency: yearly.currency,
          unitAmount: yearly.unit_amount,
          recurring: yearly.recurring,
        }
        : null,
    };
  },

  async createSubscriptionIntent(params: {
    userId: string
    plan: StripePlan
    requestId?: string
    promotionCodeId?: string
  }) {
    const { customerId } = await this.getOrCreateCustomerForUser(params.userId, params.requestId);
    const priceId = getPriceIdForPlan(params.plan);

    try {
      await stripe.prices.retrieve(priceId);
    } catch {
      throw new Error(`Invalid Stripe price for plan: ${params.plan} (${priceId})`);
    }

    const discounts = params.promotionCodeId ? [{ promotion_code: params.promotionCodeId }] : undefined;

    const subscription = await stripe.subscriptions.create(
      {
        customer: customerId,
        items: [{ price: priceId }],
        payment_behavior: 'default_incomplete',
        payment_settings: {
          save_default_payment_method: 'on_subscription',
        },
        discounts,
        metadata: { userId: params.userId, plan: params.plan },
        expand: ['latest_invoice.payment_intent', 'latest_invoice.confirmation_secret', 'pending_setup_intent'],
      },
      params.requestId
        ? {
          idempotencyKey: `sub_intent:${params.userId}:${params.plan}:${params.requestId}`,
        }
        : undefined,
    );

    const setupIntent =
      subscription.pending_setup_intent && typeof subscription.pending_setup_intent !== 'string'
        ? subscription.pending_setup_intent
        : null;

    if (setupIntent?.client_secret) {
      return {
        subscriptionId: subscription.id,
        intentType: 'setup' as const,
        clientSecret: setupIntent.client_secret,
      };
    }

    const latestInvoice =
      subscription.latest_invoice && typeof subscription.latest_invoice !== 'string'
        ? subscription.latest_invoice
        : null;

    const confirmationSecretRaw = (latestInvoice as any)?.confirmation_secret;
    const confirmationSecret =
      confirmationSecretRaw && typeof confirmationSecretRaw !== 'string' ? confirmationSecretRaw : null;

    if (confirmationSecret?.client_secret) {
      return {
        subscriptionId: subscription.id,
        intentType: 'payment' as const,
        clientSecret: confirmationSecret.client_secret,
      };
    }

    const paymentIntentRaw = (latestInvoice as any)?.payment_intent;
    const paymentIntent = paymentIntentRaw && typeof paymentIntentRaw !== 'string' ? paymentIntentRaw : null;

    if (!paymentIntent?.client_secret) {
      throw new Error('Missing payment intent client secret');
    }

    return {
      subscriptionId: subscription.id,
      intentType: 'payment' as const,
      clientSecret: paymentIntent.client_secret,
    };
  },

  async createSubscriptionCheckoutSession(params: { userId: string; plan: StripePlan; promotionCodeId?: string }) {
    const { customerId } = await this.getOrCreateCustomerForUser(params.userId);

    const priceId = getPriceIdForPlan(params.plan);

    try {
      await stripe.prices.retrieve(priceId);
    } catch {
      throw new Error(`Invalid Stripe price for plan: ${params.plan} (${priceId})`);
    }

    const discounts = params.promotionCodeId ? [{ promotion_code: params.promotionCodeId }] : undefined;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${getWebUrl()}/chat?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${getWebUrl()}/chat?checkout=cancel`,
      discounts,
      subscription_data: {
        metadata: { userId: params.userId, plan: params.plan },
      },
      metadata: { userId: params.userId, plan: params.plan },
    });

    if (!session.url) throw new Error('Stripe Checkout session missing url');

    return {
      id: session.id,
      url: session.url,
    };
  },

  async createBillingPortalSession(params: { userId: string }) {
    const { customerId } = await this.getOrCreateCustomerForUser(params.userId);

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${getWebUrl()}/chat`,
    });

    return { url: session.url };
  },

  async cancelSubscription(params: { userId: string }) {
    const sub = await db
      .select({ stripeSubscriptionId: subscription.stripeSubscriptionId })
      .from(subscription)
      .where(and(eq(subscription.referenceId, params.userId), eq(subscription.status, 'active')))
      .limit(1);

    if (sub.length === 0 || !sub[0].stripeSubscriptionId) return { success: true };

    const canceled = await stripe.subscriptions.cancel(sub[0].stripeSubscriptionId);
    const item = canceled.items.data?.[0];

    await db
      .update(subscription)
      .set({
        status: canceled.status,
        cancelAtPeriodEnd: canceled.cancel_at_period_end,
        periodStart:
          typeof item?.current_period_start === 'number' ? new Date(item.current_period_start * 1000) : null,
        periodEnd: typeof item?.current_period_end === 'number' ? new Date(item.current_period_end * 1000) : null,
      })
      .where(and(eq(subscription.referenceId, params.userId), eq(subscription.stripeSubscriptionId, canceled.id)));

    return { success: true };
  },

  async handleCustomerDeleted(customerId: string) {
    const userData = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.stripeCustomerId, customerId))
      .limit(1);

    await db
      .update(users)
      .set({ stripeCustomerId: null })
      .where(eq(users.stripeCustomerId, customerId));

    await db
      .delete(subscription)
      .where(eq(subscription.stripeCustomerId, customerId));

    if (userData.length > 0) {
      await db
        .delete(userUsage)
        .where(eq(userUsage.userId, userData[0].id));
    }

    return { success: true };
  },

  async upsertSubscriptionFromStripe(sub: Stripe.Subscription) {
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;

    let userId: string | null =
      typeof sub.metadata?.userId === 'string' && sub.metadata.userId ? sub.metadata.userId : null;

    if (!userId && customerId) {
      try {
        const customer = await stripe.customers.retrieve(customerId);
        if (customer && !('deleted' in customer)) {
          const fromCustomer = customer.metadata?.userId;
          if (typeof fromCustomer === 'string' && fromCustomer) {
            userId = fromCustomer;
          }

          if (userId) {
            await db
              .update(users)
              .set({ stripeCustomerId: customerId })
              .where(and(eq(users.id, userId), isNull(users.stripeCustomerId)));
          }
        }
      } catch (err) {
        console.error('[stripe] Failed to retrieve customer for subscription upsert', {
          customerId,
          subId: sub.id,
          err,
        });
      }
    }

    if (!userId) {
      console.warn('[stripe] Missing userId; skipping subscription upsert', {
        subId: sub.id,
        customerId,
        subMetadata: sub.metadata,
      });
      return;
    }

    const item = sub.items.data?.[0];
    const priceId =
      typeof item?.price === 'string'
        ? item.price
        : typeof item?.price?.id === 'string'
          ? item.price.id
          : null;

    const subscriptionData = {
      id: sub.id,
      referenceId: userId,
      stripeCustomerId: customerId ?? null,
      stripeSubscriptionId: sub.id,
      status: sub.status,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      periodStart: typeof item?.current_period_start === 'number' ? new Date(item.current_period_start * 1000) : null,
      periodEnd: typeof item?.current_period_end === 'number' ? new Date(item.current_period_end * 1000) : null,
      plan: priceId ?? 'unknown',
    };

    try {
      await db.insert(subscription).values(subscriptionData);
    } catch {
      await db
        .update(subscription)
        .set({
          referenceId: subscriptionData.referenceId,
          stripeCustomerId: subscriptionData.stripeCustomerId,
          stripeSubscriptionId: subscriptionData.stripeSubscriptionId,
          status: subscriptionData.status,
          cancelAtPeriodEnd: subscriptionData.cancelAtPeriodEnd,
          periodStart: subscriptionData.periodStart,
          periodEnd: subscriptionData.periodEnd,
          plan: subscriptionData.plan,
        })
        .where(eq(subscription.id, sub.id));
    }

    const usageData = {
      userId,
      dayCount: 0,
      weekCount: 0,
      monthCount: 0,
      dayWindowStart: new Date(),
      weekWindowStart: new Date(),
      monthWindowStart: new Date(),
    };

    try {
      await db.insert(userUsage).values(usageData);
    } catch {
      // Already exists, no update needed
    }
  },
};
