import { toArrayBuffer, type PaymentMethod } from './base';

export const MAX_PROOF_BYTES = 5 * 1024 * 1024;
export const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

export type UploadedFile = {
  objectKey: string;
  contentType: string;
  byteSize: number;
  sha256: string;
};

export async function storeImageProof(input: {
  bucket: R2Bucket;
  key: string;
  file: File;
}): Promise<UploadedFile> {
  if (input.file.size < 1 || input.file.size > MAX_PROOF_BYTES) {
    throw new Error(`Proof must be between 1 byte and ${MAX_PROOF_BYTES} bytes`);
  }
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const contentType = detectImageType(bytes);
  if (!contentType) throw new Error('Proof must be a JPEG, PNG or WebP image');

  const sha256 = await sha256Hex(bytes);
  await input.bucket.put(input.key, bytes, {
    httpMetadata: {
      contentType,
      cacheControl: 'no-store',
      contentDisposition: 'inline',
    },
    customMetadata: { sha256 },
  });

  return { objectKey: input.key, contentType, byteSize: bytes.byteLength, sha256 };
}

export async function storeCreatorMedia(input: {
  bucket: R2Bucket;
  key: string;
  file: File;
  kind: 'IMAGE' | 'VIDEO' | 'AUDIO';
}): Promise<UploadedFile> {
  if (input.file.size < 1 || input.file.size > MAX_MEDIA_BYTES) {
    throw new Error(`Media must be between 1 byte and ${MAX_MEDIA_BYTES} bytes`);
  }
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const contentType = detectMediaType(bytes);
  if (!contentType || !matchesKind(contentType, input.kind)) {
    throw new Error('Media type or file signature is not allowed');
  }

  const sha256 = await sha256Hex(bytes);
  await input.bucket.put(input.key, bytes, {
    httpMetadata: {
      contentType,
      cacheControl: 'no-store',
      contentDisposition: 'inline',
    },
    customMetadata: { sha256 },
  });

  return { objectKey: input.key, contentType, byteSize: bytes.byteLength, sha256 };
}

export function parseSingleFile(form: FormData): File | undefined {
  const value = form.get('file');
  return value instanceof File ? value : undefined;
}

export function paymentMethodLabel(method: PaymentMethod): string {
  switch (method) {
    case 'QVAPAY':
      return 'QvaPay';
    case 'CUP':
      return 'Transferencia CUP';
    case 'USDT_TRC20':
      return 'USDT (TRC-20)';
    case 'USDT_BEP20':
      return 'USDT (BEP-20)';
    case 'TON':
      return 'TON';
  }
}

function detectImageType(bytes: Uint8Array): string | undefined {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 12 &&
    new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' &&
    new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return undefined;
}

function detectMediaType(bytes: Uint8Array): string | undefined {
  const image = detectImageType(bytes);
  if (image) return image;
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(4, 8)) === 'ftyp') {
    return 'video/mp4';
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return 'video/webm';
  }
  if (bytes.length >= 3 && new TextDecoder().decode(bytes.slice(0, 3)) === 'ID3') {
    return 'audio/mpeg';
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0) {
    return 'audio/mpeg';
  }
  return undefined;
}

function matchesKind(contentType: string, kind: 'IMAGE' | 'VIDEO' | 'AUDIO'): boolean {
  return (
    (kind === 'IMAGE' && contentType.startsWith('image/')) ||
    (kind === 'VIDEO' && contentType.startsWith('video/')) ||
    (kind === 'AUDIO' && contentType.startsWith('audio/'))
  );
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', toArrayBuffer(bytes)));
  return [...digest].map((part) => part.toString(16).padStart(2, '0')).join('');
}
