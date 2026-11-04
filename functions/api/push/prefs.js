// GET /api/push/prefs — the signed-in user's per-type prefs,
// merged with the defaults in _push.js (no row = default).
// POST /api/push/prefs — set one pref: {event_type, enabled}.
// Prefs are per user (Access email); service callers have no prefs.
import { actorOf, dbOrError, error, json, readJson } from "../_shared.js";
import { EVENT_DEFAULTS, EVENT_LABELS, EVENT_TYPES } from "../_push.js";

export async function onRequestGet(context) {
  const bad = dbOrError(context);
  if (bad) return bad;
  const actor = actorOf(context.request);
  if (actor === "service") return error("Sign in via Access to read notification prefs", 401);
  const rows = await context.env.DB.prepare(
    "SELECT event_type, enabled FROM notification_prefs WHERE user_email = ?"
  ).bind(actor).all();
  const byType = new Map((rows.results || []).map((r) => [r.event_type, r.enabled]));
  return json({
    ok: true,
    prefs: EVENT_TYPES.map((t) => ({
      event_type: t,
      label: EVENT_LABELS[t],
      enabled: byType.has(t) ? byType.get(t) : EVENT_DEFAULTS[t],
    })),
  });
}

export async function onRequestPost(context) {
  const bad = dbOrError(context);
  if (bad) return bad;
  const actor = actorOf(context.request);
  if (actor === "service") return error("Sign in via Access to set notification prefs", 401);
  const { body, error: parseError } = await readJson(context.request);
  if (parseError) return error(parseError);
  if (!EVENT_TYPES.includes(body.event_type)) {
    return error("event_type must be one of: " + EVENT_TYPES.join(", "));
  }
  const enabled = body.enabled === true || body.enabled === 1 || body.enabled === "1" ? 1 : 0;
  await context.env.DB.prepare(
    "INSERT INTO notification_prefs (user_email, event_type, enabled) VALUES (?, ?, ?) " +
    "ON CONFLICT(user_email, event_type) DO UPDATE SET enabled = excluded.enabled"
  ).bind(actor, body.event_type, enabled).run();
  return json({ ok: true, event_type: body.event_type, enabled });
}
