-- Family Pilot — D1 migration 0002 (push notification history)
-- Records push notifications actually sent, so parents can see
-- what was notified even if a push was missed. Recent data changes
-- are read from items/lunch_days updated_at, not duplicated here.
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL DEFAULT 'push',
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  kid TEXT DEFAULT '',
  related_type TEXT DEFAULT '',
  related_id INTEGER,
  actor TEXT DEFAULT '',
  recipient TEXT DEFAULT '',
  sent INTEGER NOT NULL DEFAULT 0 CHECK (sent IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications (created_at DESC, id DESC);
