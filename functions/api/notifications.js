// GET /api/notifications — notification history + recent data changes.
// Notifications sent via /api/push/send are recorded in the
// notifications table. Recent changes are read live from items and
// lunch_days updated_at, so history is useful even before any push
// has been sent. If the notifications table does not exist yet
// (migration 0002 not applied), notifications is [] instead of an error.
import { dbOrError, json } from "./_shared.js";

export async function onRequestGet(context) {
  const bad = dbOrError(context);
  if (bad) return bad;
  let notifications = [];
  try {
    const r = await context.env.DB.prepare(
      "SELECT * FROM notifications ORDER BY created_at DESC, id DESC LIMIT 50"
    ).all();
    notifications = r.results || [];
  } catch {
    notifications = [];
  }
  const itemRows = await context.env.DB.prepare(
    "SELECT id, child, title, status, due_date, updated_at, actor FROM items ORDER BY updated_at DESC, id DESC LIMIT 20"
  ).all();
  const lunchRows = await context.env.DB.prepare(
    "SELECT id, child, date, plan, no_school, updated_at, actor FROM lunch_days ORDER BY updated_at DESC, id DESC LIMIT 20"
  ).all();
  const recent = [
    ...(itemRows.results || []).map((r) => ({ kind: "item", ...r })),
    ...(lunchRows.results || []).map((r) => ({ kind: "lunch", ...r })),
  ].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).slice(0, 20);
  return json({ ok: true, notifications, recent_changes: recent });
}
