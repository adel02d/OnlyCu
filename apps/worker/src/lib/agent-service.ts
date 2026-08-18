import type { Bindings } from '../env';
import { handleAgentTurn, type AgentChannel, type AgentReply, welcomeMessage } from './agent';
import {
  loadCatalog,
  loadConversation,
  loadConversationById,
  loadZones,
  recordChannelEvent,
  recordMessage,
  saveConversation,
  saveOrder,
  type StoredConversation,
  type StoredOrder,
} from './agent-store';

export type AgentTurnOutput = {
  conversation: StoredConversation;
  replies: AgentReply[];
  order?: StoredOrder;
};

export async function runAgentTurn(
  env: Bindings,
  input: {
    channel: AgentChannel;
    externalUserId: string;
    text: string;
    displayName?: string;
    conversationId?: string;
    eventId?: string;
  },
): Promise<AgentTurnOutput> {
  if (input.eventId) {
    const accepted = await recordChannelEvent(env.DB, input.channel, input.eventId);
    if (!accepted) {
      const existing =
        (input.conversationId
          ? await loadConversationById(env.DB, input.conversationId)
          : undefined) ?? (await loadConversation(env.DB, input.channel, input.externalUserId));
      if (existing) {
        return { conversation: existing, replies: [] };
      }
    }
  }

  const [catalog, zones] = await Promise.all([loadCatalog(env.DB), loadZones(env.DB)]);
  const previous =
    (input.conversationId ? await loadConversationById(env.DB, input.conversationId) : undefined) ??
    (await loadConversation(env.DB, input.channel, input.externalUserId));

  const result = handleAgentTurn(input.text, {
    catalog,
    zones,
    stage: previous?.stage ?? 'NEW',
    draft: previous?.draft ?? {},
    status: previous?.status ?? 'OPEN',
    displayName: input.displayName ?? previous?.displayName,
  });

  const conversation = await saveConversation(env.DB, {
    id: previous?.id,
    channel: input.channel,
    externalUserId: previous?.externalUserId ?? input.externalUserId,
    displayName: input.displayName ?? previous?.displayName,
    stage: result.stage,
    draft: result.draft,
    status: result.status,
  });

  await recordMessage(env.DB, {
    conversationId: conversation.id,
    direction: 'IN',
    body: input.text,
  });

  const replies = result.replies;
  for (const reply of replies) {
    await recordMessage(env.DB, {
      conversationId: conversation.id,
      direction: 'OUT',
      body: reply.type === 'image' ? (reply.caption ?? reply.url) : reply.text,
      payload: reply,
    });
  }

  const order = result.order
    ? await saveOrder(env.DB, { conversation, order: result.order })
    : undefined;
  return { conversation, replies, order };
}

export function openingReply(displayName?: string): AgentReply[] {
  return [{ type: 'text', text: welcomeMessage(displayName) }];
}
