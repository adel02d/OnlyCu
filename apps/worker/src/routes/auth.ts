import { Hono } from 'hono';

import type { AppEnv, CurrentUser } from '../env';
import { authenticate, currentUser, issueUserSession, loadCurrentUser } from '../lib/auth';
import { id, now, requireJsonObject, string } from '../lib/base';
import { parsePositiveAmount, decimalText } from '../lib/money';
import { TelegramValidationError, validateTelegramInitData } from '../lib/telegram';

export const authRoutes = new Hono<AppEnv>();

authRoutes.post('/v1/auth/telegram', async (c) => {
  const payload = requireJsonObject(await c.req.json().catch(() => undefined));
  const initData = string(payload?.initData, 16_384);
  if (!initData) return c.json({ error: 'initData is required' }, 400);

  try {
    const identity = await validateTelegramInitData(initData, c.env.TELEGRAM_BOT_TOKEN);
    const timestamp = now();
    const candidateId = id();

    await c.env.DB.prepare(
      `INSERT INTO users (
          id, telegram_id, username, first_name, last_name, language_code, status,
          last_seen_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)
        ON CONFLICT(telegram_id) DO UPDATE SET
          username = excluded.username,
          first_name = excluded.first_name,
          last_name = excluded.last_name,
          language_code = excluded.language_code,
          last_seen_at = excluded.last_seen_at,
          updated_at = excluded.updated_at`,
    )
      .bind(
        candidateId,
        identity.telegramId,
        identity.username ?? null,
        identity.firstName,
        identity.lastName ?? null,
        identity.languageCode ?? null,
        timestamp,
        timestamp,
        timestamp,
      )
      .run();

    const stored = await c.env.DB.prepare('SELECT id FROM users WHERE telegram_id = ? LIMIT 1')
      .bind(identity.telegramId)
      .first<{ id: string }>();
    if (!stored) throw new Error('User could not be created');

    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO user_roles (user_id, role, assigned_at)
         VALUES (?, 'MEMBER', ?)`,
    )
      .bind(stored.id, timestamp)
      .run();

    const user = await loadCurrentUser(c.env.DB, stored.id);
    if (!user) throw new Error('User session could not be loaded');
    const accessToken = await issueUserSession(c.env, user);

    return c.json({
      accessToken,
      expiresInSeconds: 900,
      user: serializeUser(user, identity.username, identity.firstName, identity.lastName),
    });
  } catch (error) {
    if (error instanceof TelegramValidationError) {
      return c.json({ error: 'Telegram authentication failed' }, 401);
    }
    console.error('Telegram authentication error', error);
    return c.json({ error: 'Unable to authenticate' }, 500);
  }
});

authRoutes.get('/v1/auth/me', authenticate, async (c) => {
  const user = currentUser(c);
  const profile = await c.env.DB.prepare(
    'SELECT handle, display_name, status FROM creator_profiles WHERE user_id = ? LIMIT 1',
  )
    .bind(user.id)
    .first<{ handle: string; display_name: string; status: string }>();

  return c.json({
    user: {
      id: user.id,
      telegramId: user.telegramId,
      roles: user.roles,
      termsAcceptedAt: user.termsAcceptedAt,
      adultDeclaredAt: user.adultDeclaredAt,
      creator: profile
        ? { handle: profile.handle, displayName: profile.display_name, status: profile.status }
        : undefined,
    },
  });
});

authRoutes.post('/v1/account/complete-registration', authenticate, async (c) => {
  const payload = requireJsonObject(await c.req.json().catch(() => undefined));
  if (payload?.acceptTerms !== true || payload?.declareAdult !== true) {
    return c.json({ error: 'Terms acceptance and 18+ self-declaration are required' }, 400);
  }

  const user = currentUser(c);
  const timestamp = now();
  await c.env.DB.prepare(
    `UPDATE users
       SET terms_accepted_at = COALESCE(terms_accepted_at, ?),
           adult_declared_at = COALESCE(adult_declared_at, ?),
           adult_declaration_version = ?,
           updated_at = ?
       WHERE id = ?`,
  )
    .bind(timestamp, timestamp, c.env.ADULT_DECLARATION_VERSION, timestamp, user.id)
    .run();

  return c.json({ accepted: true, adultDeclarationVersion: c.env.ADULT_DECLARATION_VERSION });
});

authRoutes.post('/v1/creator/onboard', authenticate, async (c) => {
  const user = currentUser(c);
  if (!user.termsAcceptedAt || !user.adultDeclaredAt) {
    return c.json({ error: 'Complete terms acceptance and 18+ declaration first' }, 412);
  }

  const payload = requireJsonObject(await c.req.json().catch(() => undefined));
  const handle = string(payload?.handle, 32)?.toLowerCase();
  const displayName = string(payload?.displayName, 128);
  const currency = payload?.subscriptionCurrency;
  const scope = payload?.contentScope;
  if (!handle || !/^[a-z0-9_]{3,32}$/.test(handle) || !displayName) {
    return c.json({ error: 'A valid handle and display name are required' }, 400);
  }
  if (!['CUP', 'USD', 'USDT', 'TON'].includes(String(currency))) {
    return c.json({ error: 'Invalid subscription currency' }, 400);
  }
  if (!['GENERAL', '18_PLUS'].includes(String(scope))) {
    return c.json({ error: 'Invalid content scope' }, 400);
  }

  let price;
  try {
    price = parsePositiveAmount(payload?.subscriptionPrice, 'Subscription price');
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Invalid subscription price' },
      400,
    );
  }

  const timestamp = now();
  const nextBillingAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000).toISOString();
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO creator_profiles (
            user_id, handle, display_name, subscription_price, subscription_currency,
            content_scope, status, billing_anchor_at, next_billing_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET
            handle = excluded.handle,
            display_name = excluded.display_name,
            subscription_price = excluded.subscription_price,
            subscription_currency = excluded.subscription_currency,
            content_scope = excluded.content_scope,
            updated_at = excluded.updated_at`,
      ).bind(
        user.id,
        handle,
        displayName,
        decimalText(price),
        currency,
        scope,
        timestamp,
        nextBillingAt,
        timestamp,
        timestamp,
      ),
      c.env.DB.prepare(
        `INSERT OR IGNORE INTO user_roles (user_id, role, assigned_at) VALUES (?, 'CREATOR', ?)`,
      ).bind(user.id, timestamp),
    ]);
  } catch {
    return c.json({ error: 'Handle is already in use' }, 409);
  }

  return c.json({ handle, nextBillingAt }, 201);
});

function serializeUser(
  user: CurrentUser,
  username?: string,
  firstName?: string,
  lastName?: string,
) {
  return {
    id: user.id,
    telegramId: user.telegramId,
    username,
    displayName: [firstName, lastName].filter(Boolean).join(' '),
    status: user.status,
    roles: user.roles,
    termsAcceptedAt: user.termsAcceptedAt,
    adultDeclaredAt: user.adultDeclaredAt,
    creatorStatus: user.creatorStatus,
  };
}
