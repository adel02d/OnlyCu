import { Hono } from 'hono';

import type { AppEnv, CurrentUser } from '../env';
import { authenticate, audit, currentUser } from '../lib/auth';
import { hashPii, id, now, readClientIp, requireJsonObject } from '../lib/base';
import { issueMediaToken, verifyMediaToken } from '../lib/crypto';

export const mediaRoutes = new Hono<AppEnv>();

mediaRoutes.get('/v1/posts', authenticate, async (c) => {
  const user = currentUser(c);
  const posts = await c.env.DB.prepare(
    `SELECT p.id, p.author_id, p.title, p.body, p.access_type, p.content_rating, p.ppv_price,
              p.ppv_currency, p.published_at, cp.handle, cp.display_name,
              (SELECT id FROM media_assets m WHERE m.post_id = p.id AND m.status = 'READY'
               ORDER BY m.created_at ASC LIMIT 1) AS primary_media_id
       FROM posts p JOIN creator_profiles cp ON cp.user_id = p.author_id
       WHERE p.status = 'PUBLISHED'
         AND cp.status IN ('ACTIVE', 'PAYMENT_DUE')
         AND (p.content_rating = 'GENERAL' OR ? IS NOT NULL)
       ORDER BY p.published_at DESC LIMIT 100`,
  )
    .bind(user.adultDeclaredAt)
    .all();
  return c.json({ posts: posts.results });
});

mediaRoutes.get('/v1/media/:assetId/access', authenticate, async (c) => {
  const user = currentUser(c);
  const assetId = c.req.param('assetId');
  if (!assetId) return c.json({ error: 'Media identifier is required' }, 400);
  const access = await authorizeAsset(c.env.DB, assetId, user);
  if (!access.asset) return c.json({ error: 'Media unavailable' }, 404);

  const requestIp = readClientIp(c.req.raw);
  const userAgent = c.req.header('User-Agent') ?? undefined;
  const ipHash = await hashPii(requestIp, c.env);
  const userAgentHash = await hashPii(userAgent, c.env);
  await c.env.DB.prepare(
    `INSERT INTO media_access_events (id, media_asset_id, user_id, decision, ip_hash, user_agent_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id(), assetId, user.id, access.decision, ipHash ?? null, userAgentHash ?? null, now())
    .run();

  if (access.decision !== 'ALLOWED') return c.json({ error: 'Media access denied' }, 403);

  const token = await issueMediaToken({ assetId, userId: user.id }, c.env.JWT_SECRET, 60);
  return c.json({
    media: {
      kind: access.asset.kind.toLowerCase(),
      contentType: access.asset.contentType,
      url: `${c.env.API_ORIGIN}/v1/media/${assetId}/stream?token=${encodeURIComponent(token)}`,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      expiresInSeconds: 60,
    },
    watermark: {
      telegramId: user.telegramId,
      username: user.username,
    },
  });
});

mediaRoutes.get('/v1/media/:assetId/stream', async (c) => {
  const token = c.req.query('token');
  if (!token) return c.json({ error: 'Media token required' }, 401);
  const payload = await verifyMediaToken(token, c.env.JWT_SECRET);
  const assetId = c.req.param('assetId');
  if (!assetId || !payload || payload.assetId !== assetId) {
    return c.json({ error: 'Media token expired or invalid' }, 401);
  }

  const user = await loadUserForMedia(c.env.DB, payload.userId);
  if (!user) return c.json({ error: 'Account unavailable' }, 401);
  const access = await authorizeAsset(c.env.DB, assetId, user);
  if (!access.asset || access.decision !== 'ALLOWED')
    return c.json({ error: 'Media access denied' }, 403);

  const head = await c.env.MEDIA.head(access.asset.objectKey);
  if (!head) return c.json({ error: 'Media object not found' }, 404);
  const requestedRange = parseRange(c.req.header('Range'));
  if (requestedRange && requestedRange.start >= head.size) {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${head.size}` },
    });
  }
  const range = requestedRange
    ? { start: requestedRange.start, end: Math.min(requestedRange.end, head.size - 1) }
    : undefined;
  const object = await c.env.MEDIA.get(
    access.asset.objectKey,
    range ? { range: { offset: range.start, length: range.end - range.start + 1 } } : undefined,
  );
  if (!object?.body) return c.json({ error: 'Media object not found' }, 404);

  const headers = new Headers({
    'Content-Type': access.asset.contentType,
    'Cache-Control': 'no-store, private, max-age=0',
    'Accept-Ranges': 'bytes',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  });
  if (range) {
    headers.set('Content-Range', `bytes ${range.start}-${range.end}/${head.size}`);
    headers.set('Content-Length', String(range.end - range.start + 1));
    return new Response(object.body, { status: 206, headers });
  }
  headers.set('Content-Length', String(object.size));
  return new Response(object.body, { headers });
});

mediaRoutes.post('/v1/media/:assetId/security-events', authenticate, async (c) => {
  const user = currentUser(c);
  const payload = requireJsonObject(await c.req.json().catch(() => undefined));
  const event = payload?.event;
  if (
    ![
      'context_menu_blocked',
      'drag_blocked',
      'keyboard_shortcut_blocked',
      'print_screen_attempted',
      'source_expired',
    ].includes(String(event))
  ) {
    return c.json({ error: 'Invalid security event' }, 400);
  }

  const assetId = c.req.param('assetId');
  if (!assetId) return c.json({ error: 'Media identifier is required' }, 400);
  const access = await authorizeAsset(c.env.DB, assetId, user);
  if (!access.asset || access.decision !== 'ALLOWED')
    return c.json({ error: 'Media access denied' }, 403);
  await audit(c.env.DB, {
    actorUserId: user.id,
    action: `MEDIA_SECURITY_SIGNAL_${String(event).toUpperCase()}`,
    entityType: 'media_asset',
    entityId: access.asset.id,
    ipHash: await hashPii(readClientIp(c.req.raw), c.env),
  });
  return c.json({ accepted: true });
});

type AuthorizedAsset = {
  decision:
    'ALLOWED' | 'DENIED' | 'NOT_ENTITLED' | 'CREATOR_SUSPENDED' | 'ADULT_DECLARATION_REQUIRED';
  asset?: {
    id: string;
    objectKey: string;
    contentType: string;
    kind: 'IMAGE' | 'VIDEO' | 'AUDIO';
  };
};

async function authorizeAsset(
  db: D1Database,
  assetId: string,
  user: CurrentUser,
): Promise<AuthorizedAsset> {
  const asset = await db
    .prepare(
      `SELECT m.id, m.object_key, m.content_type, m.kind, p.id AS post_id, p.author_id, p.access_type,
              p.content_rating, p.included_in_subscription, p.status AS post_status,
              cp.status AS creator_status
       FROM media_assets m
       JOIN posts p ON p.id = m.post_id
       JOIN creator_profiles cp ON cp.user_id = p.author_id
       WHERE m.id = ? AND m.status = 'READY' LIMIT 1`,
    )
    .bind(assetId)
    .first<{
      id: string;
      object_key: string;
      content_type: string;
      kind: 'IMAGE' | 'VIDEO' | 'AUDIO';
      post_id: string;
      author_id: string;
      access_type: 'FREE' | 'SUBSCRIBERS' | 'PPV';
      content_rating: 'GENERAL' | '18_PLUS';
      included_in_subscription: number;
      post_status: string;
      creator_status: string;
    }>();
  if (!asset || asset.post_status !== 'PUBLISHED') return { decision: 'DENIED' };

  const normalized = {
    id: asset.id,
    objectKey: asset.object_key,
    contentType: asset.content_type,
    kind: asset.kind,
  } as const;

  if (!['ACTIVE', 'PAYMENT_DUE'].includes(asset.creator_status)) {
    return { decision: 'CREATOR_SUSPENDED', asset: normalized };
  }
  if (asset.content_rating === '18_PLUS' && !user.adultDeclaredAt) {
    return { decision: 'ADULT_DECLARATION_REQUIRED', asset: normalized };
  }
  if (asset.author_id === user.id || asset.access_type === 'FREE') {
    return { decision: 'ALLOWED', asset: normalized };
  }

  const subscription = await db
    .prepare(
      `SELECT id FROM subscriptions
       WHERE subscriber_id = ? AND creator_id = ? AND status = 'ACTIVE' AND current_period_end > ? LIMIT 1`,
    )
    .bind(user.id, asset.author_id, now())
    .first<{ id: string }>();
  if (asset.access_type === 'SUBSCRIBERS' && subscription)
    return { decision: 'ALLOWED', asset: normalized };
  if (asset.access_type === 'PPV' && asset.included_in_subscription && subscription) {
    return { decision: 'ALLOWED', asset: normalized };
  }

  if (asset.access_type === 'PPV') {
    const entitlement = await db
      .prepare(
        `SELECT id FROM post_entitlements
         WHERE post_id = ? AND buyer_id = ? AND revoked_at IS NULL LIMIT 1`,
      )
      .bind(asset.post_id, user.id)
      .first<{ id: string }>();
    if (entitlement) return { decision: 'ALLOWED', asset: normalized };
  }

  return { decision: 'NOT_ENTITLED', asset: normalized };
}

async function loadUserForMedia(db: D1Database, userId: string): Promise<CurrentUser | undefined> {
  const user = await db
    .prepare(
      `SELECT id, telegram_id, username, status, adult_declared_at, terms_accepted_at, session_version
       FROM users WHERE id = ? LIMIT 1`,
    )
    .bind(userId)
    .first<{
      id: string;
      telegram_id: string;
      username: string | null;
      status: CurrentUser['status'];
      adult_declared_at: string | null;
      terms_accepted_at: string | null;
      session_version: number;
    }>();
  if (!user || user.status !== 'ACTIVE') return undefined;
  return {
    id: user.id,
    telegramId: user.telegram_id,
    username: user.username ?? undefined,
    status: user.status,
    adultDeclaredAt: user.adult_declared_at,
    termsAcceptedAt: user.terms_accepted_at,
    sessionVersion: user.session_version,
    roles: [],
  };
}

function parseRange(header: string | undefined): { start: number; end: number } | undefined {
  if (!header) return undefined;
  const match = /^bytes=(\d+)-(\d*)$/.exec(header);
  if (!match) return undefined;
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : Number.MAX_SAFE_INTEGER;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start) {
    return undefined;
  }
  return { start, end };
}
