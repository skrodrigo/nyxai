import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { AppVariables } from './routes.js';
import { authMiddleware } from './../middlewares/auth.middleware.js';
import { eq, and } from 'drizzle-orm';
import { db } from '../common/db.js';
import { subscription } from '../db/schema.js';

const subscriptionRouter = new OpenAPIHono<{ Variables: AppVariables }>();
subscriptionRouter.use('*', authMiddleware);

const getRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Subscription'],
  responses: {
    200: { description: 'Subscription', content: { 'application/json': { schema: z.any() } } },
  },
});

const deleteIncompleteRoute = createRoute({
  method: 'delete',
  path: '/incomplete',
  tags: ['Subscription'],
  responses: {
    200: { description: 'Deleted', content: { 'application/json': { schema: z.object({ success: z.boolean() }) } } },
  },
});

subscriptionRouter.openapi(getRoute, async (c) => {
  const user = c.get('user');
  const subscriptionData = await db
    .select({
      id: subscription.id,
      status: subscription.status,
      plan: subscription.plan,
      periodStart: subscription.periodStart,
      periodEnd: subscription.periodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    })
    .from(subscription)
    .where(eq(subscription.referenceId, user!.id))
    .limit(1)
    .then((rows) => rows[0] ?? null)
  return c.json(subscriptionData, 200);
});

subscriptionRouter.openapi(deleteIncompleteRoute, async (c) => {
  const user = c.get('user');
  await db
    .delete(subscription)
    .where(and(eq(subscription.referenceId, user!.id), eq(subscription.status, 'incomplete')));
  return c.json({ success: true }, 200);
});

export default subscriptionRouter;
