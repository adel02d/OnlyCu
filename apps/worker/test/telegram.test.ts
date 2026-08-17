import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { TelegramValidationError, validateTelegramInitData } from '../src/lib/telegram';

const BOT_TOKEN = 'test-bot-token';

function sign(values: Record<string, string>) {
  const dataCheckString = Object.entries(values)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = createHmac('sha256', secret).update(dataCheckString).digest('hex');
  return new URLSearchParams({ ...values, hash }).toString();
}

describe('Telegram initData validation', () => {
  it('accepts a fresh signed identity', async () => {
    const raw = sign({
      auth_date: String(Math.floor(Date.now() / 1_000)),
      user: JSON.stringify({ id: 123456, first_name: 'Ana', username: 'ana' }),
    });

    await expect(validateTelegramInitData(raw, BOT_TOKEN)).resolves.toMatchObject({
      telegramId: '123456',
      firstName: 'Ana',
      username: 'ana',
    });
  });

  it('rejects a tampered payload', async () => {
    const raw = sign({
      auth_date: String(Math.floor(Date.now() / 1_000)),
      user: JSON.stringify({ id: 123456, first_name: 'Ana' }),
    }).replace('Ana', 'Mallory');

    await expect(validateTelegramInitData(raw, BOT_TOKEN)).rejects.toBeInstanceOf(
      TelegramValidationError,
    );
  });

  it('rejects stale data', async () => {
    const raw = sign({
      auth_date: String(Math.floor(Date.now() / 1_000) - 301),
      user: JSON.stringify({ id: 123456, first_name: 'Ana' }),
    });

    await expect(validateTelegramInitData(raw, BOT_TOKEN)).rejects.toBeInstanceOf(
      TelegramValidationError,
    );
  });
});
