import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type WASocket,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const authDir = path.resolve(rootDir, '../.auth');
const workerOrigin = process.env.WORKER_ORIGIN ?? 'http://127.0.0.1:8787';
const bridgeSecret = process.env.BRIDGE_SECRET ?? 'energixcu-local-bridge';

export type BridgeSnapshot = {
  status: 'starting' | 'qr' | 'connected' | 'logged_out' | 'error';
  qrDataUrl?: string;
  pairingCode?: string;
  phone?: string;
  error?: string;
  mode: 'whatsapp-web';
};

let snapshot: BridgeSnapshot = { status: 'starting', mode: 'whatsapp-web' };
let sock: WASocket | undefined;
let starting: Promise<void> | undefined;

export function getBridgeSnapshot(): BridgeSnapshot {
  return snapshot;
}

export async function restartWhatsApp(): Promise<void> {
  if (starting) return starting;
  starting = startSocket().finally(() => {
    starting = undefined;
  });
  return starting;
}

export async function unlinkWhatsApp(): Promise<void> {
  try {
    await sock?.logout();
  } catch {
    // ignore
  }
  sock?.end(undefined);
  sock = undefined;
  await rm(authDir, { recursive: true, force: true });
  snapshot = { status: 'logged_out', mode: 'whatsapp-web' };
  await restartWhatsApp();
}

export async function requestPairing(rawPhone: string): Promise<string> {
  const phone = rawPhone.replace(/\D/g, '');
  if (phone.length < 8) throw new Error('Escribe el número con código de país, sin + ni espacios.');
  if (!sock) await restartWhatsApp();
  if (!sock) throw new Error('El puente de WhatsApp aún no arrancó.');
  const code = await sock.requestPairingCode(phone);
  snapshot = {
    ...snapshot,
    pairingCode: code,
    status: snapshot.status === 'connected' ? 'connected' : 'qr',
  };
  return code;
}

async function startSocket(): Promise<void> {
  await mkdir(authDir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({
    version: [2, 3000, 1027934701] as [number, number, number],
  }));

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    browser: ['EnergixCu Jose', 'Chrome', '1.0'],
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      snapshot = {
        status: 'qr',
        qrDataUrl: await QRCode.toDataURL(qr, { margin: 1, width: 280 }),
        pairingCode: snapshot.pairingCode,
        mode: 'whatsapp-web',
      };
    }
    if (connection === 'open') {
      snapshot = {
        status: 'connected',
        phone: sock?.user?.id?.split(':')[0],
        mode: 'whatsapp-web',
      };
    }
    if (connection === 'close') {
      const err = lastDisconnect?.error as
        { output?: { statusCode?: number }; message?: string } | undefined;
      const reason = err?.output?.statusCode;
      console.error('WhatsApp connection closed', reason, err?.message ?? lastDisconnect?.error);
      sock = undefined;
      if (reason === DisconnectReason.loggedOut) {
        snapshot = { status: 'logged_out', mode: 'whatsapp-web' };
        await rm(authDir, { recursive: true, force: true });
        setTimeout(() => {
          void restartWhatsApp();
        }, 1500);
        return;
      }
      snapshot = {
        status: 'error',
        error: err?.message ?? 'Se cerró la sesión. Reintentando…',
        mode: 'whatsapp-web',
      };
      setTimeout(() => {
        void restartWhatsApp();
      }, 4000);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const message of messages) {
      if (message.key.fromMe) continue;
      const remote = message.key.remoteJid;
      if (!remote || remote === 'status@broadcast' || remote.endsWith('@g.us')) continue;
      const text = extractText(message.message);
      if (!text) continue;
      try {
        const replies = await askJose(remote, text, message.pushName);
        for (const reply of replies) {
          if (reply.type === 'image') {
            await sock?.sendMessage(remote, {
              image: { url: reply.url },
              caption: reply.caption ?? '',
            });
            continue;
          }
          await sock?.sendMessage(remote, { text: reply.text });
        }
      } catch (error) {
        snapshot = {
          ...snapshot,
          error: error instanceof Error ? error.message : 'Fallo al hablar con Jose',
        };
      }
    }
  });
}

function extractText(message: unknown): string | undefined {
  if (!message || typeof message !== 'object') return undefined;
  const value = message as {
    conversation?: string;
    extendedTextMessage?: { text?: string };
    imageMessage?: { caption?: string };
    buttonsResponseMessage?: { selectedDisplayText?: string };
    listResponseMessage?: { title?: string };
  };
  return (
    value.conversation ??
    value.extendedTextMessage?.text ??
    value.imageMessage?.caption ??
    value.buttonsResponseMessage?.selectedDisplayText ??
    value.listResponseMessage?.title
  );
}

async function askJose(from: string, text: string, displayName?: string | null) {
  const response = await fetch(`${workerOrigin}/v1/agent/bridge/turn`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bridgeSecret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: from.replace(/@s\.whatsapp\.net$/, ''),
      text,
      displayName: displayName ?? undefined,
    }),
  });
  if (!response.ok) {
    throw new Error(`Jose no respondió (${response.status})`);
  }
  const payload = (await response.json()) as {
    replies?: Array<
      | { type: 'text'; text: string }
      | { type: 'ticket'; text: string }
      | { type: 'image'; url: string; caption?: string }
    >;
  };
  return payload.replies ?? [];
}
