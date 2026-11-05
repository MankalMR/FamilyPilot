// GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD — list mirrored
// calendar events in the window, plus last_synced. last_synced is
// the meta heartbeat the sync job writes on EVERY successful run
// (meta key 'calendar_last_sync', UTC datetime), so it moves even
// on a no-change run — reading max(updated_at) instead would go
// stale on a quiet stretch, because no row is written then. The
// max(updated_at) fallback covers syncs that predate the heartbeat.
// Read-only by design: calendar
// events are written only by the Parent Muse sync job, which reads
// Google Calendar (user decision Nov 5, 2026 — Google only, never
// ICS feeds directly) and upserts into calendar_events. The site
// never writes to the calendar and never writes this table from
// the UI. Events are display-only: no status, no done checkbox,
// no alerts and no push. child is pia, misha, or family.
import { dbOrError, error, isDateText, json } from "./_shared.js";

export async function onRequestGet(context) {
  const bad = dbOrError(context);
  if (bad) return bad;
  const url = new URL(context.request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if ((from && !isDateText(from)) || (to && !isDateText(to))) {
    return error("from and to must be YYYY-MM-DD");
  }
  let sql = "SELECT * FROM calendar_events WHERE 1=1";
  const params = [];
  if (from) { sql += " AND start_date >= ?"; params.push(from); }
  if (to) { sql += " AND start_date <= ?"; params.push(to); }
  sql += " ORDER BY start_date ASC, start_time ASC, id ASC";
  const { results } = await context.env.DB.prepare(sql).bind(...params).all();
  const events = results || [];
  const hb = await context.env.DB.prepare(
    "SELECT value FROM meta WHERE key = 'calendar_last_sync'"
  ).first();
  let lastSynced = hb ? hb.value : null;
  if (!lastSynced) {
    const row = await context.env.DB.prepare(
      "SELECT MAX(updated_at) AS m FROM calendar_events"
    ).first();
    lastSynced = row ? row.m : null;
  }
  return json({ ok: true, events, last_synced: lastSynced });
}
