import { Hono } from 'hono';

import type { AppEnv } from '../env';
import { authenticate, audit, currentUser, requireRole } from '../lib/auth';
import { id, isCurrency, now, requireJsonObject, string } from '../lib/base';
import { reactivateCreatorIfClear, runBillingScheduler } from '../lib/billing';
import { parsePositiveAmount, decimalText } from '../lib/money';
import { notify } from '../lib/notifications';

export const adminRoutes = new Hono<AppEnv>();
adminRoutes.use('/v1/admin/*', authenticate, requireRole('ADMIN', 'MODERATOR'));

adminRoutes.get('/v1/admin/platform-settings', async (c) => {
  const settings = await c.env.DB.prepare(
    `SELECT commission_bps, updated_at FROM platform_settings WHERE id = 1`,
  ).first<{ commission_bps: number; updated_at: string }>();
  const rates = await c.env.DB.prepare(
    `SELECT currency, usdt_per_unit, updated_at FROM platform_exchange_rates ORDER BY currency`,
  ).all();
  return c.json({
    commissionBps: settings?.commission_bps ?? 1000,
    platformSettlement: {
      currency: 'USDT',
      network: c.env.PLATFORM_USDT_NETWORK,
      address: c.env.PLATFORM_USDT_ADDRESS,
    },
    exchangeRates: rates.results,
  });
});

adminRoutes.patch('/v1/admin/platform-settings', async (c) => {
  const payload = requireJsonObject(await c.req.json().catch(() => undefined));
  const commissionBps = payload?.commissionBps;
  if (commissionBps !== 1000) {
    return c.json({ error: 'OnlyCu uses a fixed 10% platform commission (1000 bps)' }, 400);
  }
  const timestamp = now();
  await c.env.DB.prepare(
    `INSERT INTO platform_settings (id, commission_bps, updated_at) VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET commission_bps = excluded.commission_bps, updated_at = excluded.updated_at`,
  )
    .bind(commissionBps, timestamp)
    .run();
  await audit(c.env.DB, {
    actorUserId: currentUser(c).id,
    action: 'PLATFORM_COMMISSION_UPDATED',
    entityType: 'platform_settings',
    entityId: '1',
    metadata: { commissionBps },
  });
  return c.json({ commissionBps });
});

adminRoutes.put('/v1/admin/exchange-rates/:currency', async (c) => {
  const admin = currentUser(c);
  const currency = c.req.param('currency').toUpperCase();
  if (!isCurrency(currency)) return c.json({ error: 'Unsupported currency' }, 400);
  const payload = requireJsonObject(await c.req.json().catch(() => undefined));
  let rate;
  try {
    rate = parsePositiveAmount(payload?.usdtPerUnit, 'USDT rate');
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Invalid rate' }, 400);
  }
  if (currency === 'USDT' && !rate.eq(1)) return c.json({ error: 'USDT rate must remain 1' }, 400);

  await c.env.DB.prepare(
    `INSERT INTO platform_exchange_rates (currency, usdt_per_unit, updated_by, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(currency) DO UPDATE SET
         usdt_per_unit = excluded.usdt_per_unit,
         updated_by = excluded.updated_by,
         updated_at = excluded.updated_at`,
  )
    .bind(currency, decimalText(rate), admin.id, now())
    .run();
  await audit(c.env.DB, {
    actorUserId: admin.id,
    action: 'PLATFORM_EXCHANGE_RATE_UPDATED',
    entityType: 'platform_exchange_rate',
    entityId: currency,
    metadata: { usdtPerUnit: decimalText(rate) },
  });
  return c.json({ currency, usdtPerUnit: decimalText(rate) });
});

adminRoutes.post('/v1/admin/billing/run', async (c) => {
  const result = await runBillingScheduler(c.env);
  await audit(c.env.DB, {
    actorUserId: currentUser(c).id,
    action: 'BILLING_SCHEDULER_MANUALLY_RUN',
    entityType: 'billing',
    metadata: result,
  });
  return c.json(result);
});

adminRoutes.get('/v1/admin/platform-invoices', async (c) => {
  const status = c.req.query('status');
  const query = status
    ? c.env.DB.prepare(
        `SELECT i.*, cp.handle, cp.display_name
         FROM platform_invoices i JOIN creator_profiles cp ON cp.user_id = i.creator_id
         WHERE i.status = ? ORDER BY i.due_at ASC LIMIT 100`,
      )
    : c.env.DB.prepare(
        `SELECT i.*, cp.handle, cp.display_name
         FROM platform_invoices i JOIN creator_profiles cp ON cp.user_id = i.creator_id
         ORDER BY i.due_at ASC LIMIT 100`,
      );
  const invoices = status ? await query.bind(status).all() : await query.all();
  return c.json({ invoices: invoices.results });
});

adminRoutes.get('/v1/admin/platform-invoices/:invoiceId/proof', async (c) => {
  const invoice = await c.env.DB.prepare(
    `SELECT proof_object_key, proof_content_type FROM platform_invoices WHERE id = ? LIMIT 1`,
  )
    .bind(c.req.param('invoiceId'))
    .first<{ proof_object_key: string | null; proof_content_type: string | null }>();
  if (!invoice?.proof_object_key) return c.json({ error: 'Proof not found' }, 404);
  const object = await c.env.MEDIA.get(invoice.proof_object_key);
  if (!object?.body) return c.json({ error: 'Proof object not found' }, 404);
  return new Response(object.body, {
    headers: {
      'Content-Type': invoice.proof_content_type ?? 'application/octet-stream',
      'Cache-Control': 'no-store, private',
      'Content-Disposition': 'inline',
      'Referrer-Policy': 'no-referrer',
    },
  });
});

adminRoutes.post('/v1/admin/platform-invoices/:invoiceId/approve', async (c) => {
  const admin = currentUser(c);
  const invoice = await c.env.DB.prepare(
    `SELECT id, cycle_id, creator_id, status FROM platform_invoices WHERE id = ? LIMIT 1`,
  )
    .bind(c.req.param('invoiceId'))
    .first<{ id: string; cycle_id: string; creator_id: string; status: string }>();
  if (!invoice) return c.json({ error: 'Invoice not found' }, 404);
  if (invoice.status === 'PAID') return c.json({ approved: true, idempotentReplay: true });
  if (invoice.status !== 'PROOF_SUBMITTED') {
    return c.json({ error: 'Only a submitted invoice proof can be approved' }, 409);
  }

  const timestamp = now();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE platform_invoices
         SET status = 'PAID', reviewed_by = ?, reviewed_at = ?, paid_at = ?, updated_at = ?
         WHERE id = ?`,
    ).bind(admin.id, timestamp, timestamp, timestamp, invoice.id),
    c.env.DB.prepare(`UPDATE billing_cycles SET status = 'PAID', updated_at = ? WHERE id = ?`).bind(
      timestamp,
      invoice.cycle_id,
    ),
  ]);
  await reactivateCreatorIfClear(c.env, invoice.creator_id);
  await audit(c.env.DB, {
    actorUserId: admin.id,
    action: 'PLATFORM_INVOICE_APPROVED',
    entityType: 'platform_invoice',
    entityId: invoice.id,
  });
  return c.json({ approved: true, idempotentReplay: false });
});

adminRoutes.post('/v1/admin/platform-invoices/:invoiceId/reject', async (c) => {
  const admin = currentUser(c);
  const payload = requireJsonObject(await c.req.json().catch(() => undefined));
  const note = string(payload?.note, 500);
  const invoice = await c.env.DB.prepare(
    `SELECT id, creator_id, status FROM platform_invoices WHERE id = ? LIMIT 1`,
  )
    .bind(c.req.param('invoiceId'))
    .first<{ id: string; creator_id: string; status: string }>();
  if (!invoice) return c.json({ error: 'Invoice not found' }, 404);
  if (invoice.status !== 'PROOF_SUBMITTED')
    return c.json({ error: 'Invoice proof cannot be rejected' }, 409);

  await c.env.DB.prepare(
    `UPDATE platform_invoices
       SET status = 'AWAITING_CREATOR_PAYMENT', admin_note = ?, reviewed_by = ?, reviewed_at = ?,
           updated_at = ?
       WHERE id = ?`,
  )
    .bind(
      note ?? 'Comprobante rechazado. Envía una nueva captura.',
      admin.id,
      now(),
      now(),
      invoice.id,
    )
    .run();
  await notify(c.env.DB, {
    userId: invoice.creator_id,
    type: 'PLATFORM_INVOICE_PROOF_REJECTED',
    title: 'Comprobante rechazado',
    body: note ?? 'El administrador rechazó el comprobante. Envía una nueva captura.',
    entityType: 'platform_invoice',
    entityId: invoice.id,
  });
  return c.json({ rejected: true });
});

adminRoutes.get('/v1/admin/payment-claims', async (c) => {
  const status = c.req.query('status');
  const query = status
    ? c.env.DB.prepare(
        `SELECT p.id, p.creator_id, p.buyer_id, p.target_type, p.payment_method_type, p.amount,
                p.currency, p.status, p.proof_object_key, p.created_at, p.approved_at,
                creator.handle AS creator_handle, buyer.username AS buyer_username
         FROM payment_claims p
         JOIN creator_profiles creator ON creator.user_id = p.creator_id
         JOIN users buyer ON buyer.id = p.buyer_id
         WHERE p.status = ? ORDER BY p.created_at DESC LIMIT 200`,
      )
    : c.env.DB.prepare(
        `SELECT p.id, p.creator_id, p.buyer_id, p.target_type, p.payment_method_type, p.amount,
                p.currency, p.status, p.proof_object_key, p.created_at, p.approved_at,
                creator.handle AS creator_handle, buyer.username AS buyer_username
         FROM payment_claims p
         JOIN creator_profiles creator ON creator.user_id = p.creator_id
         JOIN users buyer ON buyer.id = p.buyer_id
         ORDER BY p.created_at DESC LIMIT 200`,
      );
  const claims = status ? await query.bind(status).all() : await query.all();
  return c.json({ claims: claims.results });
});

adminRoutes.get('/v1/admin/media-access-events', async (c) => {
  const events = await c.env.DB.prepare(
    `SELECT e.*, u.telegram_id, u.username
       FROM media_access_events e LEFT JOIN users u ON u.id = e.user_id
       ORDER BY e.created_at DESC LIMIT 200`,
  ).all();
  return c.json({ events: events.results });
});

adminRoutes.get('/v1/admin/audit-events', async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT e.*, u.telegram_id, u.username
       FROM audit_events e LEFT JOIN users u ON u.id = e.actor_user_id
       ORDER BY e.created_at DESC LIMIT 200`,
  ).all();
  return c.json({ events: result.results });
});
