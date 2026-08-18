import { Hono } from 'hono';

import type { AppEnv } from '../env';
import { runAgentTurn } from '../lib/agent-service';
import { readMetaChallenge, verifyMetaSignature } from '../lib/meta-signature';
import { parseMessengerPayload, sendMessengerReplies } from '../lib/messenger';
import { parseWhatsAppPayload, sendWhatsAppReplies } from '../lib/whatsapp';

export const messagingRoutes = new Hono<AppEnv>();

messagingRoutes.get('/v1/whatsapp/webhook', (c) => metaChallenge(c));
messagingRoutes.get('/v1/messenger/webhook', (c) => metaChallenge(c));

messagingRoutes.post('/v1/whatsapp/webhook', async (c) => {
  const raw = await c.req.text();
  const allowed = await authorizeMeta(
    raw,
    c.req.header('X-Hub-Signature-256'),
    c.env.WHATSAPP_APP_SECRET,
  );
  if (!allowed) return c.json({ error: 'Invalid webhook signature' }, 401);

  let payload: unknown;
  try {
    payload = JSON.parse(raw) as unknown;
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  const inbound = parseWhatsAppPayload(payload);
  c.executionCtx.waitUntil(
    Promise.all(
      inbound.map(async (message) => {
        const result = await runAgentTurn(c.env, {
          channel: 'WHATSAPP',
          externalUserId: message.from,
          text: message.text,
          displayName: message.profileName,
          eventId: message.messageId,
        });
        await sendWhatsAppReplies(c.env, message.from, result.replies);
      }),
    ).catch((error) => {
      console.error('WhatsApp inbound failed', error);
    }),
  );
  return c.json({ ok: true });
});

messagingRoutes.post('/v1/messenger/webhook', async (c) => {
  const raw = await c.req.text();
  const allowed = await authorizeMeta(
    raw,
    c.req.header('X-Hub-Signature-256'),
    c.env.MESSENGER_APP_SECRET,
  );
  if (!allowed) return c.json({ error: 'Invalid webhook signature' }, 401);

  let payload: unknown;
  try {
    payload = JSON.parse(raw) as unknown;
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  const inbound = parseMessengerPayload(payload);
  c.executionCtx.waitUntil(
    Promise.all(
      inbound.map(async (message) => {
        const result = await runAgentTurn(c.env, {
          channel: 'MESSENGER',
          externalUserId: message.senderId,
          text: message.text,
          eventId: message.messageId,
        });
        await sendMessengerReplies(c.env, message.senderId, result.replies);
      }),
    ).catch((error) => {
      console.error('Messenger inbound failed', error);
    }),
  );
  return c.json({ ok: true });
});

function metaChallenge(c: { req: { url: string }; env: AppEnv['Bindings'] }) {
  const result = readMetaChallenge(new URL(c.req.url), c.env.META_WEBHOOK_VERIFY_TOKEN);
  if (!result.ok) return new Response('Forbidden', { status: 403 });
  return new Response(result.challenge, {
    status: 200,
    headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
  });
}

async function authorizeMeta(
  rawBody: string,
  signature: string | undefined,
  appSecret: string | undefined,
): Promise<boolean> {
  if (!appSecret) {
    // Local/dev: allow unsigned webhooks so the simulator and first deploy can be tested.
    return true;
  }
  return verifyMetaSignature(rawBody, signature, appSecret);
}
