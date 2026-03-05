import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import type { User } from './../db/schema.js';
import { env } from './../common/env.js';

import authRouter from './auth.routes.js';
import chatRouter from './chat.routes.js';
import chatsRouter from './chats.routes.js';
import usageRouter from './usage.routes.js';
import subscriptionRouter from './subscription.routes.js';
import publicRouter from './public.routes.js';
import stripeRouter from './stripe.routes.js';
import stripeWebhookRouter from './stripe-webhook.routes.js';
import otpRouter from './otp.routes.js';
import jobsRouter from './jobs.routes.js';
import accountRouter from './account.routes.js';
import artifactsRouter from './artifacts.routes.js';
import imagesRouter from './images.routes.js';
import { cors } from './../common/cors.js';
import { rateLimit } from './../common/rate-limit.js';
import { HTTPException } from 'hono/http-exception';

export type AppVariables = {
  user: Omit<User, 'password'> | null;
};

const app = new OpenAPIHono<{ Variables: AppVariables }>();

const corsOrigin = env.NODE_ENV === 'production' ? env.WEB_URL : 'http://localhost:3000';
app.use('*', cors({ origin: corsOrigin }));

app.use(
  '*',
  rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS ?? 60_000,
    max: env.RATE_LIMIT_MAX ?? 120,
  })
);

app.onError((err, c) => {
  const statusCode = err instanceof HTTPException ? err.status : 500;
  const message = err instanceof HTTPException
    ? (err.message || (err as any)?.res?.message || 'Request failed')
    : (err as any)?.message || 'Internal server error';

  return c.json({ success: false, error: message, statusCode }, statusCode);
});

app.get('/', (c) => c.json({ message: 'pumkin API up and running!' }));

app.route('/api/auth', authRouter);
app.route('/api/chat', chatRouter);
app.route('/api/chats', chatsRouter);
app.route('/api/usage', usageRouter);
app.route('/api/subscription', subscriptionRouter);
app.route('/api/public', publicRouter);
app.route('/api/stripe', stripeRouter);
app.route('/api/webhooks', stripeWebhookRouter);
app.route('/api/auth/otp', otpRouter);
app.route('/api/jobs', jobsRouter);
app.route('/api/account', accountRouter);
app.route('/api/artifacts', artifactsRouter);
app.route('/api/images', imagesRouter);

app.route('/webhook', stripeWebhookRouter);

app.doc('/docs', {
  openapi: '3.0.0',
  info: {
    version: '1.0.0',
    title: 'pumkin API',
    description: 'API do pumkin',
  },
  servers: [{ url: 'http://localhost:3001', description: 'Development' }],
});

app.get('/swagger', swaggerUI({ url: '/docs' }));

export default app;
