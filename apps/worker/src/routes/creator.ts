import { Hono } from 'hono';

import type { AppEnv } from '../env';
import { authenticate, audit, currentUser, requireRole } from '../lib/auth';
import {
  addDays,
  id,
  isCurrency,
  isPaymentMethod,
  now,
  requireJsonObject,
  string,
} from '../lib/base';
import { decryptSecret, encryptSecret } from '../lib/crypto';
import { decimalText, parsePositiveAmount } from '../lib/money';
import { notifyAdmins } from '../lib/notifications';
import { parseSingleFile, storeCreatorMedia, storeImageProof } from '../lib/storage';

export const creatorRoutes = new Hono<AppEnv>();
creatorRoutes.use('*', authenticate);

creatorRoutes.get('/v1/creator/dashboard', requireRole('CREATOR'), async (c) => {
  const user = currentUser(c);
  const profile = await c.env.DB.prepare(
    `SELECT handle, display_name, subscription_price, subscription_currency, status, next_billing_at
       FROM creator_profiles WHERE user_id = ? LIMIT 1`,
  )
    .bind(user.id)
    .first<{
      handle: string;
      display_name: string;
      subscription_price: string;
      subscription_currency: string;
      status: string;
      next_billing_at: string;
    }>();
  if (!profile) return c.json({ error: 'Creator profile not configured' }, 409);

  const [subscribers, approvedSales, invoices] = await Promise.all([
    c.env.DB.prepare(
      `SELECT COUNT(*) AS count FROM subscriptions
         WHERE creator_id = ? AND status = 'ACTIVE' AND current_period_end > ?`,
    )
      .bind(user.id, now())
      .first<{ count: number }>(),
    c.env.DB.prepare(
      `SELECT currency, COUNT(*) AS count, COALESCE(SUM(CAST(amount AS REAL)), 0) AS total
         FROM payment_claims
         WHERE creator_id = ? AND status = 'APPROVED'
         GROUP BY currency`,
    )
      .bind(user.id)
      .all<{ currency: string; count: number; total: number }>(),
    c.env.DB.prepare(
      `SELECT id, amount_usdt, status, due_at FROM platform_invoices
         WHERE creator_id = ? AND status IN ('AWAITING_CREATOR_PAYMENT', 'PROOF_SUBMITTED', 'OVERDUE')
         ORDER BY due_at ASC`,
    )
      .bind(user.id)
      .all<{ id: string; amount_usdt: string; status: string; due_at: string }>(),
  ]);

  return c.json({
    profile: {
      handle: profile.handle,
      displayName: profile.display_name,
      subscriptionPrice: profile.subscription_price,
      subscriptionCurrency: profile.subscription_currency,
      status: profile.status,
      nextBillingAt: profile.next_billing_at,
    },
    metrics: {
      activeSubscribers: subscribers?.count ?? 0,
      approvedSales: approvedSales.results,
      pendingPlatformInvoices: invoices.results,
    },
  });
});

creatorRoutes.get('/v1/creator/payment-methods', requireRole('CREATOR'), async (c) => {
  const user = currentUser(c);
  const methods = await c.env.DB.prepare(
    `SELECT id, method_type, display_label, network, recipient_hint, is_active, created_at
       FROM creator_payment_methods WHERE creator_id = ? ORDER BY created_at DESC`,
  )
    .bind(user.id)
    .all();
  return c.json({ methods: methods.results });
});

creatorRoutes.post('/v1/creator/payment-methods', requireRole('CREATOR'), async (c) => {
  const user = currentUser(c);
  if (user.creatorStatus !== 'ACTIVE' && user.creatorStatus !== 'PAYMENT_DUE') {
    return c.json({ error: 'Creator account is not allowed to change payment methods' }, 403);
  }

  const payload = requireJsonObject(await c.req.json().catch(() => undefined));
  const methodType = payload?.methodType;
  const displayLabel = string(payload?.displayLabel, 120);
  const recipientDetails = string(payload?.recipientDetails, 500);
  const recipientHint = string(payload?.recipientHint, 120);
  const network = string(payload?.network, 40);
  if (!isPaymentMethod(methodType) || !displayLabel || !recipientDetails) {
    return c.json({ error: 'Payment method, label and recipient details are required' }, 400);
  }

  const encrypted = await encryptSecret(recipientDetails, c.env.PAYMENT_DETAILS_ENCRYPTION_KEY);
  const timestamp = now();
  const methodId = id();
  try {
    await c.env.DB.prepare(
      `INSERT INTO creator_payment_methods (
          id, creator_id, method_type, display_label, network, recipient_encrypted, recipient_hint,
          is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(creator_id, method_type, network) DO UPDATE SET
          display_label = excluded.display_label,
          recipient_encrypted = excluded.recipient_encrypted,
          recipient_hint = excluded.recipient_hint,
          is_active = 1,
          updated_at = excluded.updated_at`,
    )
      .bind(
        methodId,
        user.id,
        methodType,
        displayLabel,
        network ?? '',
        encrypted,
        recipientHint ?? null,
        timestamp,
        timestamp,
      )
      .run();
  } catch (error) {
    console.error('Payment method save error', error);
    return c.json({ error: 'Unable to save payment method' }, 500);
  }

  await audit(c.env.DB, {
    actorUserId: user.id,
    action: 'CREATOR_PAYMENT_METHOD_SAVED',
    entityType: 'creator_payment_method',
    entityId: methodId,
    metadata: { methodType, network },
  });
  return c.json({ created: true });
});

creatorRoutes.get('/v1/creator/posts', requireRole('CREATOR'), async (c) => {
  const user = currentUser(c);
  const posts = await c.env.DB.prepare(
    `SELECT p.*, COUNT(m.id) AS media_count
       FROM posts p LEFT JOIN media_assets m ON m.post_id = p.id AND m.status = 'READY'
       WHERE p.author_id = ? GROUP BY p.id ORDER BY p.created_at DESC`,
  )
    .bind(user.id)
    .all();
  return c.json({ posts: posts.results });
});

creatorRoutes.post('/v1/creator/posts', requireRole('CREATOR'), async (c) => {
  const user = currentUser(c);
  if (!['ACTIVE', 'PAYMENT_DUE'].includes(String(user.creatorStatus))) {
    return c.json({ error: 'Creator sales are suspended' }, 403);
  }

  const payload = requireJsonObject(await c.req.json().catch(() => undefined));
  const title = string(payload?.title, 180);
  const body = string(payload?.body, 20_000);
  const accessType = payload?.accessType;
  const contentRating = payload?.contentRating;
  if (!['FREE', 'SUBSCRIBERS', 'PPV'].includes(String(accessType))) {
    return c.json({ error: 'Invalid access type' }, 400);
  }
  if (!['GENERAL', '18_PLUS'].includes(String(contentRating))) {
    return c.json({ error: 'Invalid content rating' }, 400);
  }

  let ppvPrice: string | null = null;
  let ppvCurrency: string | null = null;
  if (accessType === 'PPV') {
    if (!isCurrency(payload?.ppvCurrency))
      return c.json({ error: 'PPV currency is required' }, 400);
    try {
      ppvPrice = decimalText(parsePositiveAmount(payload?.ppvPrice, 'PPV price'));
      ppvCurrency = payload.ppvCurrency;
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Invalid PPV price' }, 400);
    }
  }

  const postId = id();
  const timestamp = now();
  await c.env.DB.prepare(
    `INSERT INTO posts (
        id, author_id, title, body, access_type, status, content_rating, ppv_price, ppv_currency,
        included_in_subscription, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      postId,
      user.id,
      title ?? null,
      body ?? null,
      accessType,
      contentRating,
      ppvPrice,
      ppvCurrency,
      payload?.includedInSubscription === true ? 1 : 0,
      timestamp,
      timestamp,
    )
    .run();

  return c.json({ postId, status: 'DRAFT' }, 201);
});

creatorRoutes.post('/v1/creator/posts/:postId/media', requireRole('CREATOR'), async (c) => {
  const user = currentUser(c);
  if (!['ACTIVE', 'PAYMENT_DUE'].includes(String(user.creatorStatus))) {
    return c.json({ error: 'Creator sales are suspended' }, 403);
  }

  const postId = c.req.param('postId');
  const post = await c.env.DB.prepare(
    `SELECT id FROM posts WHERE id = ? AND author_id = ? AND status = 'DRAFT' LIMIT 1`,
  )
    .bind(postId, user.id)
    .first<{ id: string }>();
  if (!post) return c.json({ error: 'Draft post not found' }, 404);

  const form = await c.req.formData();
  const file = parseSingleFile(form);
  const kind = form.get('kind');
  if (!file || !['IMAGE', 'VIDEO', 'AUDIO'].includes(String(kind))) {
    return c.json({ error: 'A file and media kind are required' }, 400);
  }

  const assetId = id();
  try {
    const stored = await storeCreatorMedia({
      bucket: c.env.MEDIA,
      key: `media/${postId}/${assetId}`,
      file,
      kind: kind as 'IMAGE' | 'VIDEO' | 'AUDIO',
    });
    const timestamp = now();
    await c.env.DB.prepare(
      `INSERT INTO media_assets (
          id, post_id, object_key, kind, content_type, byte_size, sha256, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'READY', ?, ?)`,
    )
      .bind(
        assetId,
        postId,
        stored.objectKey,
        kind,
        stored.contentType,
        stored.byteSize,
        stored.sha256,
        timestamp,
        timestamp,
      )
      .run();
    return c.json({ assetId, status: 'READY' }, 201);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Media upload failed' }, 400);
  }
});

creatorRoutes.post('/v1/creator/posts/:postId/publish', requireRole('CREATOR'), async (c) => {
  const user = currentUser(c);
  if (!['ACTIVE', 'PAYMENT_DUE'].includes(String(user.creatorStatus))) {
    return c.json({ error: 'Creator sales are suspended' }, 403);
  }

  const postId = c.req.param('postId');
  const [post, media] = await Promise.all([
    c.env.DB.prepare(`SELECT id, status FROM posts WHERE id = ? AND author_id = ? LIMIT 1`)
      .bind(postId, user.id)
      .first<{ id: string; status: string }>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS count FROM media_assets WHERE post_id = ? AND status = 'READY'`,
    )
      .bind(postId)
      .first<{ count: number }>(),
  ]);
  if (!post) return c.json({ error: 'Post not found' }, 404);
  if (post.status !== 'DRAFT') return c.json({ error: 'Only drafts can be published' }, 409);
  if (!media?.count) return c.json({ error: 'Add at least one valid media asset first' }, 412);

  await c.env.DB.prepare(
    `UPDATE posts SET status = 'PUBLISHED', published_at = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(now(), now(), postId)
    .run();
  return c.json({ published: true });
});

creatorRoutes.get('/v1/creator/payment-claims', requireRole('CREATOR'), async (c) => {
  const user = currentUser(c);
  const status = c.req.query('status');
  const statement = status
    ? c.env.DB.prepare(
        `SELECT id, buyer_id, target_type, post_id, payment_method_type, amount, currency, status,
                buyer_note, proof_object_key, proof_content_type, created_at, expires_at
         FROM payment_claims WHERE creator_id = ? AND status = ? ORDER BY created_at DESC LIMIT 100`,
      )
    : c.env.DB.prepare(
        `SELECT id, buyer_id, target_type, post_id, payment_method_type, amount, currency, status,
                buyer_note, proof_object_key, proof_content_type, created_at, expires_at
         FROM payment_claims WHERE creator_id = ? ORDER BY created_at DESC LIMIT 100`,
      );
  const result = status
    ? await statement.bind(user.id, status).all()
    : await statement.bind(user.id).all();
  return c.json({ claims: result.results });
});

creatorRoutes.post(
  '/v1/creator/payment-claims/:claimId/approve',
  requireRole('CREATOR'),
  async (c) => {
    const user = currentUser(c);
    if (user.creatorStatus !== 'ACTIVE' && user.creatorStatus !== 'PAYMENT_DUE') {
      return c.json({ error: 'Suspended creators cannot approve sales' }, 403);
    }
    const claimId = c.req.param('claimId');
    const payload = requireJsonObject(await c.req.json().catch(() => undefined));
    const note = string(payload?.note, 500);

    const claim = await c.env.DB.prepare(
      `SELECT * FROM payment_claims WHERE id = ? AND creator_id = ? LIMIT 1`,
    )
      .bind(claimId, user.id)
      .first<{
        id: string;
        buyer_id: string;
        creator_id: string;
        target_type: 'POST' | 'SUBSCRIPTION';
        post_id: string | null;
        status: string;
      }>();
    if (!claim) return c.json({ error: 'Payment claim not found' }, 404);
    if (!['PROOF_SUBMITTED', 'APPROVED'].includes(claim.status)) {
      return c.json({ error: 'Only a submitted proof can be approved' }, 409);
    }

    const timestamp = now();
    if (claim.status === 'PROOF_SUBMITTED') {
      const result = await c.env.DB.prepare(
        `UPDATE payment_claims
         SET status = 'APPROVED', creator_note = ?, reviewed_at = ?, approved_at = ?, updated_at = ?
         WHERE id = ? AND status = 'PROOF_SUBMITTED'`,
      )
        .bind(note ?? null, timestamp, timestamp, timestamp, claim.id)
        .run();
      if (!result.meta.changes)
        return c.json({ error: 'Claim state changed; refresh and retry' }, 409);
    }

    if (claim.target_type === 'POST' && claim.post_id) {
      await c.env.DB.prepare(
        `INSERT OR IGNORE INTO post_entitlements (id, post_id, buyer_id, payment_claim_id, granted_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
        .bind(id(), claim.post_id, claim.buyer_id, claim.id, timestamp)
        .run();
    } else {
      const existingSubscription = await c.env.DB.prepare(
        `SELECT current_period_end FROM subscriptions
         WHERE subscriber_id = ? AND creator_id = ? LIMIT 1`,
      )
        .bind(claim.buyer_id, claim.creator_id)
        .first<{ current_period_end: string | null }>();
      const periodStart =
        existingSubscription?.current_period_end &&
        existingSubscription.current_period_end > timestamp
          ? existingSubscription.current_period_end
          : timestamp;
      const periodEnd = addDays(new Date(periodStart), 30);

      await c.env.DB.prepare(
        `INSERT INTO subscriptions (
          id, subscriber_id, creator_id, status, current_period_start, current_period_end, created_at, updated_at
        ) VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, ?)
        ON CONFLICT(subscriber_id, creator_id) DO UPDATE SET
          status = 'ACTIVE',
          current_period_start = excluded.current_period_start,
          current_period_end = excluded.current_period_end,
          updated_at = excluded.updated_at`,
      )
        .bind(id(), claim.buyer_id, claim.creator_id, periodStart, periodEnd, timestamp, timestamp)
        .run();
    }

    await audit(c.env.DB, {
      actorUserId: user.id,
      action: 'CREATOR_APPROVED_DIRECT_PAYMENT',
      entityType: 'payment_claim',
      entityId: claim.id,
    });
    return c.json({ approved: true });
  },
);

creatorRoutes.get('/v1/creator/platform-invoices', requireRole('CREATOR'), async (c) => {
  const user = currentUser(c);
  const invoices = await c.env.DB.prepare(
    `SELECT id, amount_usdt, network, platform_recipient_snapshot, status, due_at, creator_note,
              admin_note, proof_object_key, created_at
       FROM platform_invoices WHERE creator_id = ? ORDER BY created_at DESC LIMIT 50`,
  )
    .bind(user.id)
    .all<{
      id: string;
      amount_usdt: string;
      network: string;
      platform_recipient_snapshot: string;
      status: string;
      due_at: string;
      creator_note: string | null;
      admin_note: string | null;
      proof_object_key: string | null;
      created_at: string;
    }>();
  return c.json({
    invoices: invoices.results.map((invoice) => ({
      ...invoice,
      paymentInstructions: JSON.parse(invoice.platform_recipient_snapshot) as unknown,
      platform_recipient_snapshot: undefined,
    })),
  });
});

creatorRoutes.post(
  '/v1/creator/platform-invoices/:invoiceId/proof',
  requireRole('CREATOR'),
  async (c) => {
    const user = currentUser(c);
    const invoice = await c.env.DB.prepare(
      `SELECT id, status FROM platform_invoices WHERE id = ? AND creator_id = ? LIMIT 1`,
    )
      .bind(c.req.param('invoiceId'), user.id)
      .first<{ id: string; status: string }>();
    if (!invoice) return c.json({ error: 'Platform invoice not found' }, 404);
    if (!['AWAITING_CREATOR_PAYMENT', 'OVERDUE'].includes(invoice.status)) {
      return c.json({ error: 'This invoice cannot accept a proof' }, 409);
    }

    const form = await c.req.formData();
    const file = parseSingleFile(form);
    if (!file) return c.json({ error: 'Proof image is required' }, 400);
    const note = string(form.get('note'), 500);

    try {
      const stored = await storeImageProof({
        bucket: c.env.MEDIA,
        key: `proofs/platform/${invoice.id}`,
        file,
      });
      const timestamp = now();
      await c.env.DB.prepare(
        `UPDATE platform_invoices
         SET status = 'PROOF_SUBMITTED', proof_object_key = ?, proof_content_type = ?, proof_sha256 = ?,
             creator_note = ?, updated_at = ?
         WHERE id = ?`,
      )
        .bind(
          stored.objectKey,
          stored.contentType,
          stored.sha256,
          note ?? null,
          timestamp,
          invoice.id,
        )
        .run();
      await audit(c.env.DB, {
        actorUserId: user.id,
        action: 'CREATOR_PLATFORM_INVOICE_PROOF_SUBMITTED',
        entityType: 'platform_invoice',
        entityId: invoice.id,
      });
      await notifyAdmins(c.env.DB, {
        type: 'PLATFORM_INVOICE_PROOF_SUBMITTED',
        title: 'Comprobante de plataforma pendiente',
        body: `Un creador envió comprobante para la factura ${invoice.id}.`,
        entityType: 'platform_invoice',
        entityId: invoice.id,
      });
      return c.json({ submitted: true });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Proof upload failed' }, 400);
    }
  },
);

creatorRoutes.post(
  '/v1/creator/payment-claims/:claimId/reject',
  requireRole('CREATOR'),
  async (c) => {
    const user = currentUser(c);
    const claimId = c.req.param('claimId');
    const payload = requireJsonObject(await c.req.json().catch(() => undefined));
    const note = string(payload?.note, 500);
    const result = await c.env.DB.prepare(
      `UPDATE payment_claims
       SET status = 'REJECTED', creator_note = ?, reviewed_at = ?, updated_at = ?
       WHERE id = ? AND creator_id = ? AND status = 'PROOF_SUBMITTED'`,
    )
      .bind(note ?? null, now(), now(), claimId, user.id)
      .run();
    if (!result.meta.changes) return c.json({ error: 'Payment claim cannot be rejected' }, 409);
    return c.json({ rejected: true });
  },
);
