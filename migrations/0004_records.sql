-- Family Pilot — D1 migration 0004 (Records, approved Nov 4, 2026).
-- Info-only reference records, per child: grades, attendance, MAP
-- and later benchmark reports. Each row carries its as-of date and
-- source label; pdf_url holds the Drive/PDF link when the report
-- was made available as a PDF. Records never appear in Today /
-- Next Up, never carry due dates, and never trigger alerts.
-- Rows are written by Parent Muse scans directly to D1; the site
-- API for this table is read-only (GET /api/records).
CREATE TABLE IF NOT EXISTS records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  child TEXT NOT NULL CHECK (child IN ('pia', 'misha')),
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  as_of TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  pdf_url TEXT,
  actor TEXT NOT NULL DEFAULT 'service',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_records_child_asof ON records(child, as_of DESC);
