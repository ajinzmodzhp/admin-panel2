-- Simple schema for keys
CREATE TABLE IF NOT EXISTS keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  expires_at INTEGER, -- unix timestamp, NULL for lifetime
  created_at INTEGER NOT NULL,
  device_id TEXT, -- when claimed, store device id
  used_at INTEGER
);
