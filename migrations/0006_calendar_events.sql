-- Family Pilot — D1 migration 0006 (calendar mirror, approved Nov 5, 2026).
-- Calendar events live in their OWN table, never in items: they are
-- timed, location-bearing, display-only mirror rows with no status,
-- no done checkbox, no due-date lifecycle, no alerts and no push.
-- The sync job (Parent Muse, Google Calendar ONLY — user decision
-- Nov 5, 2026) reads Google calendars and upserts here; the site
-- never writes to the calendar and never writes this table from
-- the UI. There is no POST/PATCH/DELETE endpoint for this table.
-- child is pia, misha, or family (unattributed — never guessed).
-- A recurring event expands into one row per occurrence, keyed by
-- (source_event_id, start_date, start_time), so a changed or
-- cancelled occurrence updates in place and never duplicates.
-- Dates are ET calendar dates as TEXT (YYYY-MM-DD), times HH:MM
-- (24h) or NULL for all-day events. updated_at is the sync stamp
-- the UI shows as "last synced".
CREATE TABLE IF NOT EXISTS calendar_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL DEFAULT 'google',
  source_event_id TEXT NOT NULL,
  calendar_name TEXT NOT NULL DEFAULT '',
  child TEXT NOT NULL CHECK (child IN ('pia', 'misha', 'family')),
  title TEXT NOT NULL,
  start_date TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  all_day INTEGER NOT NULL DEFAULT 0 CHECK (all_day IN (0, 1)),
  location TEXT NOT NULL DEFAULT '',
  actor TEXT NOT NULL DEFAULT 'service',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (source_event_id, start_date, start_time)
);
CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events (start_date, start_time);
CREATE INDEX IF NOT EXISTS idx_calendar_events_child ON calendar_events (child, start_date);
