import { request } from './api';

export type AgentReply =
  | { type: 'text'; text: string }
  | { type: 'image'; url: string; caption?: string }
  | {
      type: 'ticket';
      text: string;
      order: {
        customerName: string;
        productLabel: string;
        quantity: number;
        address: string;
        paymentMethod: 'EFECTIVO' | 'TRANSFERENCIA';
        ticketText: string;
      };
    };

export type AgentChatResponse = {
  conversationId: string;
  stage: string;
  status: string;
  replies: AgentReply[];
  order: AgentOrder | null;
};

export type AgentOrder = {
  id: string;
  ticketNumber: string;
  conversationId: string;
  channel: 'WEB' | 'WHATSAPP' | 'MESSENGER';
  customerName: string;
  productLabel: string;
  quantity: number;
  address: string;
  paymentMethod: 'EFECTIVO' | 'TRANSFERENCIA';
  ticketText: string;
  createdAt: string;
  status: string;
};

export type AgentProduct = {
  id: string;
  sku: string;
  name: string;
  model: string;
  category: string;
  description: string;
  specs: string[];
  priceUsd: string;
  priceCup: string;
  imageUrl: string;
  inStock: boolean;
  isNew: boolean;
};

export type ChannelVerdict = 'not_configured' | 'webhook_ready' | 'receiving' | 'live';

export type ChannelActivity = {
  enabled: boolean;
  verifyTokenConfigured: boolean;
  signatureVerification: boolean;
  webhookPath: string;
  lastVerifyAt: string | null;
  lastInboundAt: string | null;
  lastInboundFrom: string | null;
  lastInboundPreview: string | null;
  lastError: string | null;
  recentChats: Array<{
    id: string;
    from: string;
    displayName: string | null;
    lastMessageAt: string;
    status: string;
  }>;
  verdict: ChannelVerdict;
};

export type ChannelStatus = {
  agent: string;
  company: string;
  channels: {
    web: { enabled: boolean; verdict: ChannelVerdict };
    whatsapp: ChannelActivity & {
      phoneNumberIdConfigured: boolean;
      accessTokenConfigured: boolean;
    };
    messenger: ChannelActivity & {
      pageTokenConfigured: boolean;
    };
  };
};

export function sendAgentMessage(message: string, conversationId?: string, displayName?: string) {
  return request<AgentChatResponse>('/v1/agent/chat', {
    method: 'POST',
    body: JSON.stringify({ message, conversationId, displayName }),
  });
}

export function fetchAgentCatalog() {
  return request<{ products: AgentProduct[]; paymentMethods: string[] }>('/v1/agent/catalog');
}

export function createCatalogProduct(input: {
  name: string;
  model: string;
  priceUsd: string;
  priceCup?: string;
  description?: string;
  category?: string;
}) {
  return request<{ product: AgentProduct }>('/v1/agent/catalog', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function deleteCatalogProduct(productId: string) {
  return request<{ deleted: true }>(`/v1/agent/catalog/${encodeURIComponent(productId)}`, {
    method: 'DELETE',
  });
}

export function fetchAgentChannels() {
  return request<ChannelStatus>('/v1/agent/channels');
}

export type InboxChat = {
  id: string;
  from: string;
  displayName: string | null;
  lastMessageAt: string;
  lastBody: string | null;
  status: string;
};

export function fetchInbox(channel: 'WHATSAPP' | 'MESSENGER' = 'WHATSAPP') {
  return request<{ channel: string; chats: InboxChat[] }>(
    `/v1/agent/inbox?channel=${encodeURIComponent(channel)}`,
  );
}

export function fetchConversation(conversationId: string) {
  return request<{
    conversation: { id: string; stage: string; status: string };
    messages: Array<{ id: string; direction: 'IN' | 'OUT'; body: string; created_at: string }>;
    orders: AgentOrder[];
  }>(`/v1/agent/conversations/${encodeURIComponent(conversationId)}`);
}

export function fetchConversationOrders(conversationId: string) {
  return request<{ orders: AgentOrder[] }>(
    `/v1/agent/orders?conversationId=${encodeURIComponent(conversationId)}`,
  );
}

export function fetchAllOrders(adminKey: string) {
  return request<{ orders: AgentOrder[] }>('/v1/agent/orders', {
    headers: { 'X-Agent-Admin-Key': adminKey },
  });
}

export function setDailyProducts(adminKey: string, productIds: string[]) {
  return request<{ updated: number }>('/v1/agent/admin/daily-products', {
    method: 'POST',
    headers: { 'X-Agent-Admin-Key': adminKey },
    body: JSON.stringify({ productIds }),
  });
}
