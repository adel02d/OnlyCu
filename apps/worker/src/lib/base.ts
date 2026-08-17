import type { Context } from 'hono';

import type { AppEnv, Bindings } from '../env';

export const CURRENCIES = ['CUP', 'USD', 'USDT', 'TON'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const PAYMENT_METHODS = ['QVAPAY', 'CUP', 'USDT_TRC20', 'USDT_BEP20', 'TON'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const now = () => new Date().toISOString();
export const id = () => crypto.randomUUID();

export function jsonError(c: Context<AppEnv>, status: number, error: string) {
  return c.json({ error, requestId: c.get('requestId') ?? crypto.randomUUID() }, status as 400);
}

export function requireJsonObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function string(value: unknown, max = 500): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim().slice(0, max)
    : undefined;
}

export function isCurrency(value: unknown): value is Currency {
  return typeof value === 'string' && (CURRENCIES as readonly string[]).includes(value);
}

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === 'string' && (PAYMENT_METHODS as readonly string[]).includes(value);
}

export function addDays(value: Date, days: number): string {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString();
}

export function readClientIp(request: Request): string | undefined {
  // Cloudflare sets this at the edge; never trust a browser-provided X-Forwarded-For value.
  return request.headers.get('CF-Connecting-IP') ?? undefined;
}

export async function hashPii(
  value: string | undefined,
  env: Bindings,
): Promise<string | undefined> {
  if (!value) return undefined;
  return hmacHex(value, env.PII_HASH_SECRET);
}

export async function hmacHex(value: string, secret: string): Promise<string> {
  const signature = await hmac(value, secret);
  return [...signature].map((part) => part.toString(16).padStart(2, '0')).join('');
}

export async function hmac(value: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
}

export function base64UrlEncode(input: ArrayBuffer | Uint8Array | string): string {
  const bytes =
    typeof input === 'string'
      ? new TextEncoder().encode(input)
      : input instanceof Uint8Array
        ? input
        : new Uint8Array(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export function base64UrlDecode(input: string): Uint8Array {
  const normalized = input
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(Math.ceil(input.length / 4) * 4, '=');
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let result = 0;
  for (let index = 0; index < left.byteLength; index += 1) result |= left[index]! ^ right[index]!;
  return result === 0;
}
