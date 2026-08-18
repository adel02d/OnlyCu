import { Hono } from 'hono';

import type { AppEnv } from './env';
import { runBillingScheduler } from './lib/billing';
import { adminRoutes } from './routes/admin';
import { agentRoutes, isAllowedBrowserOrigin } from './routes/agent';
import { authRoutes } from './routes/auth';
import { creatorRoutes } from './routes/creator';
import { mediaRoutes } from './routes/media';
import { messagingRoutes } from './routes/messaging';
import { paymentRoutes } from './routes/payments';
import { systemRoutes } from './routes/system';

const app = new Hono<AppEnv>();

app.use('*', async (c, next) => {
  c.set('requestId', c.req.header('CF-Ray') ?? crypto.randomUUID());
  const origin = c.req.header('Origin');
  if (origin && isAllowedBrowserOrigin(origin, c.env.APP_ORIGIN)) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Vary', 'Origin');
    c.header(
      'Access-Control-Allow-Headers',
      'Authorization, Content-Type, Idempotency-Key, Range, X-Agent-Admin-Key',
    );
    c.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    c.header('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
    c.header('Access-Control-Max-Age', '600');
  }
  if (c.req.method === 'OPTIONS') {
    return origin && isAllowedBrowserOrigin(origin, c.env.APP_ORIGIN)
      ? c.body(null, 204)
      : c.body(null, 403);
  }
  await next();
});

app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'no-referrer');
  if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-store');
});

app.route('/', systemRoutes);
app.route('/', authRoutes);
app.route('/', creatorRoutes);
app.route('/', paymentRoutes);
app.route('/', mediaRoutes);
app.route('/', agentRoutes);
app.route('/', messagingRoutes);
app.route('/', adminRoutes);

app.notFound((c) => c.json({ error: 'Not found', requestId: c.get('requestId') }, 404));
app.onError((error, c) => {
  console.error(JSON.stringify({ requestId: c.get('requestId'), error: error.message }));
  return c.json({ error: 'Internal server error', requestId: c.get('requestId') }, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      runBillingScheduler(env).catch((error) => {
        console.error('Billing scheduler failed', error);
      }),
    );
  },
} satisfies ExportedHandler<AppEnv['Bindings']>;
