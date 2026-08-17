import {
  base64UrlDecode,
  base64UrlEncode,
  constantTimeEqual,
  hmac,
  now,
  toArrayBuffer,
} from './base';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

type SessionPayload = {
  sub: string;
  telegramId: string;
  exp: number;
  iat: number;
  version: number;
};

type MediaPayload = {
  assetId: string;
  userId: string;
  exp: number;
};

export async function issueSessionToken(
  payload: Omit<SessionPayload, 'exp' | 'iat'>,
  secret: string,
  lifetimeSeconds = 900,
): Promise<string> {
  const current = Math.floor(Date.now() / 1_000);
  return signCompact({ ...payload, iat: current, exp: current + lifetimeSeconds }, secret);
}

export async function verifySessionToken(
  token: string,
  secret: string,
): Promise<SessionPayload | undefined> {
  const payload = await verifyCompact<SessionPayload>(token, secret);
  return payload && typeof payload.sub === 'string' && typeof payload.telegramId === 'string'
    ? payload
    : undefined;
}

export async function issueMediaToken(
  payload: Omit<MediaPayload, 'exp'>,
  secret: string,
  lifetimeSeconds = 60,
): Promise<string> {
  return signCompact({ ...payload, exp: Math.floor(Date.now() / 1_000) + lifetimeSeconds }, secret);
}

export async function verifyMediaToken(
  token: string,
  secret: string,
): Promise<MediaPayload | undefined> {
  const payload = await verifyCompact<MediaPayload>(token, secret);
  return payload && typeof payload.assetId === 'string' && typeof payload.userId === 'string'
    ? payload
    : undefined;
}

async function signCompact(payload: object, secret: string): Promise<string> {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const content = `${header}.${body}`;
  return `${content}.${base64UrlEncode(await hmac(content, secret))}`;
}

async function verifyCompact<T extends { exp: number }>(
  token: string,
  secret: string,
): Promise<T | undefined> {
  const [header, body, signature, extra] = token.split('.');
  if (!header || !body || !signature || extra) return undefined;

  let parsedHeader: { alg?: string; typ?: string };
  let payload: T;
  try {
    parsedHeader = JSON.parse(decoder.decode(base64UrlDecode(header))) as {
      alg?: string;
      typ?: string;
    };
    payload = JSON.parse(decoder.decode(base64UrlDecode(body))) as T;
  } catch {
    return undefined;
  }

  if (
    parsedHeader.alg !== 'HS256' ||
    parsedHeader.typ !== 'JWT' ||
    payload.exp <= Math.floor(Date.now() / 1_000)
  ) {
    return undefined;
  }

  const expected = await hmac(`${header}.${body}`, secret);
  if (!constantTimeEqual(expected, base64UrlDecode(signature))) return undefined;
  return payload;
}

/** Encrypt recipient details at rest; only the Worker decrypts them for an authorized buyer. */
export async function encryptSecret(value: string, base64Key: string): Promise<string> {
  const key = await aesKey(base64Key);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(encoder.encode(value)),
  );
  return `${base64UrlEncode(iv)}.${base64UrlEncode(ciphertext)}`;
}

export async function decryptSecret(value: string, base64Key: string): Promise<string | undefined> {
  const [ivEncoded, ciphertextEncoded, extra] = value.split('.');
  if (!ivEncoded || !ciphertextEncoded || extra) return undefined;
  try {
    const key = await aesKey(base64Key);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(base64UrlDecode(ivEncoded)) },
      key,
      toArrayBuffer(base64UrlDecode(ciphertextEncoded)),
    );
    return decoder.decode(plaintext);
  } catch {
    return undefined;
  }
}

async function aesKey(base64Key: string): Promise<CryptoKey> {
  const raw = base64UrlDecode(base64Key);
  if (raw.byteLength !== 32)
    throw new Error('PAYMENT_DETAILS_ENCRYPTION_KEY must be a base64url 32-byte key');
  return crypto.subtle.importKey('raw', toArrayBuffer(raw), { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

export function isoNow() {
  return now();
}
