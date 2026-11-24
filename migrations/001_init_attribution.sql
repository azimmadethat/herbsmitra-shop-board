-- SuperAttribution Database Schema for Turso (libSQL / SQLite) and Neon Postgres
-- Free Persistent Storage Migration

CREATE TABLE IF NOT EXISTS visits (
  id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  landing_url TEXT,
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  fbclid TEXT,
  gclid TEXT,
  source TEXT
);

CREATE INDEX IF NOT EXISTS idx_visits_visitor ON visits (visitor_id);
CREATE INDEX IF NOT EXISTS idx_visits_ts ON visits (ts);
CREATE INDEX IF NOT EXISTS idx_visits_source ON visits (source);

CREATE TABLE IF NOT EXISTS synced_orders (
  order_id INTEGER PRIMARY KEY,
  order_date TEXT,
  total REAL,
  status TEXT,
  payment_method TEXT,
  payment_method_title TEXT,
  visitor_id TEXT,
  journey_json TEXT,
  synced_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_orders_date ON synced_orders (order_date);
CREATE INDEX IF NOT EXISTS idx_orders_visitor ON synced_orders (visitor_id);

CREATE TABLE IF NOT EXISTS meta_rows (
  date TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  adset_id TEXT NOT NULL,
  ad_id TEXT NOT NULL,
  spend REAL DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  meta_purchases INTEGER DEFAULT 0,
  meta_value REAL DEFAULT 0,
  raw_json TEXT,
  PRIMARY KEY (date, campaign_id, adset_id, ad_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_date ON meta_rows (date);
CREATE INDEX IF NOT EXISTS idx_meta_campaign ON meta_rows (campaign_id);
