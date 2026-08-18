PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS agent_channel_health (
  channel TEXT PRIMARY KEY CHECK (channel IN ('WHATSAPP', 'MESSENGER')),
  last_verify_at TEXT,
  last_inbound_at TEXT,
  last_inbound_from TEXT,
  last_inbound_preview TEXT,
  last_error TEXT,
  updated_at TEXT NOT NULL
);
