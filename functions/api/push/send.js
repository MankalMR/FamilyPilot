// POST /api/push/send — send a no-payload push to stored subscriptions.
// Fan-out (from spec, confirmed by Parent Muse): a human edit notifies
// the other parent only (actor = Access email, excluded); a service
// write (actor 'service', or test: true) notifies all subscribers.
// No-payload first: the push carries no data, so no payload encryption
// is needed — only VAPID auth (ES256 JWT, Web Crypto, no dependencies).
// VAPID_PRIVATE_KEY must be a JWK JSON string (EC P-256, with d) set
// as a Pages secret — never in the repo. VAPID_PUBLIC_KEY is the
// matching public key, base64url, set in public/app.js.
// Each send (success or failure) is recorded in notifications history.
import { actorOf, dbOrError, error, json, readJson } from "../_shared.js";

function b64url(bytes) {
  let s = "";
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
function b64urlText(text) {
  return b64url(new TextEncoder().encode(text));
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
  return { jwt: header + "." + payload + "." + b64url(new Uint8Array(sig)), publicKey };
}

export async function onRequestPost(context) {
  const bad = dbOrError(context);
  if (bad) return bad;
  const { body, error: parseError } = await readJson(context.request);
  if (parseError) return error(parseError);
  const privateKeyRaw = context.env.VAPID_PRIVATE_KEY || "";
  if (!privateKeyRaw) {
    return error("Push not configured: VAPID_PRIVATE_KEY secret is missing", 503);
  }
  let privateJwk;
  try {
    privateJwk = JSON.parse(privateKeyRaw);
    if (privateJwk.kty !== "EC" || !privateJwk.d) throw new Error("bad JWK");
  } catch {
    return error("Push not configured: VAPID_PRIVATE_KEY must be a JWK JSON string", 503);
  }
  // Public key is passed by the caller for the Authorization header
  // when it is known, otherwise it is derived from the JWK x/y.
  const publicKey = typeof body.vapid_public_key === "string" && body.vapid_public_key
    ? body.vapid_public_key
    : b64url(new Uint8Array([4, ...Array.from(atob(privateJwk.x.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0)), ...Array.from(atob(privateJwk.y.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0))]));

  const actor = actorOf(context.request);
  const isTest = body.test === true;
  const subs = await context.env.DB.prepare("SELECT * FROM push_subscriptions").all();
  const targets = (subs.results || []).filter((s) => isTest || actor === "service" || s.user_email !== actor);
  if (!targets.length) {
    return json({ ok: true, sent: 0, failed: 0, pruned: 0, note: "No subscriptions to notify (actor excluded, or none stored yet)." });
  }
  const title = typeof body.title === "string" && body.title ? body.title : "Family Pilot updated";
  const notifBody = typeof body.body === "string" ? body.body : "";
  let sent = 0, failed = 0, pruned = 0;
  for (const sub of targets) {
    let thisSent = 0;
    try {
      const audience = new URL(sub.endpoint).origin;
      const { jwt } = await vapidJwt(audience, privateJwk, publicKey);
      const res = await fetch(sub.endpoint, {
        method: "POST",
        headers: {
          Authorization: `vapid t=${jwt}, k=${publicKey}`,
          TTL: "86400",
          "Content-Length": "0",
        },
      });
      if (res.status === 404 || res.status === 410) {
        await context.env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(sub.endpoint).run();
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
      await context.env.DB.prepare(
        "INSERT INTO notifications (event_type, title, body, actor, recipient, sent) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind(isTest ? "push_test" : "push", title, notifBody, actor, sub.user_email, thisSent).run();
    } catch {
      // History table missing (migration 0002 not applied) — push
      // delivery itself must not fail because history is unavailable.
    }
  }
  return json({ ok: true, sent, failed, pruned });
}
