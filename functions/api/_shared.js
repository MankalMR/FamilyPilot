// Family Pilot — shared API helpers (Phase 1).
// Files starting with "_" are NOT routed by Pages Functions, so this
// file is a library, not an endpoint. No framework, plain Workers code.
//
// Hard rules implemented here:
// - Dates are ET calendar dates as TEXT (YYYY-MM-DD). The API never
//   converts a due_date / date to a UTC timestamp; it only validates
//   the YYYY-MM-DD shape. created_at / updated_at are audit stamps
//   (SQLite datetime('now')), never user-facing dates.
// - Mutable rows carry actor + updated_at on every write.
// - Actor comes from the Cloudflare Access identity header when
//   present. Otherwise the caller is a service/Muse write and the
//   actor is the placeholder "service". No user email is ever
//   hardcoded in this repo (emails live in the Cloudflare Access
//   policy, not in code).
// - Child values: pia, misha only. Item categories and lunch plans
//   are allow-listed below. Lunch only — there is no other meal
//   table, field, or endpoint in this API.

export const CHILDREN = ["pia", "misha"];
export const ITEM_CATEGORIES = [
  "test",
  "homework",
  "project",
  "form_to_sign",
  "event",
  "no_school",
  "heads_up",
];
export const ITEM_STATUSES = ["open", "done"];
export const LUNCH_PLANS = ["undecided", "school", "pack"];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateText(v) {
  if (typeof v !== "string" || !DATE_RE.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  // Reject impossible calendar dates (e.g. 2026-02-30).
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  );
}

export function actorOf(request) {
  // Cloudflare Access sets this header for human sign-ins.
  return (
    request.headers.get("Cf-Access-Authenticated-User-Email") || "service"
  );
}

export function json(body, status = 200) {
  return Response.json(body, { status });
}

export function error(message, status = 400) {
  return json({ ok: false, error: message }, status);
}

export function dbOrError(context) {
  if (!context.env.DB) return error("D1 binding DB is not configured", 500);
  return null;
}

export async function readJson(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { body: null, error: "Request body must be a JSON object" };
    }
    return { body, error: null };
  } catch {
    return { body: null, error: "Request body must be valid JSON" };
  }
}

function toBool(v) {
  if (v === true || v === 1 || v === "1" || v === "true") return 1;
  if (v === false || v === 0 || v === "0" || v === "false") return 0;
  return null;
}

function cleanText(v, max = 4000) {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string") return null;
  return v.trim().slice(0, max);
}

// Validate a full item payload (POST). Returns {value} or {error}.
export function validateItemInput(body) {
  if (!CHILDREN.includes(body.child)) return { error: "child must be pia or misha" };
  const title = cleanText(body.title, 500);
  if (!title) return { error: "title is required" };
  if (!ITEM_CATEGORIES.includes(body.category)) {
    return { error: "category must be one of: " + ITEM_CATEGORIES.join(", ") };
  }
  if (!isDateText(body.due_date)) return { error: "due_date must be YYYY-MM-DD" };
  if (body.due_time !== undefined && body.due_time !== null && body.due_time !== "") {
    if (typeof body.due_time !== "string" || !/^\d{2}:\d{2}(:\d{2})?$/.test(body.due_time)) {
      return { error: "due_time must be HH:MM" };
    }
  }
  if (body.status !== undefined && !ITEM_STATUSES.includes(body.status)) {
    return { error: "status must be open or done" };
  }
  const details = cleanText(body.details);
  const source = cleanText(body.source, 500);
  if (details === null || source === null) return { error: "details and source must be strings" };
  return {
    value: {
      child: body.child,
      title,
      category: body.category,
      due_date: body.due_date,
      due_time: body.due_time ? String(body.due_time).slice(0, 5) : null,
      status: body.status || "open",
      details,
      source,
    },
  };
}

// Validate a partial item payload (PATCH). At least one field required.
export function validateItemPatch(body) {
  const allowed = ["child", "title", "category", "due_date", "due_time", "status", "details", "source"];
  const out = {};
  for (const key of allowed) {
    if (body[key] === undefined) continue;
    if (key === "child" && !CHILDREN.includes(body.child)) return { error: "child must be pia or misha" };
    if (key === "title") {
      const t = cleanText(body.title, 500);
      if (!t) return { error: "title must not be empty" };
      out.title = t;
    } else if (key === "category" && !ITEM_CATEGORIES.includes(body.category)) {
      return { error: "category must be one of: " + ITEM_CATEGORIES.join(", ") };
    } else if (key === "due_date" && !isDateText(body.due_date)) {
      return { error: "due_date must be YYYY-MM-DD" };
    } else if (key === "due_time") {
      if (body.due_time === null || body.due_time === "") out.due_time = null;
      else if (typeof body.due_time === "string" && /^\d{2}:\d{2}(:\d{2})?$/.test(body.due_time)) out.due_time = body.due_time.slice(0, 5);
      else return { error: "due_time must be HH:MM" };
    } else if (key === "status" && !ITEM_STATUSES.includes(body.status)) {
      return { error: "status must be open or done" };
    } else if (key === "details" || key === "source") {
      const t = cleanText(body[key], key === "source" ? 500 : 4000);
      if (t === null) return { error: key + " must be a string" };
      out[key] = t;
    } else {
      out[key] = body[key];
    }
  }
  if (Object.keys(out).length === 0) return { error: "No updatable fields provided" };
  return { value: out };
}

export function validateLunchInput(body) {
  if (!CHILDREN.includes(body.child)) return { error: "child must be pia or misha" };
  if (!isDateText(body.date)) return { error: "date must be YYYY-MM-DD" };
  if (body.plan !== undefined && !LUNCH_PLANS.includes(body.plan)) {
    return { error: "plan must be undecided, school, or pack" };
  }
  const noSchool = body.no_school === undefined ? 0 : toBool(body.no_school);
  if (noSchool === null) return { error: "no_school must be a boolean" };
  const menuText = cleanText(body.menu_text);
  const note = cleanText(body.note);
  const source = cleanText(body.source, 500);
  if (menuText === null || note === null || source === null) {
    return { error: "menu_text, note and source must be strings" };
  }
  return {
    value: {
      child: body.child,
      date: body.date,
      menu_text: menuText,
      no_school: noSchool,
      plan: body.plan || "undecided",
      note,
      source,
    },
  };
}

export function validateLunchPatch(body) {
  const out = {};
  if (body.menu_text !== undefined) {
    const t = cleanText(body.menu_text);
    if (t === null) return { error: "menu_text must be a string" };
    out.menu_text = t;
  }
  if (body.no_school !== undefined) {
    const b = toBool(body.no_school);
    if (b === null) return { error: "no_school must be a boolean" };
    out.no_school = b;
  }
  if (body.plan !== undefined) {
    if (!LUNCH_PLANS.includes(body.plan)) return { error: "plan must be undecided, school, or pack" };
    out.plan = body.plan;
  }
  if (body.note !== undefined) {
    const t = cleanText(body.note);
    if (t === null) return { error: "note must be a string" };
    out.note = t;
  }
  if (body.source !== undefined) {
    const t = cleanText(body.source, 500);
    if (t === null) return { error: "source must be a string" };
    out.source = t;
  }
  if (Object.keys(out).length === 0) return { error: "No updatable fields provided" };
  return { value: out };
}

export function rowToItem(r) {
  return r
    ? {
        id: r.id,
        child: r.child,
        title: r.title,
        category: r.category,
        due_date: r.due_date,
        due_time: r.due_time,
        status: r.status,
        details: r.details || "",
        source: r.source || "",
        actor: r.actor || "",
        created_at: r.created_at,
        updated_at: r.updated_at,
      }
    : null;
}

export function rowToLunch(r) {
  return r
    ? {
        id: r.id,
        child: r.child,
        date: r.date,
        menu_text: r.menu_text || "",
        no_school: r.no_school === 1,
        plan: r.plan,
        note: r.note || "",
        source: r.source || "",
        actor: r.actor || "",
        created_at: r.created_at,
        updated_at: r.updated_at,
      }
    : null;
}
