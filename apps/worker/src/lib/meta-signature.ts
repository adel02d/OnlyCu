import { constantTimeEqual, hmacHex } from './base';

export async function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  appSecret: string | undefined,
): Promise<boolean> {
  if (!appSecret) return false;
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const expectedHex = await hmacHex(rawBody, appSecret);
  const providedHex = signatureHeader.slice('sha256='.length).trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(providedHex) || providedHex.length !== expectedHex.length) return false;
  return constantTimeEqual(hexToBytes(expectedHex), hexToBytes(providedHex));
}

export function readMetaChallenge(
  url: URL,
  verifyToken: string | undefined,
): { ok: true; challenge: string } | { ok: false } {
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  if (mode !== 'subscribe' || !challenge || !verifyToken || token !== verifyToken) {
    return { ok: false };
  }
  return { ok: true, challenge };
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}
