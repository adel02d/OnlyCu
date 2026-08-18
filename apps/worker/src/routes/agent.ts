import { Hono } from 'hono';

import type { AppEnv } from '../env';
import { handleAgentTurn, type AgentChannel } from '../lib/agent';
import { SEED_PRODUCTS } from '../lib/agent-catalog';
import { runAgentTurn } from '../lib/agent-service';
import {
  buildChannelDiagnostics,
  ensureAgentSeed,
  listMessages,
  listOrders,
  loadCatalog,
  loadConversationById,
  loadZones,
  publicProduct,
  setDailyProducts,
} from '../lib/agent-store';
import { constantTimeEqual, id, requireJsonObject, string } from '../lib/base';

export const agentRoutes = new Hono<AppEnv>();

agentRoutes.use('/v1/agent/*', async (c, next) => {
  const origin = c.req.header('Origin');
  if (origin && isAllowedBrowserOrigin(origin, c.env.APP_ORIGIN)) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Vary', 'Origin');
    c.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Agent-Admin-Key');
    c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    c.header('Access-Control-Max-Age', '600');
  }
  if (c.req.method === 'OPTIONS') {
    return origin && isAllowedBrowserOrigin(origin, c.env.APP_ORIGIN)
      ? c.body(null, 204)
      : c.body(null, 403);
  }
  await next();
});

agentRoutes.get('/v1/agent/catalog', async (c) => {
  const catalog = await loadCatalog(c.env.DB);
  return c.json({
    products: catalog.map((product) => publicProduct(product, c.env.APP_ORIGIN)),
    paymentMethods: ['Efectivo', 'Transferencia'],
  });
});

agentRoutes.get('/v1/agent/channels', async (c) => {
  return c.json({
    agent: 'Jose',
    company: 'EnergixCu',
    channels: await buildChannelDiagnostics(c.env),
  });
});

agentRoutes.post('/v1/agent/chat', async (c) => {
  const payload = requireJsonObject(await c.req.json().catch(() => undefined));
  const message = string(payload?.message, 2000);
  if (!message) return c.json({ error: 'Message required' }, 400);

  const conversationId = string(payload?.conversationId, 80);
  const displayName = string(payload?.displayName, 80);
  const result = await runAgentTurn(c.env, {
    channel: 'WEB',
    externalUserId: conversationId ?? `web:${id()}`,
    conversationId,
    text: message,
    displayName,
  });

  return c.json({
    conversationId: result.conversation.id,
    stage: result.conversation.stage,
    status: result.conversation.status,
    replies: result.replies,
    order: result.order ?? null,
  });
});

agentRoutes.get('/v1/agent/conversations/:conversationId', async (c) => {
  const conversation = await loadConversationById(c.env.DB, c.req.param('conversationId'));
  if (!conversation) return c.json({ error: 'Conversation not found' }, 404);
  const messages = await listMessages(c.env.DB, conversation.id);
  const orders = await listOrders(c.env.DB, { conversationId: conversation.id, limit: 20 });
  return c.json({ conversation, messages, orders });
});

agentRoutes.get('/v1/agent/orders', async (c) => {
  const conversationId = c.req.query('conversationId');
  if (conversationId) {
    const orders = await listOrders(c.env.DB, { conversationId, limit: 50 });
    return c.json({ orders });
  }
  if (!hasAdminKey(c)) return c.json({ error: 'Admin key required to list all tickets' }, 401);
  const orders = await listOrders(c.env.DB, { limit: 100 });
  return c.json({ orders });
});

agentRoutes.post('/v1/agent/admin/daily-products', async (c) => {
  if (!hasAdminKey(c)) return c.json({ error: 'Admin key required' }, 401);
  const payload = requireJsonObject(await c.req.json().catch(() => undefined));
  const productIds = Array.isArray(payload?.productIds)
    ? payload.productIds.filter((value): value is string => typeof value === 'string').slice(0, 20)
    : [];
  const updated = await setDailyProducts(c.env.DB, productIds);
  return c.json({ updated });
});

agentRoutes.post('/v1/agent/bridge/turn', async (c) => {
  const expected = c.env.BRIDGE_SECRET;
  const supplied = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  if (
    !expected ||
    !supplied ||
    !constantTimeEqual(new TextEncoder().encode(expected), new TextEncoder().encode(supplied))
  ) {
    return c.json({ error: 'Bridge unauthorized' }, 401);
  }
  const payload = requireJsonObject(await c.req.json().catch(() => undefined));
  const message = string(payload?.text, 2000);
  const from = string(payload?.from, 80);
  if (!message || !from) return c.json({ error: 'from and text required' }, 400);
  const result = await runAgentTurn(c.env, {
    channel: 'WHATSAPP',
    externalUserId: from,
    text: message,
    displayName: string(payload?.displayName, 80),
  });
  return c.json({
    conversationId: result.conversation.id,
    replies: result.replies,
    order: result.order ?? null,
  });
});

agentRoutes.post('/v1/agent/preview', async (c) => {
  const payload = requireJsonObject(await c.req.json().catch(() => undefined));
  const message = string(payload?.message, 2000);
  if (!message) return c.json({ error: 'Message required' }, 400);
  await ensureAgentSeed(c.env.DB);
  const result = handleAgentTurn(message, {
    catalog: SEED_PRODUCTS,
    zones: await loadZones(c.env.DB),
    stage: 'NEW',
    draft: {},
    status: 'OPEN',
  });
  return c.json(result);
});

function hasAdminKey(c: {
  req: { header: (name: string) => string | undefined };
  env: AppEnv['Bindings'];
}): boolean {
  const expected = c.env.AGENT_ADMIN_KEY;
  const supplied = c.req.header('X-Agent-Admin-Key');
  if (!expected || !supplied) return false;
  return constantTimeEqual(new TextEncoder().encode(expected), new TextEncoder().encode(supplied));
}

export function isAllowedBrowserOrigin(origin: string, appOrigin: string): boolean {
  if (origin === appOrigin) return true;
  try {
    const url = new URL(origin);
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return true;
    if (url.hostname.endsWith('.e2b.app') || url.hostname.endsWith('.pages.dev')) return true;
    return false;
  } catch {
    return false;
  }
}

export function parseChannel(value: unknown): AgentChannel | undefined {
  return value === 'WEB' || value === 'WHATSAPP' || value === 'MESSENGER' ? value : undefined;
}
