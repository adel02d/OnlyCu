import { Hono } from 'hono';

import type { AppEnv } from '../env';
import { authenticate, audit, currentUser } from '../lib/auth';
import { addDays, id, now, requireJsonObject, string } from '../lib/base';
import { decryptSecret } from '../lib/crypto';
import { parseSingleFile, storeImageProof } from '../lib/storage';

export const paymentRoutes = new Hono<AppEnv>();
paymentRoutes.use('/v1/creators/*', authenticate);
paymentRoutes.use('/v1/payment-claims', authenticate);
paymentRoutes.use('/v1/payment-claims/*', authenticate);

paymentRoutes.get('/v1/creators/:creatorId/payment-methods', async (c) => {
  const user = currentUser(c);
  const creatorId = c.req.param('creatorId');
  if (!creatorId) return c.json({ error: 'Creator identifier is required' }, 400);
  const creator = await c.env.DB.prepare(
    `SELECT status, content_scope FROM creator_profiles WHERE user_id = ? LIMIT 1`,
  )
    .bind(creatorId)
    .first<{ status: string; content_scope: string }>();
  if (!creator || !['ACTIVE', 'PAYMENT_DUE'].includes(creator.status)) {
    return c.json({ error: 'Creator is unavailable' }, 404);
  }
  if (creator.content_scope === '18_PLUS' && !user.adultDeclaredAt) {
    return c.json({ error: '18+ self-declaration is required' }, 403);
  }
  const methods = await c.env.DB.prepare(
    `SELECT id, method_type, display_label, network, recipient_hint
       FROM creator_payment_methods
       WHERE creator_id = ? AND is_active = 1 ORDER BY created_at ASC`,
  )
    .bind(creatorId)
    .all();
  return c.json({ methods: methods.results });
});

paymentRoutes.post('/v1/payment-claims', async (c) => {
  const buyer = currentUser(c);
  if (!buyer.termsAcceptedAt || !buyer.adultDeclaredAt) {
    return c.json({ error: 'Complete terms acceptance and 18+ self-declaration first' }, 412);
  }

  const payload = requireJsonObject(await c.req.json().catch(() => undefined));
  const targetType = payload?.targetType;
  const postId = string(payload?.postId, 64);
  const creatorId = string(payload?.creatorId, 64);
  const paymentMethodId = string(payload?.paymentMethodId, 64);
  if (!['POST', 'SUBSCRIPTION'].includes(String(targetType)) || !paymentMethodId) {
    return c.json({ error: 'Target and payment method are required' }, 400);
  }

  const quote = await resolveQuote(c.env.DB, {
    targetType: targetType as 'POST' | 'SUBSCRIPTION',
    postId,
    creatorId,
    buyerId: buyer.id,
    adultDeclared: Boolean(buyer.adultDeclaredAt),
  });
  if ('error' in quote) return c.json({ error: quote.error }, quote.status as 400);

  if (quote.postId) {
    const entitlement = await c.env.DB.prepare(
      `SELECT id FROM post_entitlements WHERE post_id = ? AND buyer_id = ? AND revoked_at IS NULL LIMIT 1`,
    )
      .bind(quote.postId, buyer.id)
      .first<{ id: string }>();
    if (entitlement) return c.json({ error: 'This post is already unlocked' }, 409);
  }

  const method = await c.env.DB.prepare(
    `SELECT id, method_type, display_label, network, recipient_encrypted, recipient_hint
       FROM creator_payment_methods
       WHERE id = ? AND creator_id = ? AND is_active = 1 LIMIT 1`,
  )
    .bind(paymentMethodId, quote.creatorId)
    .first<{
      id: string;
      method_type: string;
      display_label: string;
      network: string | null;
      recipient_encrypted: string;
      recipient_hint: string | null;
    }>();
  if (!method) return c.json({ error: 'Creator payment method is unavailable' }, 404);

  const recipientDetails = await decryptSecret(
    method.recipient_encrypted,
    c.env.PAYMENT_DETAILS_ENCRYPTION_KEY,
  );
  if (!recipientDetails) return c.json({ error: 'Creator payment method cannot be read' }, 500);

  const timestamp = now();
  const claimId = id();
  const expiresAt = addDays(new Date(), 1);
  await c.env.DB.prepare(
    `INSERT INTO payment_claims (
        id, buyer_id, creator_id, target_type, post_id, payment_method_id, payment_method_type,
        recipient_snapshot_encrypted, amount, currency, status, expires_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'AWAITING_TRANSFER', ?, ?, ?)`,
  )
    .bind(
      claimId,
      buyer.id,
      quote.creatorId,
      targetType,
      quote.postId ?? null,
      method.id,
      method.method_type,
      method.recipient_encrypted,
      quote.amount,
      quote.currency,
      expiresAt,
      timestamp,
      timestamp,
    )
    .run();

  await audit(c.env.DB, {
    actorUserId: buyer.id,
    action: 'DIRECT_PAYMENT_CLAIM_CREATED',
    entityType: 'payment_claim',
    entityId: claimId,
    metadata: {
      targetType,
      methodType: method.method_type,
      amount: quote.amount,
      currency: quote.currency,
    },
  });

  return c.json(
    {
      paymentClaim: {
        id: claimId,
        targetType,
        amount: quote.amount,
        currency: quote.currency,
        expiresAt,
        status: 'AWAITING_TRANSFER',
        paymentMethod: {
          type: method.method_type,
          label: method.display_label,
          network: method.network,
          recipientHint: method.recipient_hint,
          recipientDetails,
        },
      },
    },
    201,
  );
});

paymentRoutes.get('/v1/payment-claims/:claimId', async (c) => {
  const user = currentUser(c);
  const claim = await c.env.DB.prepare(
    `SELECT id, buyer_id, creator_id, target_type, post_id, payment_method_type, amount, currency,
              status, buyer_note, creator_note, proof_object_key, proof_content_type, expires_at,
              created_at, reviewed_at, approved_at
       FROM payment_claims WHERE id = ? LIMIT 1`,
  )
    .bind(c.req.param('claimId'))
    .first<Record<string, unknown>>();
  if (!claim) return c.json({ error: 'Payment claim not found' }, 404);
  if (
    claim.buyer_id !== user.id &&
    claim.creator_id !== user.id &&
    !user.roles.includes('ADMIN') &&
    !user.roles.includes('MODERATOR')
  ) {
    return c.json({ error: 'Payment claim is unavailable' }, 403);
  }
  return c.json({ paymentClaim: claim });
});

paymentRoutes.post('/v1/payment-claims/:claimId/proof', async (c) => {
  const buyer = currentUser(c);
  const claim = await c.env.DB.prepare(
    `SELECT id, buyer_id, status, expires_at FROM payment_claims WHERE id = ? LIMIT 1`,
  )
    .bind(c.req.param('claimId'))
    .first<{ id: string; buyer_id: string; status: string; expires_at: string }>();
  if (!claim) return c.json({ error: 'Payment claim not found' }, 404);
  if (claim.buyer_id !== buyer.id) return c.json({ error: 'Payment claim is unavailable' }, 403);
  if (claim.status !== 'AWAITING_TRANSFER') {
    return c.json({ error: 'This payment claim cannot accept a proof' }, 409);
  }
  if (claim.expires_at <= now()) return c.json({ error: 'Payment claim expired' }, 410);

  const form = await c.req.formData();
  const file = parseSingleFile(form);
  if (!file) return c.json({ error: 'Proof image is required' }, 400);
  const buyerNote = string(form.get('note'), 500);

  try {
    const stored = await storeImageProof({
      bucket: c.env.MEDIA,
      key: `proofs/customer/${claim.id}`,
      file,
    });
    const timestamp = now();
    const result = await c.env.DB.prepare(
      `UPDATE payment_claims
         SET status = 'PROOF_SUBMITTED', proof_object_key = ?, proof_content_type = ?, proof_sha256 = ?,
             buyer_note = ?, updated_at = ?
         WHERE id = ? AND status = 'AWAITING_TRANSFER'`,
    )
      .bind(
        stored.objectKey,
        stored.contentType,
        stored.sha256,
        buyerNote ?? null,
        timestamp,
        claim.id,
      )
      .run();
    if (!result.meta.changes) return c.json({ error: 'Payment claim state changed; retry' }, 409);

    await createNotification(c.env.DB, {
      userId: await creatorForClaim(c.env.DB, claim.id),
      type: 'CUSTOMER_PROOF_SUBMITTED',
      title: 'Nuevo comprobante de pago',
      body: 'Un cliente envió una captura. Verifica que el dinero llegó antes de aprobar.',
      entityType: 'payment_claim',
      entityId: claim.id,
    });
    return c.json({ submitted: true });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Proof upload failed' }, 400);
  }
});

paymentRoutes.get('/v1/payment-claims/:claimId/proof', async (c) => {
  const user = currentUser(c);
  const claim = await c.env.DB.prepare(
    `SELECT buyer_id, creator_id, proof_object_key, proof_content_type
       FROM payment_claims WHERE id = ? LIMIT 1`,
  )
    .bind(c.req.param('claimId'))
    .first<{
      buyer_id: string;
      creator_id: string;
      proof_object_key: string | null;
      proof_content_type: string | null;
    }>();
  if (!claim?.proof_object_key) return c.json({ error: 'Proof not found' }, 404);
  if (
    claim.buyer_id !== user.id &&
    claim.creator_id !== user.id &&
    !user.roles.includes('ADMIN') &&
    !user.roles.includes('MODERATOR')
  ) {
    return c.json({ error: 'Proof is unavailable' }, 403);
  }

  const object = await c.env.MEDIA.get(claim.proof_object_key);
  if (!object?.body) return c.json({ error: 'Proof object not found' }, 404);
  return new Response(object.body, {
    headers: {
      'Content-Type': claim.proof_content_type ?? 'application/octet-stream',
      'Cache-Control': 'no-store, private',
      'Content-Disposition': 'inline',
      'Referrer-Policy': 'no-referrer',
    },
  });
});

async function resolveQuote(
  db: D1Database,
  input: {
    targetType: 'POST' | 'SUBSCRIPTION';
    postId?: string;
    creatorId?: string;
    buyerId: string;
    adultDeclared: boolean;
  },
): Promise<
  | { creatorId: string; postId?: string; amount: string; currency: string }
  | { error: string; status: 400 | 403 | 404 | 409 }
> {
  if (input.targetType === 'POST') {
    if (!input.postId) return { error: 'Post is required', status: 400 };
    const post = await db
      .prepare(
        `SELECT p.id, p.author_id, p.access_type, p.ppv_price, p.ppv_currency, p.content_rating, p.status,
                cp.status AS creator_status
         FROM posts p JOIN creator_profiles cp ON cp.user_id = p.author_id
         WHERE p.id = ? LIMIT 1`,
      )
      .bind(input.postId)
      .first<{
        id: string;
        author_id: string;
        access_type: string;
        ppv_price: string | null;
        ppv_currency: string | null;
        content_rating: string;
        status: string;
        creator_status: string;
      }>();
    if (
      !post ||
      post.status !== 'PUBLISHED' ||
      post.access_type !== 'PPV' ||
      !post.ppv_price ||
      !post.ppv_currency
    ) {
      return { error: 'PPV post is unavailable', status: 404 };
    }
    if (post.author_id === input.buyerId)
      return { error: 'You cannot purchase your own post', status: 400 };
    if (!['ACTIVE', 'PAYMENT_DUE'].includes(post.creator_status)) {
      return { error: 'Creator is not currently selling', status: 403 };
    }
    if (post.content_rating === '18_PLUS' && !input.adultDeclared) {
      return { error: '18+ self-declaration is required', status: 403 };
    }
    return {
      creatorId: post.author_id,
      postId: post.id,
      amount: post.ppv_price,
      currency: post.ppv_currency,
    };
  }

  if (!input.creatorId) return { error: 'Creator is required', status: 400 };
  if (input.creatorId === input.buyerId)
    return { error: 'You cannot subscribe to yourself', status: 400 };
  const creator = await db
    .prepare(
      `SELECT user_id, subscription_enabled, subscription_price, subscription_currency, content_scope, status
       FROM creator_profiles WHERE user_id = ? LIMIT 1`,
    )
    .bind(input.creatorId)
    .first<{
      user_id: string;
      subscription_enabled: number;
      subscription_price: string;
      subscription_currency: string;
      content_scope: string;
      status: string;
    }>();
  if (!creator || !creator.subscription_enabled)
    return { error: 'Subscription is unavailable', status: 404 };
  if (!['ACTIVE', 'PAYMENT_DUE'].includes(creator.status)) {
    return { error: 'Creator is not currently selling', status: 403 };
  }
  if (creator.content_scope === '18_PLUS' && !input.adultDeclared) {
    return { error: '18+ self-declaration is required', status: 403 };
  }
  return {
    creatorId: creator.user_id,
    amount: creator.subscription_price,
    currency: creator.subscription_currency,
  };
}

async function creatorForClaim(db: D1Database, claimId: string): Promise<string> {
  const record = await db
    .prepare('SELECT creator_id FROM payment_claims WHERE id = ? LIMIT 1')
    .bind(claimId)
    .first<{ creator_id: string }>();
  if (!record) throw new Error('Claim no longer exists');
  return record.creator_id;
}

async function createNotification(
  db: D1Database,
  input: {
    userId: string;
    type: string;
    title: string;
    body: string;
    entityType?: string;
    entityId?: string;
  },
) {
  await db
    .prepare(
      `INSERT INTO notifications (id, user_id, type, title, body, entity_type, entity_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id(),
      input.userId,
      input.type,
      input.title,
      input.body,
      input.entityType ?? null,
      input.entityId ?? null,
      now(),
    )
    .run();
}
