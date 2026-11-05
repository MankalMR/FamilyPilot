// Family Pilot — shared push fan-out (Phase 3).
// Files starting with "_" are NOT routed by Pages Functions, so this
// file is a library, not an endpoint.
//
// Detail-light by user decision (Nov 3, 2026): a real push shows
// kid + type + title only (e.g. "Pia · New test: Math test — long
// division"), never item details or full menu text. The push itself
// is still no-payload (proven by the Nov 3 test push): the service
// worker fetches the detail-light title/body from /api/push/latest
// when the push arrives, and falls back to a generic notification
// if that fetch fails. Payloads therefore never travel through the
// push service, and no Web Push payload encryption is needed —
// only VAPID auth (ES256 JWT, Web Crypto, no dependencies).
//
// Fan-out (spec, user-confirmed Nov 3, 2026):
// - Human edit (actor = Access email): notify the OTHER parent only
//   (all subscriptions whose user_email != actor are targets).
// - Service write (actor = "service", e.g. a Parent Muse job via an
//   Access Service Token): notify BOTH parents (all subscribers).
// - Test push (isTest): notify all subscribers, bypassing prefs.
// Per-type prefs (notification_prefs): a row with enabled=0 silences
// that event type for that user; no row means the default below.
// Defaults (user-confirmed Nov 3, 2026, plus Nov 4 for records):
// new_item, status_change, lunch_plan_change, lunch_change and
// new_record ON; menu_load OFF (a monthly import touches 30+
// days, so imports are batched to ONE push, and only if the user
// turns menu_load on). A missing pref row means the default, so
// new_record is ON for existing subscriptions with no row.
// VAPID_PRIVATE_KEY must be a JWK JSON string (EC P-256, with d)
// set as a Pages secret — never in the repo.

export const EVENT_TYPES = ["new_item", "status_change", "lunch_plan_change", "lunch_change", "menu_load", "new_record"];
export const EVENT_DEFAULTS = {
  new_item: 1,
  status_change: 1,
  lunch_plan_change: 1,
  lunch_change: 1,
  menu_load: 0,
  new_record: 1,
};
export const EVENT_LABELS = {
  new_item: "New item",
  status_change: "Item status / edit",
  lunch_plan_change: "Lunch plan change",
  lunch_change: "Lunch day change",
  menu_load: "Menu load",
  new_record: "New record",
};

function b64url(bytes) {
  let s = "";
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
function b64urlText(text) {
  return b64url(new TextEncoder().encode(text));
}
function b64ToBytes(s) {
  const norm = s.replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(atob(norm), (c) => c.charCodeAt(0));
}

async function vapidJwt(audience, privateJwk, publicKey) {
  const key = await crypto.subtle.importKey(
    "jwk", privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]
  );
  const header = b64urlText(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const payload = b64urlText(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 43200,
    sub: "mailto:family-pilot@mankala.space",
  }));
  const data = new TextEncoder().encode(header + "." + payload);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, data);
  return header + "." + payload + "." + b64url(new Uint8Array(sig));
}

export function kidLabel(child) {
  return child === "misha" ? "Misha" : "Pia";
}
export function planLabel(plan) {
  return plan === "school" ? "School lunch" : plan === "pack" ? "Pack lunch" : "Undecided";
}
export function mainDish(menuText) {
  if (!menuText) return "";
  return menuText.split(/[;\n]/)[0].trim().slice(0, 100);
}

// Send one detail-light push event. Returns {sent, failed, pruned}
// (and {error} when VAPID is not configured). Never throws on a
// per-subscriber failure — a failed push must never fail the
// mutation that triggered it; callers must also catch this call.
export async function sendPush(env, { actor, eventType, title, body, isTest = false, vapidPublicKey = "" }) {
  const privateKeyRaw = env.VAPID_PRIVATE_KEY || "";
  if (!privateKeyRaw) return { sent: 0, failed: 0, pruned: 0, error: "Push not configured: VAPID_PRIVATE_KEY secret is missing" };
  let privateJwk;
  try {
    privateJwk = JSON.parse(privateKeyRaw);
    if (privateJwk.kty !== "EC" || !privateJwk.d) throw new Error("bad JWK");
  } catch {
    return { sent: 0, failed: 0, pruned: 0, error: "Push not configured: VAPID_PRIVATE_KEY must be a JWK JSON string" };
  }
  const publicKey = vapidPublicKey
    || b64url(new Uint8Array([4, ...b64ToBytes(privateJwk.x), ...b64ToBytes(privateJwk.y)]));

  const subs = await env.DB.prepare("SELECT * FROM push_subscriptions").all();
  let targets = (subs.results || []).filter((s) => isTest || actor === "service" || s.user_email !== actor);
  if (!isTest && EVENT_TYPES.includes(eventType)) {
    const kept = [];
    for (const s of targets) {
      const pref = await env.DB.prepare(
        "SELECT enabled FROM notification_prefs WHERE user_email = ? AND event_type = ?"
      ).bind(s.user_email, eventType).first();
      const enabled = pref ? pref.enabled : EVENT_DEFAULTS[eventType];
      if (enabled) kept.push(s);
    }
    targets = kept;
  }
  if (!targets.length) return { sent: 0, failed: 0, pruned: 0 };

  let sent = 0, failed = 0, pruned = 0;
  for (const sub of targets) {
    let thisSent = 0;
    try {
      const audience = new URL(sub.endpoint).origin;
      const jwt = await vapidJwt(audience, privateJwk, publicKey);
      const res = await fetch(sub.endpoint, {
        method: "POST",
        headers: {
          Authorization: `vapid t=${jwt}, k=${publicKey}`,
          TTL: "86400",
          "Content-Length": "0",
        },
      });
      if (res.status === 404 || res.status === 410) {
        await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(sub.endpoint).run();
        pruned++;
        failed++;
      } else if (!res.ok) {
        failed++;
      } else {
        sent++;
        thisSent = 1;
      }
    } catch {
      failed++;
    }
    try {
      await env.DB.prepare(
        "INSERT INTO notifications (event_type, title, body, actor, recipient, sent) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind(isTest ? "push_test" : eventType, title, body || "", actor, sub.user_email, thisSent).run();
    } catch {
      // History table missing — push delivery itself must not fail
      // because history is unavailable.
    }
  }
  return { sent, failed, pruned };
}
