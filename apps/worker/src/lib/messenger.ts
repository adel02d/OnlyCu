import type { Bindings } from '../env';
import type { AgentReply } from './agent';
import { resolveReplyMedia } from './agent-store';

const DEFAULT_GRAPH = 'v21.0';

export type MessengerInbound = {
  messageId: string;
  senderId: string;
  text: string;
};

export function parseMessengerPayload(payload: unknown): MessengerInbound[] {
  if (!payload || typeof payload !== 'object') return [];
  const root = payload as {
    entry?: Array<{
      messaging?: Array<{
        sender?: { id?: string };
        message?: { mid?: string; text?: string; is_echo?: boolean };
      }>;
    }>;
  };
  const inbound: MessengerInbound[] = [];
  for (const entry of root.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      if (event.message?.is_echo) continue;
      const text = event.message?.text;
      const senderId = event.sender?.id;
      const messageId = event.message?.mid;
      if (!text || !senderId || !messageId) continue;
      inbound.push({ messageId, senderId, text });
    }
  }
  return inbound;
}

export async function sendMessengerReplies(
  env: Bindings,
  recipientId: string,
  replies: AgentReply[],
): Promise<void> {
  if (!env.MESSENGER_PAGE_ACCESS_TOKEN) return;
  for (const reply of replies) {
    if (reply.type === 'image') {
      await sendMessenger(env, {
        recipient: { id: recipientId },
        messaging_type: 'RESPONSE',
        message: {
          attachment: {
            type: 'image',
            payload: { url: reply.url, is_reusable: true },
          },
        },
      });
      continue;
    }
    await sendMessenger(env, {
      recipient: { id: recipientId },
      messaging_type: 'RESPONSE',
      message: { text: reply.text.slice(0, 2000) },
    });
  }
}

async function sendMessenger(env: Bindings, body: Record<string, unknown>): Promise<void> {
  const version = env.META_GRAPH_API_VERSION || DEFAULT_GRAPH;
  const response = await fetch(`https://graph.facebook.com/${version}/me/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.MESSENGER_PAGE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error(
      JSON.stringify({
        channel: 'messenger',
        status: response.status,
        detail: detail.slice(0, 300),
      }),
    );
  }
}
