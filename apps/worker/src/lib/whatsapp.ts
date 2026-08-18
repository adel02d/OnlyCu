import type { Bindings } from '../env';
import type { AgentReply } from './agent';
import { resolveReplyMedia } from './agent-store';

const DEFAULT_GRAPH = 'v21.0';

export type WhatsAppInbound = {
  messageId: string;
  from: string;
  text: string;
  profileName?: string;
};

export function parseWhatsAppPayload(payload: unknown): WhatsAppInbound[] {
  if (!payload || typeof payload !== 'object') return [];
  const root = payload as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
          messages?: Array<{
            id?: string;
            from?: string;
            type?: string;
            text?: { body?: string };
            button?: { text?: string };
            interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
          }>;
        };
      }>;
    }>;
  };
  const inbound: WhatsAppInbound[] = [];
  for (const entry of root.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const names = new Map(
        (value?.contacts ?? []).map(
          (contact) => [contact.wa_id ?? '', contact.profile?.name] as const,
        ),
      );
      for (const message of value?.messages ?? []) {
        if (!message.id || !message.from) continue;
        const text =
          message.text?.body ??
          message.button?.text ??
          message.interactive?.button_reply?.title ??
          message.interactive?.list_reply?.title;
        if (!text) continue;
        inbound.push({
          messageId: message.id,
          from: message.from,
          text,
          profileName: names.get(message.from),
        });
      }
    }
  }
  return inbound;
}

export async function sendWhatsAppReplies(
  env: Bindings,
  to: string,
  replies: AgentReply[],
): Promise<void> {
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) return;
  for (const reply of resolveReplyMedia(replies, env.APP_ORIGIN)) {
    if (reply.type === 'image') {
      await sendWhatsApp(env, {
        messaging_product: 'whatsapp',
        to,
        type: 'image',
        image: { link: reply.url, caption: reply.caption ?? '' },
      });
      continue;
    }
    await sendWhatsApp(env, {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { preview_url: false, body: reply.type === 'ticket' ? reply.text : reply.text },
    });
  }
}

async function sendWhatsApp(env: Bindings, body: Record<string, unknown>): Promise<void> {
  const version = env.META_GRAPH_API_VERSION || DEFAULT_GRAPH;
  const response = await fetch(
    `https://graph.facebook.com/${version}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error(
      JSON.stringify({
        channel: 'whatsapp',
        status: response.status,
        detail: detail.slice(0, 300),
      }),
    );
  }
}
