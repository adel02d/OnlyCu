import { constantTimeEqual, hmac, toArrayBuffer } from './base';

export type TelegramIdentity = {
  telegramId: string;
  firstName: string;
  lastName?: string;
  username?: string;
  languageCode?: string;
};

export class TelegramValidationError extends Error {}

/** Validates the exact raw initData URL-encoded string sent by Telegram. */
export async function validateTelegramInitData(
  raw: string,
  botToken: string,
  maxAgeSeconds = 300,
): Promise<TelegramIdentity> {
  if (!raw || raw.length > 16_384)
    throw new TelegramValidationError('Invalid Telegram initialization data');

  const params = new URLSearchParams(raw);
  const entries: Array<[string, string]> = [];
  params.forEach((value, key) => entries.push([key, value]));
  const seen = new Set<string>();
  for (const [key] of entries) {
    if (seen.has(key)) throw new TelegramValidationError('Ambiguous Telegram initialization data');
    seen.add(key);
  }

  const receivedHash = params.get('hash');
  if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash)) {
    throw new TelegramValidationError('Telegram hash is missing');
  }

  const authDate = params.get('auth_date');
  if (!authDate || !/^\d{1,12}$/.test(authDate))
    throw new TelegramValidationError('Telegram date is invalid');
  const age = Math.floor(Date.now() / 1_000) - Number(authDate);
  if (age > maxAgeSeconds || age < -30)
    throw new TelegramValidationError('Telegram initialization data expired');

  const dataCheckString = entries
    .filter(([key]) => key !== 'hash')
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secret = await hmac(botToken, 'WebAppData');
  const key = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const expected = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, toArrayBuffer(new TextEncoder().encode(dataCheckString))),
  );
  const received = hexToBytes(receivedHash);
  if (!constantTimeEqual(expected, received))
    throw new TelegramValidationError('Telegram signature mismatch');

  const userRaw = params.get('user');
  if (!userRaw) throw new TelegramValidationError('Telegram user is missing');

  let user: Record<string, unknown>;
  try {
    user = JSON.parse(userRaw) as Record<string, unknown>;
  } catch {
    throw new TelegramValidationError('Telegram user payload is invalid');
  }

  const telegramId =
    typeof user.id === 'number' && Number.isSafeInteger(user.id)
      ? String(user.id)
      : typeof user.id === 'string' && /^\d{1,32}$/.test(user.id)
        ? user.id
        : undefined;
  const firstName =
    typeof user.first_name === 'string' ? user.first_name.trim().slice(0, 128) : undefined;
  if (!telegramId || !firstName) throw new TelegramValidationError('Telegram user is invalid');

  return {
    telegramId,
    firstName,
    lastName: optionalString(user.last_name, 128),
    username: optionalString(user.username, 64),
    languageCode: optionalString(user.language_code, 16),
  };
}

function optionalString(value: unknown, max: number): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;
}

function hexToBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}
