import type { Bindings } from '../env';
import {
  SEED_PRODUCTS,
  SEED_ZONES,
  type AgentProduct,
  type DeliveryZone,
  type ProductCategory,
} from './agent-catalog';
import type {
  AgentChannel,
  AgentReply,
  AgentStage,
  ConversationStatus,
  CreatedOrder,
  OrderDraft,
} from './agent';
import { id, now } from './base';

export type StoredConversation = {
  id: string;
  channel: AgentChannel;
  externalUserId: string;
  displayName?: string;
  stage: AgentStage;
  draft: OrderDraft;
  status: ConversationStatus;
};

export type StoredOrder = CreatedOrder & {
  id: string;
  ticketNumber: string;
  conversationId: string;
  channel: AgentChannel;
  createdAt: string;
  status: string;
};

type ProductRow = {
  id: string;
  sku: string;
  name: string;
  model: string;
  category: string;
  description: string;
  specs_json: string;
  price_usd: string;
  price_cup: string;
  image_path: string;
  in_stock: number;
  is_new: number;
  sort_order: number;
  keywords_json: string;
};

export async function ensureAgentSeed(db: D1Database): Promise<void> {
  const existing = await db
    .prepare('SELECT COUNT(*) AS total FROM agent_products')
    .first<{ total: number }>();
  if ((existing?.total ?? 0) > 0) return;

  const timestamp = now();
  const statements = [
    ...SEED_PRODUCTS.map((product) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO agent_products (
            id, sku, name, model, category, description, specs_json, price_usd, price_cup,
            image_path, in_stock, is_new, sort_order, keywords_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          product.id,
          product.sku,
          product.name,
          product.model,
          product.category,
          product.description,
          JSON.stringify(product.specs),
          product.priceUsd,
          product.priceCup,
          product.imagePath,
          product.inStock ? 1 : 0,
          product.isNew ? 1 : 0,
          product.sortOrder,
          JSON.stringify(product.keywords),
          timestamp,
          timestamp,
        ),
    ),
    ...SEED_ZONES.map((zone) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO agent_delivery_zones (id, province, municipality, active)
           VALUES (?, ?, ?, 1)`,
        )
        .bind(zone.id, zone.province, zone.municipality),
    ),
  ];
  await db.batch(statements);
}

export async function loadCatalog(db: D1Database): Promise<AgentProduct[]> {
  await ensureAgentSeed(db);
  const rows = await db
    .prepare(
      `SELECT id, sku, name, model, category, description, specs_json, price_usd, price_cup,
              image_path, in_stock, is_new, sort_order, keywords_json
         FROM agent_products
        ORDER BY sort_order ASC`,
    )
    .all<ProductRow>();
  return rows.results.map(mapProduct);
}

export async function loadZones(db: D1Database): Promise<DeliveryZone[]> {
  await ensureAgentSeed(db);
  const rows = await db
    .prepare(
      `SELECT id, province, municipality FROM agent_delivery_zones WHERE active = 1 ORDER BY province, municipality`,
    )
    .all<{ id: string; province: string; municipality: string }>();
  return rows.results;
}

export async function loadConversation(
  db: D1Database,
  channel: AgentChannel,
  externalUserId: string,
): Promise<StoredConversation | undefined> {
  const row = await db
    .prepare(
      `SELECT id, channel, external_user_id, display_name, stage, draft_json, status
         FROM agent_conversations
        WHERE channel = ? AND external_user_id = ?
        LIMIT 1`,
    )
    .bind(channel, externalUserId)
    .first<{
      id: string;
      channel: AgentChannel;
      external_user_id: string;
      display_name: string | null;
      stage: AgentStage;
      draft_json: string;
      status: ConversationStatus;
    }>();
  return row ? mapConversation(row) : undefined;
}

export async function loadConversationById(
  db: D1Database,
  conversationId: string,
): Promise<StoredConversation | undefined> {
  const row = await db
    .prepare(
      `SELECT id, channel, external_user_id, display_name, stage, draft_json, status
         FROM agent_conversations WHERE id = ? LIMIT 1`,
    )
    .bind(conversationId)
    .first<{
      id: string;
      channel: AgentChannel;
      external_user_id: string;
      display_name: string | null;
      stage: AgentStage;
      draft_json: string;
      status: ConversationStatus;
    }>();
  return row ? mapConversation(row) : undefined;
}

export async function saveConversation(
  db: D1Database,
  input: {
    id?: string;
    channel: AgentChannel;
    externalUserId: string;
    displayName?: string;
    stage: AgentStage;
    draft: OrderDraft;
    status: ConversationStatus;
  },
): Promise<StoredConversation> {
  const timestamp = now();
  const conversationId = input.id ?? id();
  await db
    .prepare(
      `INSERT INTO agent_conversations (
          id, channel, external_user_id, display_name, stage, draft_json, status,
          last_message_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(channel, external_user_id) DO UPDATE SET
          display_name = excluded.display_name,
          stage = excluded.stage,
          draft_json = excluded.draft_json,
          status = excluded.status,
          last_message_at = excluded.last_message_at,
          updated_at = excluded.updated_at`,
    )
    .bind(
      conversationId,
      input.channel,
      input.externalUserId,
      input.displayName ?? null,
      input.stage,
      JSON.stringify(input.draft),
      input.status,
      timestamp,
      timestamp,
      timestamp,
    )
    .run();
  const stored = await loadConversation(db, input.channel, input.externalUserId);
  if (!stored) throw new Error('Conversation persist failed');
  return stored;
}

export async function recordMessage(
  db: D1Database,
  input: {
    conversationId: string;
    direction: 'IN' | 'OUT';
    body: string;
    payload?: unknown;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO agent_messages (id, conversation_id, direction, body, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id(),
      input.conversationId,
      input.direction,
      input.body.slice(0, 4000),
      input.payload ? JSON.stringify(input.payload) : null,
      now(),
    )
    .run();
}

export async function recordChannelEvent(
  db: D1Database,
  channel: AgentChannel,
  externalEventId: string,
): Promise<boolean> {
  try {
    const result = await db
      .prepare(
        `INSERT INTO agent_channel_events (id, channel, external_event_id, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(id(), channel, externalEventId, now())
      .run();
    return result.success;
  } catch {
    return false;
  }
}

export async function saveOrder(
  db: D1Database,
  input: {
    conversation: StoredConversation;
    order: CreatedOrder;
  },
): Promise<StoredOrder> {
  const timestamp = now();
  const orderId = id();
  const ticketNumber = buildTicketNumber();
  await db
    .prepare(
      `INSERT INTO agent_orders (
          id, ticket_number, conversation_id, channel, customer_name, product_label, product_id,
          quantity, address, payment_method, status, ticket_text, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'REGISTERED', ?, ?, ?)`,
    )
    .bind(
      orderId,
      ticketNumber,
      input.conversation.id,
      input.conversation.channel,
      input.order.customerName,
      input.order.productLabel,
      input.order.productId ?? null,
      input.order.quantity,
      input.order.address,
      input.order.paymentMethod,
      input.order.ticketText,
      timestamp,
      timestamp,
    )
    .run();
  return {
    ...input.order,
    id: orderId,
    ticketNumber,
    conversationId: input.conversation.id,
    channel: input.conversation.channel,
    createdAt: timestamp,
    status: 'REGISTERED',
  };
}

export async function listOrders(
  db: D1Database,
  filter?: { conversationId?: string; limit?: number },
): Promise<StoredOrder[]> {
  const limit = filter?.limit ?? 50;
  const query = filter?.conversationId
    ? db.prepare(
        `SELECT id, ticket_number, conversation_id, channel, customer_name, product_label, product_id,
                quantity, address, payment_method, status, ticket_text, created_at
           FROM agent_orders WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?`,
      )
    : db.prepare(
        `SELECT id, ticket_number, conversation_id, channel, customer_name, product_label, product_id,
                quantity, address, payment_method, status, ticket_text, created_at
           FROM agent_orders ORDER BY created_at DESC LIMIT ?`,
      );
  const rows = filter?.conversationId
    ? await query.bind(filter.conversationId, limit).all<OrderRow>()
    : await query.bind(limit).all<OrderRow>();
  return rows.results.map(mapOrder);
}

export async function listMessages(db: D1Database, conversationId: string) {
  const rows = await db
    .prepare(
      `SELECT id, direction, body, created_at FROM agent_messages
        WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 200`,
    )
    .bind(conversationId)
    .all<{ id: string; direction: 'IN' | 'OUT'; body: string; created_at: string }>();
  return rows.results;
}

export async function setDailyProducts(db: D1Database, productIds: string[]): Promise<number> {
  const timestamp = now();
  await db.prepare(`UPDATE agent_products SET is_new = 0, updated_at = ?`).bind(timestamp).run();
  if (productIds.length === 0) return 0;
  const statements = productIds.map((productId) =>
    db
      .prepare(`UPDATE agent_products SET is_new = 1, updated_at = ? WHERE id = ?`)
      .bind(timestamp, productId),
  );
  await db.batch(statements);
  return productIds.length;
}

export function publicProduct(product: AgentProduct, appOrigin: string) {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    model: product.model,
    category: product.category,
    description: product.description,
    specs: product.specs,
    priceUsd: product.priceUsd,
    priceCup: product.priceCup,
    imageUrl: product.imagePath.startsWith('/')
      ? product.imagePath
      : absoluteAssetUrl(appOrigin, product.imagePath),
    inStock: product.inStock,
    isNew: product.isNew,
  };
}

export function absoluteAssetUrl(appOrigin: string, path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${appOrigin.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

export function resolveReplyMedia(replies: AgentReply[], appOrigin: string): AgentReply[] {
  return replies.map((reply) => {
    if (reply.type !== 'image') return reply;
    return { ...reply, url: absoluteAssetUrl(appOrigin, reply.url) };
  });
}

export type ChannelHealthRow = {
  channel: 'WHATSAPP' | 'MESSENGER';
  last_verify_at: string | null;
  last_inbound_at: string | null;
  last_inbound_from: string | null;
  last_inbound_preview: string | null;
  last_error: string | null;
};

export async function touchChannelHealth(
  db: D1Database,
  channel: 'WHATSAPP' | 'MESSENGER',
  patch: {
    lastVerifyAt?: string;
    lastInboundAt?: string;
    lastInboundFrom?: string;
    lastInboundPreview?: string;
    lastError?: string | null;
  },
): Promise<void> {
  const timestamp = now();
  await db
    .prepare(
      `INSERT INTO agent_channel_health (
          channel, last_verify_at, last_inbound_at, last_inbound_from, last_inbound_preview, last_error, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(channel) DO UPDATE SET
          last_verify_at = COALESCE(excluded.last_verify_at, agent_channel_health.last_verify_at),
          last_inbound_at = COALESCE(excluded.last_inbound_at, agent_channel_health.last_inbound_at),
          last_inbound_from = COALESCE(excluded.last_inbound_from, agent_channel_health.last_inbound_from),
          last_inbound_preview = COALESCE(excluded.last_inbound_preview, agent_channel_health.last_inbound_preview),
          last_error = excluded.last_error,
          updated_at = excluded.updated_at`,
    )
    .bind(
      channel,
      patch.lastVerifyAt ?? null,
      patch.lastInboundAt ?? null,
      patch.lastInboundFrom ?? null,
      patch.lastInboundPreview ?? null,
      patch.lastError === undefined ? null : patch.lastError,
      timestamp,
    )
    .run();
}

export async function loadChannelHealth(db: D1Database): Promise<ChannelHealthRow[]> {
  try {
    const rows = await db
      .prepare(
        `SELECT channel, last_verify_at, last_inbound_at, last_inbound_from, last_inbound_preview, last_error
           FROM agent_channel_health`,
      )
      .all<ChannelHealthRow>();
    return rows.results;
  } catch {
    return [];
  }
}

export async function listInbox(db: D1Database, channel: AgentChannel, limit = 40) {
  const rows = await db
    .prepare(
      `SELECT c.id, c.external_user_id, c.display_name, c.last_message_at, c.status,
              (
                SELECT m.body FROM agent_messages m
                 WHERE m.conversation_id = c.id
                 ORDER BY m.created_at DESC LIMIT 1
              ) AS last_body
         FROM agent_conversations c
        WHERE c.channel = ?
        ORDER BY c.last_message_at DESC
        LIMIT ?`,
    )
    .bind(channel, limit)
    .all<{
      id: string;
      external_user_id: string;
      display_name: string | null;
      last_message_at: string;
      status: string;
      last_body: string | null;
    }>();
  return rows.results.map((row) => ({
    id: row.id,
    from: row.external_user_id,
    displayName: row.display_name,
    lastMessageAt: row.last_message_at,
    lastBody: row.last_body,
    status: row.status,
  }));
}

export async function listRecentChannelChats(db: D1Database, channel: AgentChannel, limit = 5) {
  const rows = await db
    .prepare(
      `SELECT id, external_user_id, display_name, last_message_at, status
         FROM agent_conversations
        WHERE channel = ?
        ORDER BY last_message_at DESC
        LIMIT ?`,
    )
    .bind(channel, limit)
    .all<{
      id: string;
      external_user_id: string;
      display_name: string | null;
      last_message_at: string;
      status: string;
    }>();
  return rows.results.map((row) => ({
    id: row.id,
    from: maskExternalId(row.external_user_id),
    displayName: row.display_name,
    lastMessageAt: row.last_message_at,
    status: row.status,
  }));
}

export function channelStatus(env: Bindings) {
  return {
    web: { enabled: true },
    whatsapp: {
      enabled: Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID),
      phoneNumberIdConfigured: Boolean(env.WHATSAPP_PHONE_NUMBER_ID),
      accessTokenConfigured: Boolean(env.WHATSAPP_ACCESS_TOKEN),
      signatureVerification: Boolean(env.WHATSAPP_APP_SECRET),
      verifyTokenConfigured: Boolean(env.META_WEBHOOK_VERIFY_TOKEN),
      webhookPath: '/v1/whatsapp/webhook',
    },
    messenger: {
      enabled: Boolean(env.MESSENGER_PAGE_ACCESS_TOKEN),
      pageTokenConfigured: Boolean(env.MESSENGER_PAGE_ACCESS_TOKEN),
      signatureVerification: Boolean(env.MESSENGER_APP_SECRET),
      verifyTokenConfigured: Boolean(env.META_WEBHOOK_VERIFY_TOKEN),
      webhookPath: '/v1/messenger/webhook',
    },
  };
}

export async function buildChannelDiagnostics(env: Bindings) {
  const base = channelStatus(env);
  const healthRows = await loadChannelHealth(env.DB);
  const health = Object.fromEntries(healthRows.map((row) => [row.channel, row]));
  const [whatsappChats, messengerChats] = await Promise.all([
    listRecentChannelChats(env.DB, 'WHATSAPP'),
    listRecentChannelChats(env.DB, 'MESSENGER'),
  ]);
  return {
    web: { ...base.web, verdict: 'live' as const },
    whatsapp: diagnoseChannel({
      ...base.whatsapp,
      health: health.WHATSAPP,
      recentChats: whatsappChats,
    }),
    messenger: diagnoseChannel({
      ...base.messenger,
      health: health.MESSENGER,
      recentChats: messengerChats,
    }),
  };
}

function diagnoseChannel<T extends { enabled: boolean; verifyTokenConfigured: boolean }>(
  input: {
    enabled: boolean;
    verifyTokenConfigured: boolean;
    health?: ChannelHealthRow;
    recentChats: Awaited<ReturnType<typeof listRecentChannelChats>>;
  } & T,
) {
  const { health, recentChats, ...rest } = input;
  const lastInboundAt = health?.last_inbound_at ?? recentChats[0]?.lastMessageAt ?? null;
  const lastVerifyAt = health?.last_verify_at ?? null;
  const verdict =
    input.enabled && lastInboundAt
      ? 'live'
      : lastInboundAt
        ? 'receiving'
        : lastVerifyAt || input.verifyTokenConfigured
          ? 'webhook_ready'
          : 'not_configured';
  return {
    ...rest,
    lastVerifyAt,
    lastInboundAt,
    lastInboundFrom: health?.last_inbound_from
      ? maskExternalId(health.last_inbound_from)
      : (recentChats[0]?.from ?? null),
    lastInboundPreview: health?.last_inbound_preview ?? null,
    lastError: health?.last_error ?? null,
    recentChats,
    verdict,
  };
}

function maskExternalId(value: string): string {
  if (value.length <= 6) return `${value.slice(0, 2)}***`;
  return `${value.slice(0, 4)}***${value.slice(-2)}`;
}

function mapProduct(row: ProductRow): AgentProduct {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    model: row.model,
    category: row.category as ProductCategory,
    description: row.description,
    specs: parseJsonArray(row.specs_json),
    priceUsd: row.price_usd,
    priceCup: row.price_cup,
    imagePath: row.image_path,
    inStock: row.in_stock === 1,
    isNew: row.is_new === 1,
    sortOrder: row.sort_order,
    keywords: parseJsonArray(row.keywords_json),
  };
}

function mapConversation(row: {
  id: string;
  channel: AgentChannel;
  external_user_id: string;
  display_name: string | null;
  stage: AgentStage;
  draft_json: string;
  status: ConversationStatus;
}): StoredConversation {
  let draft: OrderDraft = {};
  try {
    draft = JSON.parse(row.draft_json) as OrderDraft;
  } catch {
    draft = {};
  }
  return {
    id: row.id,
    channel: row.channel,
    externalUserId: row.external_user_id,
    displayName: row.display_name ?? undefined,
    stage: row.stage,
    draft,
    status: row.status,
  };
}

type OrderRow = {
  id: string;
  ticket_number: string;
  conversation_id: string;
  channel: AgentChannel;
  customer_name: string;
  product_label: string;
  product_id: string | null;
  quantity: number;
  address: string;
  payment_method: CreatedOrder['paymentMethod'];
  status: string;
  ticket_text: string;
  created_at: string;
};

function mapOrder(row: OrderRow): StoredOrder {
  return {
    id: row.id,
    ticketNumber: row.ticket_number,
    conversationId: row.conversation_id,
    channel: row.channel,
    customerName: row.customer_name,
    productLabel: row.product_label,
    productId: row.product_id ?? undefined,
    quantity: row.quantity,
    address: row.address,
    paymentMethod: row.payment_method,
    ticketText: row.ticket_text,
    createdAt: row.created_at,
    status: row.status,
  };
}

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function buildTicketNumber(): string {
  const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const suffix = id().replaceAll('-', '').slice(0, 4).toUpperCase();
  return `EGX-${stamp}-${suffix}`;
}
