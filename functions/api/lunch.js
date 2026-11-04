// GET /api/lunch?child=&from=&to= — list lunch days
// POST /api/lunch — create a lunch day. Returns the created row.
// A single POST never overwrites an existing child+date row: it
// returns 409 with the existing row. Bulk month loads use
// POST /api/lunch/import, which may refresh menu_text but never
// touches an existing plan.
import {
  actorOf,
  dbOrError,
  error,
  isDateText,
  json,
  readJson,
  rowToLunch,
  validateLunchInput,
} from "./_shared.js";
import { kidLabel, mainDish, sendPush } from "./_push.js";

async function notify(context, actor, event) {
  try {
    await sendPush(context.env, { actor, ...event });
  } catch {}
}

export async function onRequestGet(context) {
  const bad = dbOrError(context);
  if (bad) return bad;
  const url = new URL(context.request.url);
  const child = url.searchParams.get("child");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (child && !["pia", "misha"].includes(child)) return error("child must be pia or misha");
  if (from && !isDateText(from)) return error("from must be YYYY-MM-DD");
  if (to && !isDateText(to)) return error("to must be YYYY-MM-DD");

  let sql = "SELECT * FROM lunch_days WHERE 1=1";
  const params = [];
  if (child) { sql += " AND child = ?"; params.push(child); }
  if (from) { sql += " AND date >= ?"; params.push(from); }
  if (to) { sql += " AND date <= ?"; params.push(to); }
  sql += " ORDER BY date ASC, child ASC";

  const { results } = await context.env.DB.prepare(sql).bind(...params).all();
  return json({ ok: true, lunch: (results || []).map(rowToLunch) });
}

export async function onRequestPost(context) {
  const bad = dbOrError(context);
  if (bad) return bad;
  const { body, error: parseError } = await readJson(context.request);
  if (parseError) return error(parseError);
  const { value, error: vError } = validateLunchInput(body);
  if (vError) return error(vError);
  const existing = await context.env.DB.prepare(
    "SELECT * FROM lunch_days WHERE child = ? AND date = ?"
  )
    .bind(value.child, value.date)
    .first();
  if (existing) {
    return json(
      { ok: false, error: "A lunch day already exists for this child and date; use PATCH or /api/lunch/import instead", lunch: rowToLunch(existing) },
      409
    );
  }
  const actor = actorOf(context.request);
  const res = await context.env.DB.prepare(
    "INSERT INTO lunch_days (child, date, menu_text, no_school, plan, note, source, actor) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(value.child, value.date, value.menu_text, value.no_school, value.plan, value.note, value.source, actor)
    .run();
  const row = await context.env.DB.prepare("SELECT * FROM lunch_days WHERE id = ?")
    .bind(res.meta.last_row_id)
    .first();
  await notify(context, actor, {
    eventType: "lunch_change",
    title: value.no_school
      ? `${kidLabel(value.child)} · No school: ${value.date}`
      : `${kidLabel(value.child)} · Lunch added: ${value.date}`,
    body: value.no_school ? "" : mainDish(value.menu_text),
  });
  return json({ ok: true, lunch: rowToLunch(row) }, 201);
}
