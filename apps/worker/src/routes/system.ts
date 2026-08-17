import { Hono } from 'hono';

import type { AppEnv } from '../env';
import { authenticate, currentUser } from '../lib/auth';
import { constantTimeEqual, id, now } from '../lib/base';

export const systemRoutes = new Hono<AppEnv>();

systemRoutes.get('/healthz', (c) => c.json({ status: 'ok' }));

systemRoutes.get('/readyz', async (c) => {
  try {
    await c.env.DB.prepare('SELECT 1 AS ok').first();
    return c.json({ status: 'ready' });
  } catch {
    return c.json({ status: 'not_ready' }, 503);
  }
});

systemRoutes.get('/v1/notifications', authenticate, async (c) => {
  const user = currentUser(c);
  const notifications = await c.env.DB.prepare(
    `SELECT id, type, title, body, entity_type, entity_id, read_at, created_at
       FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`,
  )
    .bind(user.id)
    .all();
  return c.json({ notifications: notifications.results });
});

systemRoutes.post('/v1/notifications/:notificationId/read', authenticate, async (c) => {
  const user = currentUser(c);
  await c.env.DB.prepare(`UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?`)
    .bind(now(), c.req.param('notificationId'), user.id)
    .run();
  return c.json({ read: true });
});

/**
 * Optional Bot API webhook. It stores the chat id after /start so future
 * invoice reminders can be sent via Telegram as well as in-app notifications.
 */
systemRoutes.post('/v1/telegram/webhook', async (c) => {
  const supplied = c.req.header('X-Telegram-Bot-Api-Secret-Token');
  if (
    !supplied ||
    !constantTimeEqual(
      new TextEncoder().encode(supplied),
      new TextEncoder().encode(c.env.TELEGRAM_WEBHOOK_SECRET),
    )
  ) {
    return c.json({ error: 'Unauthorized webhook' }, 401);
  }

  const update = (await c.req.json().catch(() => undefined)) as
    | {
        message?: {
          chat?: { id?: number; type?: string };
          from?: {
            id?: number;
            username?: string;
            first_name?: string;
            last_name?: string;
            language_code?: string;
          };
          text?: string;
        };
      }
    | undefined;
  const message = update?.message;
  const from = message?.from;
  const chat = message?.chat;
  if (!from?.id || !chat?.id || chat.type !== 'private') return c.json({ ok: true });

  const timestamp = now();
  const telegramId = String(from.id);
  const userId = id();
  await c.env.DB.prepare(
    `INSERT INTO users (
        id, telegram_id, telegram_chat_id, username, first_name, last_name, language_code,
        status, last_seen_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)
      ON CONFLICT(telegram_id) DO UPDATE SET
        telegram_chat_id = excluded.telegram_chat_id,
        username = excluded.username,
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        language_code = excluded.language_code,
        last_seen_at = excluded.last_seen_at,
        updated_at = excluded.updated_at`,
  )
    .bind(
      userId,
      telegramId,
      String(chat.id),
      from.username ?? null,
      from.first_name?.slice(0, 128) ?? 'Telegram user',
      from.last_name?.slice(0, 128) ?? null,
      from.language_code?.slice(0, 16) ?? null,
      timestamp,
      timestamp,
      timestamp,
    )
    .run();
  const stored = await c.env.DB.prepare('SELECT id FROM users WHERE telegram_id = ? LIMIT 1')
    .bind(telegramId)
    .first<{ id: string }>();
  if (stored) {
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO user_roles (user_id, role, assigned_at) VALUES (?, 'MEMBER', ?)`,
    )
      .bind(stored.id, timestamp)
      .run();
  }

  if (message?.text?.startsWith('/start')) {
    await sendTelegramMessage(
      c.env,
      chat.id,
      'Bienvenido a OnlyCu. Usa el botón de menú para abrir la Mini App.',
    );
  }
  return c.json({ ok: true });
});

export async function sendTelegramMessage(
  env: AppEnv['Bindings'],
  chatId: number | string,
  text: string,
) {
  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    },
  );
  if (!response.ok) throw new Error('Telegram notification failed');
}
