// GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD — list mirrored
// calendar events in the window, plus last_synced (the newest
// updated_at among mirrored rows). Read-only by design: calendar
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
  let lastSynced = null;
  for (const e of events) {
    if (e.updated_at && (!lastSynced || e.updated_at > lastSynced)) lastSynced = e.updated_at;
  }
  if (!lastSynced) {
    const row = await context.env.DB.prepare(
      "SELECT MAX(updated_at) AS m FROM calendar_events"
    ).first();
    lastSynced = row ? row.m : null;
  }
  return json({ ok: true, events, last_synced: lastSynced });
}
