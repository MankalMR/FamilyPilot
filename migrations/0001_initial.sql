-- Family Pilot — D1 migration 0001 (Phase 0 schema, no data yet)
-- Dates are ET calendar dates as TEXT (YYYY-MM-DD), never UTC timestamps.
-- Mutable rows carry actor + updated_at (needed for push-suppression auditing).
-- Import guard is enforced in the API, not only here: a monthly import
-- MAY update menu_text for an existing date, but MUST NEVER touch plan.

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  child TEXT NOT NULL CHECK (child IN ('pia', 'misha')),
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('test', 'homework', 'project', 'form_to_sign', 'event', 'no_school', 'heads_up')),
  due_date TEXT NOT NULL,
  due_time TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  details TEXT DEFAULT '',
  source TEXT DEFAULT '',
  actor TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_items_child_due ON items (child, due_date, status);

CREATE TABLE IF NOT EXISTS lunch_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  child TEXT NOT NULL CHECK (child IN ('pia', 'misha')),
  date TEXT NOT NULL,
  menu_text TEXT DEFAULT '',
  no_school INTEGER NOT NULL DEFAULT 0 CHECK (no_school IN (0, 1)),
  plan TEXT NOT NULL DEFAULT 'undecided' CHECK (plan IN ('undecided', 'school', 'pack')),
  note TEXT DEFAULT '',
  source TEXT DEFAULT '',
  actor TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (child, date)
);
CREATE INDEX IF NOT EXISTS idx_lunch_child_date ON lunch_days (child, date);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_email TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_email, endpoint)
);

CREATE TABLE IF NOT EXISTS notification_prefs (
  user_email TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('new_item', 'status_change', 'lunch_plan_change', 'menu_load')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  PRIMARY KEY (user_email, event_type)
);
