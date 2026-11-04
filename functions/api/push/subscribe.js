// POST /api/push/subscribe — store one device's push subscription.
// user_email comes from the Cloudflare Access header when present
// (human UI edits), otherwise from the body (service callers).
// A subscription is per device: same user + same endpoint replaces
// the old keys, so re-subscribing never duplicates a device.
import { actorOf, dbOrError, error, json, readJson } from "../_shared.js";

export async function onRequestPost(context) {
  const bad = dbOrError(context);
  if (bad) return bad;
  const { body, error: parseError } = await readJson(context.request);
  if (parseError) return error(parseError);
  const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
  const keys = body.keys || {};
  const p256dh = typeof keys.p256dh === "string" ? keys.p256dh : "";
  const auth = typeof keys.auth === "string" ? keys.auth : "";
  if (!endpoint || !p256dh || !auth) {
    return error("endpoint, keys.p256dh and keys.auth are required", 400);
  }
  const actor = actorOf(context.request);
  const userEmail = actor && actor !== "service" ? actor : (typeof body.user_email === "string" ? body.user_email : "");
  if (!userEmail) return error("user_email is required (sign in via Access, or pass user_email)", 400);
  await context.env.DB.prepare(
    "INSERT INTO push_subscriptions (user_email, endpoint, p256dh, auth) VALUES (?, ?, ?, ?) " +
    "ON CONFLICT(user_email, endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth"
  ).bind(userEmail, endpoint, p256dh, auth).run();
  return json({ ok: true, user_email: userEmail });
}

// DELETE /api/push/subscribe — unsubscribe one device: the caller
// removes only their own subscription row for the given endpoint.
// The frontend also calls PushManager.unsubscribe() first, so the
// browser stops delivering to that endpoint at all.
export async function onRequestDelete(context) {
  const bad = dbOrError(context);
  if (bad) return bad;
  const { body, error: parseError } = await readJson(context.request);
  if (parseError) return error(parseError);
  const actor = actorOf(context.request);
  if (actor === "service") return error("Sign in via Access to unsubscribe", 401);
  const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
  if (!endpoint) return error("endpoint is required", 400);
  const res = await context.env.DB.prepare(
    "DELETE FROM push_subscriptions WHERE user_email = ? AND endpoint = ?"
  ).bind(actor, endpoint).run();
  return json({ ok: true, deleted: res.meta.changes || 0 });
}
