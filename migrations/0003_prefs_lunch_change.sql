-- Family Pilot — D1 migration 0003 (Phase 3 push fan-out).
-- Add 'lunch_change' to notification_prefs.event_type: manual lunch
-- day create/edit/delete by a parent, distinct from 'menu_load'
-- (batch imports) and 'lunch_plan_change' (plan toggles only).
-- SQLite cannot alter a CHECK in place, so the table is rebuilt;
-- rows are copied across. Applied to production D1 Nov 3, 2026,
-- when the prefs table held no rows, so nothing was lost.
CREATE TABLE IF NOT EXISTS notification_prefs_new (
  user_email TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('new_item', 'status_change', 'lunch_plan_change', 'lunch_change', 'menu_load')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  PRIMARY KEY (user_email, event_type)
);
INSERT INTO notification_prefs_new SELECT user_email, event_type, enabled FROM notification_prefs;
DROP TABLE notification_prefs;
ALTER TABLE notification_prefs_new RENAME TO notification_prefs;
