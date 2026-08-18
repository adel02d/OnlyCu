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
