// GET /api/push/latest — the signed-in user's most recent sent
// push, for the service worker's fetch-on-arrival detail-light
// display. Only rows from the last 30 minutes are returned: an
// older row is not the push that just arrived, and the worker
// must fall back to the generic notification in that case.
import { actorOf, dbOrError, error, json } from "../_shared.js";

export async function onRequestGet(context) {
  const bad = dbOrError(context);
  if (bad) return bad;
  const actor = actorOf(context.request);
  if (actor === "service") return error("Sign in via Access to read latest push", 401);
  const row = await context.env.DB.prepare(
    "SELECT * FROM notifications WHERE recipient = ? AND sent = 1 ORDER BY created_at DESC, id DESC LIMIT 1"
  ).bind(actor).first();
  if (!row) return json({ ok: true, notification: null });
  const created = Date.parse(String(row.created_at).replace(" ", "T") + "Z");
  if (Number.isNaN(created) || Date.now() - created > 30 * 60 * 1000) {
    return json({ ok: true, notification: null });
  }
  return json({
    ok: true,
    notification: {
      event_type: row.event_type,
      title: row.title,
      body: row.body || "",
      created_at: row.created_at,
    },
  });
}
