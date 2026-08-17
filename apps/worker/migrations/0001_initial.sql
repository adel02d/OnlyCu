PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL UNIQUE,
  telegram_chat_id TEXT,
  username TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT,
  language_code TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'BANNED', 'DELETED')),
  terms_accepted_at TEXT,
  adult_declared_at TEXT,
  adult_declaration_version TEXT,
  session_version INTEGER NOT NULL DEFAULT 0,
  last_seen_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('MEMBER', 'CREATOR', 'ADMIN', 'MODERATOR')),
  assigned_at TEXT NOT NULL,
  PRIMARY KEY (user_id, role)
);

CREATE TABLE IF NOT EXISTS creator_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  handle TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  bio TEXT,
  subscription_enabled INTEGER NOT NULL DEFAULT 1 CHECK (subscription_enabled IN (0, 1)),
  subscription_price TEXT NOT NULL DEFAULT '0',
  subscription_currency TEXT NOT NULL DEFAULT 'USDT' CHECK (subscription_currency IN ('CUP', 'USD', 'USDT', 'TON')),
  content_scope TEXT NOT NULL DEFAULT '18_PLUS' CHECK (content_scope IN ('GENERAL', '18_PLUS')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAYMENT_DUE', 'SUSPENDED_OVERDUE', 'CLOSED')),
  billing_anchor_at TEXT NOT NULL,
  next_billing_at TEXT NOT NULL,
  suspended_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS creator_payment_methods (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES creator_profiles(user_id) ON DELETE CASCADE,
  method_type TEXT NOT NULL CHECK (method_type IN ('QVAPAY', 'CUP', 'USDT_TRC20', 'USDT_BEP20', 'TON')),
  display_label TEXT NOT NULL,
  network TEXT,
  recipient_encrypted TEXT NOT NULL,
  recipient_hint TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (creator_id, method_type, network)
);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES creator_profiles(user_id) ON DELETE CASCADE,
  title TEXT,
  body TEXT,
  access_type TEXT NOT NULL CHECK (access_type IN ('FREE', 'SUBSCRIBERS', 'PPV')),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED', 'REMOVED')),
  content_rating TEXT NOT NULL DEFAULT 'GENERAL' CHECK (content_rating IN ('GENERAL', '18_PLUS')),
  ppv_price TEXT,
  ppv_currency TEXT CHECK (ppv_currency IN ('CUP', 'USD', 'USDT', 'TON')),
  included_in_subscription INTEGER NOT NULL DEFAULT 0 CHECK (included_in_subscription IN (0, 1)),
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (access_type = 'PPV' AND ppv_price IS NOT NULL AND ppv_currency IS NOT NULL)
    OR (access_type != 'PPV')
  )
);

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('IMAGE', 'VIDEO', 'AUDIO')),
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  sha256 TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING_UPLOAD' CHECK (status IN ('PENDING_UPLOAD', 'READY', 'REJECTED', 'DELETED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  subscriber_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  creator_id TEXT NOT NULL REFERENCES creator_profiles(user_id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'ACTIVE', 'EXPIRED', 'CANCELED', 'REVOKED')),
  current_period_start TEXT,
  current_period_end TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (subscriber_id, creator_id)
);

CREATE TABLE IF NOT EXISTS post_entitlements (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  buyer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payment_claim_id TEXT NOT NULL UNIQUE REFERENCES payment_claims(id) ON DELETE RESTRICT,
  granted_at TEXT NOT NULL,
  revoked_at TEXT,
  UNIQUE (post_id, buyer_id)
);

CREATE TABLE IF NOT EXISTS payment_claims (
  id TEXT PRIMARY KEY,
  buyer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  creator_id TEXT NOT NULL REFERENCES creator_profiles(user_id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('POST', 'SUBSCRIPTION')),
  post_id TEXT REFERENCES posts(id) ON DELETE SET NULL,
  payment_method_id TEXT NOT NULL REFERENCES creator_payment_methods(id) ON DELETE RESTRICT,
  payment_method_type TEXT NOT NULL CHECK (payment_method_type IN ('QVAPAY', 'CUP', 'USDT_TRC20', 'USDT_BEP20', 'TON')),
  recipient_snapshot_encrypted TEXT NOT NULL,
  amount TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('CUP', 'USD', 'USDT', 'TON')),
  status TEXT NOT NULL DEFAULT 'AWAITING_TRANSFER' CHECK (status IN ('AWAITING_TRANSFER', 'PROOF_SUBMITTED', 'APPROVED', 'REJECTED', 'EXPIRED', 'DISPUTED')),
  proof_object_key TEXT,
  proof_content_type TEXT,
  proof_sha256 TEXT,
  buyer_note TEXT,
  creator_note TEXT,
  reviewed_at TEXT,
  approved_at TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (target_type = 'POST' AND post_id IS NOT NULL)
    OR (target_type = 'SUBSCRIPTION' AND post_id IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS platform_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  commission_bps INTEGER NOT NULL DEFAULT 1000 CHECK (commission_bps BETWEEN 0 AND 10000),
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO platform_settings (id, commission_bps, updated_at)
VALUES (1, 1000, CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS platform_exchange_rates (
  currency TEXT PRIMARY KEY CHECK (currency IN ('CUP', 'USD', 'USDT', 'TON')),
  usdt_per_unit TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO platform_exchange_rates (currency, usdt_per_unit, updated_at)
VALUES ('USDT', '1', CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS billing_cycles (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES creator_profiles(user_id) ON DELETE CASCADE,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'AWAITING_RATES' CHECK (status IN ('AWAITING_RATES', 'INVOICED', 'PAID', 'OVERDUE', 'VOID')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (creator_id, period_start, period_end)
);

CREATE TABLE IF NOT EXISTS billing_cycle_lines (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL REFERENCES billing_cycles(id) ON DELETE CASCADE,
  source_currency TEXT NOT NULL CHECK (source_currency IN ('CUP', 'USD', 'USDT', 'TON')),
  gross_amount TEXT NOT NULL,
  usdt_rate_snapshot TEXT NOT NULL,
  gross_usdt TEXT NOT NULL,
  platform_fee_usdt TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (cycle_id, source_currency)
);

CREATE TABLE IF NOT EXISTS platform_invoices (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL UNIQUE REFERENCES billing_cycles(id) ON DELETE CASCADE,
  creator_id TEXT NOT NULL REFERENCES creator_profiles(user_id) ON DELETE CASCADE,
  amount_usdt TEXT NOT NULL,
  network TEXT NOT NULL DEFAULT 'TRC20',
  platform_recipient_snapshot TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'AWAITING_CREATOR_PAYMENT' CHECK (status IN ('AWAITING_CREATOR_PAYMENT', 'PROOF_SUBMITTED', 'PAID', 'REJECTED', 'OVERDUE', 'VOID')),
  proof_object_key TEXT,
  proof_content_type TEXT,
  proof_sha256 TEXT,
  creator_note TEXT,
  admin_note TEXT,
  notified_at TEXT NOT NULL,
  due_at TEXT NOT NULL,
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS media_access_events (
  id TEXT PRIMARY KEY,
  media_asset_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  decision TEXT NOT NULL CHECK (decision IN ('ALLOWED', 'DENIED', 'NOT_ENTITLED', 'CREATOR_SUSPENDED', 'ADULT_DECLARATION_REQUIRED')),
  ip_hash TEXT,
  user_agent_hash TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata_json TEXT,
  ip_hash TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_posts_author_status ON posts(author_id, status, published_at);
CREATE INDEX IF NOT EXISTS idx_media_post_status ON media_assets(post_id, status);
CREATE INDEX IF NOT EXISTS idx_claims_creator_status ON payment_claims(creator_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_claims_buyer_status ON payment_claims(buyer_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_claims_approved_at ON payment_claims(creator_id, approved_at);
CREATE INDEX IF NOT EXISTS idx_subscriptions_access ON subscriptions(subscriber_id, creator_id, status, current_period_end);
CREATE INDEX IF NOT EXISTS idx_creator_billing_due ON creator_profiles(status, next_billing_at);
CREATE INDEX IF NOT EXISTS idx_invoices_due ON platform_invoices(status, due_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at, created_at);
