// POST /api/push/send — send a push event.
// Two callers:
// - The site's "Send test push" button: {test: true, title, body}
//   notifies ALL subscribers, bypassing per-type prefs.
// - A data-change trigger (human mutation fan-out is internal;
//   a Parent Muse job via an Access Service Token calls this
//   directly): {event_type, title, body} with detail-light
//   title/body. Actor comes from the Access header when present
//   (human), otherwise "service" (service token / job) — see
//   _push.js for the fan-out and prefs rules.
// The push itself is no-payload; the service worker fetches the
// detail-light title/body from /api/push/latest on arrival.
import { actorOf, dbOrError, error, json, readJson } from "../_shared.js";
import { EVENT_TYPES, sendPush } from "../_push.js";

export async function onRequestPost(context) {
  const bad = dbOrError(context);
  if (bad) return bad;
  const { body, error: parseError } = await readJson(context.request);
  if (parseError) return error(parseError);
  const isTest = body.test === true;
  const eventType = isTest ? "push_test" : body.event_type;
  if (!isTest && !EVENT_TYPES.includes(eventType)) {
    return error("event_type must be one of: " + EVENT_TYPES.join(", "));
  }
  const title = typeof body.title === "string" && body.title ? body.title.slice(0, 500) : "Family Pilot updated";
  const notifBody = typeof body.body === "string" ? body.body.slice(0, 500) : "";
  const result = await sendPush(context.env, {
    actor: actorOf(context.request),
    eventType: isTest ? "push_test" : eventType,
    title,
    body: notifBody,
    isTest,
    vapidPublicKey: typeof body.vapid_public_key === "string" ? body.vapid_public_key : "",
  });
  if (result.error) return error(result.error, 503);
  return json({ ok: true, sent: result.sent, failed: result.failed, pruned: result.pruned });
}
