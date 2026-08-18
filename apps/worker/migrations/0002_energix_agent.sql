PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS agent_products (
  id TEXT PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  model TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  specs_json TEXT NOT NULL,
  price_usd TEXT NOT NULL,
  price_cup TEXT NOT NULL,
  image_path TEXT NOT NULL,
  in_stock INTEGER NOT NULL DEFAULT 1 CHECK (in_stock IN (0, 1)),
  is_new INTEGER NOT NULL DEFAULT 0 CHECK (is_new IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  keywords_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_delivery_zones (
  id TEXT PRIMARY KEY,
  province TEXT NOT NULL,
  municipality TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS agent_conversations (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('WEB', 'WHATSAPP', 'MESSENGER')),
  external_user_id TEXT NOT NULL,
  display_name TEXT,
  stage TEXT NOT NULL,
  draft_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'WAITING_HUMAN', 'CLOSED')),
  last_message_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (channel, external_user_id)
);

CREATE TABLE IF NOT EXISTS agent_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('IN', 'OUT')),
  body TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_orders (
  id TEXT PRIMARY KEY,
  ticket_number TEXT NOT NULL UNIQUE,
  conversation_id TEXT NOT NULL REFERENCES agent_conversations(id) ON DELETE RESTRICT,
  channel TEXT NOT NULL CHECK (channel IN ('WEB', 'WHATSAPP', 'MESSENGER')),
  customer_name TEXT NOT NULL,
  product_label TEXT NOT NULL,
  product_id TEXT REFERENCES agent_products(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  address TEXT NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('EFECTIVO', 'TRANSFERENCIA')),
  status TEXT NOT NULL DEFAULT 'REGISTERED',
  ticket_text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_channel_events (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('WEB', 'WHATSAPP', 'MESSENGER')),
  external_event_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (channel, external_event_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_conversations_channel ON agent_conversations(channel, last_message_at);
CREATE INDEX IF NOT EXISTS idx_agent_messages_conversation ON agent_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_orders_created ON agent_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_products_new ON agent_products(is_new, sort_order);
