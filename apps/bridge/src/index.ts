import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { getBridgeSnapshot, requestPairing, restartWhatsApp, unlinkWhatsApp } from './whatsapp';

const port = Number(process.env.BRIDGE_PORT ?? 8788);
const app = new Hono();

app.use(
  '*',
  cors({
    origin: (origin) => origin || '*',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  }),
);

app.get('/healthz', (c) => c.json({ status: 'ok', service: 'whatsapp-bridge' }));
app.get('/bridge/healthz', (c) => c.json({ status: 'ok', service: 'whatsapp-bridge' }));

app.get('/bridge/status', (c) => c.json(getBridgeSnapshot()));

app.post('/bridge/pair', async (c) => {
  const body = (await c.req.json().catch(() => undefined)) as { phone?: string } | undefined;
  try {
    const pairingCode = await requestPairing(body?.phone ?? '');
    return c.json({ pairingCode, ...getBridgeSnapshot() });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'No se pudo generar el código' },
      400,
    );
  }
});

app.post('/bridge/logout', async (c) => {
  await unlinkWhatsApp();
  return c.json(getBridgeSnapshot());
});

app.post('/bridge/restart', async (c) => {
  await restartWhatsApp();
  return c.json(getBridgeSnapshot());
});

await restartWhatsApp();

serve({ fetch: app.fetch, hostname: '0.0.0.0', port }, (info) => {
  console.log(`WhatsApp QR bridge listening on http://0.0.0.0:${info.port}`);
});
