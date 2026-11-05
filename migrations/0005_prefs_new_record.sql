-- Family Pilot — D1 migration 0005 (push for new records).
-- Add 'new_record' to notification_prefs.event_type, for the
-- user-approved Nov 4, 2026 rule: every new record notifies, not
-- just rare ones. SQLite cannot alter a CHECK in place, so the
-- table is rebuilt; rows are copied across (same pattern as
-- migration 0003). Default ON lives in code (_push.js
-- EVENT_DEFAULTS), not in this table: a missing row means ON,
-- so existing subscriptions get new_record ON with no row.
-- Applied to production D1 Nov 4, 2026, when the prefs table
-- held 2 rows (both menu_load); both were copied across.
CREATE TABLE IF NOT EXISTS notification_prefs_new (
  user_email TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('new_item', 'status_change', 'lunch_plan_change', 'lunch_change', 'menu_load', 'new_record')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  PRIMARY KEY (user_email, event_type)
);
INSERT INTO notification_prefs_new SELECT user_email, event_type, enabled FROM notification_prefs;
DROP TABLE notification_prefs;
ALTER TABLE notification_prefs_new RENAME TO notification_prefs;
