import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { readMetaChallenge, verifyMetaSignature } from '../src/lib/meta-signature';

describe('Meta webhook verification', () => {
  it('accepts a valid hub challenge', () => {
    const url = new URL(
      'https://example.com/v1/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=secret&hub.challenge=12345',
    );
    expect(readMetaChallenge(url, 'secret')).toEqual({ ok: true, challenge: '12345' });
  });

  it('rejects a wrong verify token', () => {
    const url = new URL(
      'https://example.com/v1/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=12345',
    );
    expect(readMetaChallenge(url, 'secret')).toEqual({ ok: false });
  });

  it('accepts a valid X-Hub-Signature-256', async () => {
    const body = '{"object":"page"}';
    const digest = createHmac('sha256', 'app-secret').update(body).digest('hex');
    await expect(verifyMetaSignature(body, `sha256=${digest}`, 'app-secret')).resolves.toBe(true);
  });

  it('rejects a tampered signature', async () => {
    const body = '{"object":"page"}';
    await expect(verifyMetaSignature(body, 'sha256=deadbeef', 'app-secret')).resolves.toBe(false);
  });
});
