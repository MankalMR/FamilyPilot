// PATCH /api/lunch/:id — edit, including plan undecided/school/pack.
//   Returns the updated row. This is the ONLY endpoint that changes
//   a plan; imports never do.
// DELETE /api/lunch/:id — delete. Returns {deleted: true, id}.
import {
  actorOf,
  dbOrError,
  error,
  json,
  readJson,
  rowToLunch,
  validateLunchPatch,
} from "../_shared.js";
import { kidLabel, mainDish, planLabel, sendPush } from "../_push.js";

async function notify(context, actor, event) {
  try {
    await sendPush(context.env, { actor, ...event });
  } catch {}
}

export async function onRequestPatch(context) {
  const bad = dbOrError(context);
  if (bad) return bad;
  const id = Number(context.params.id);
  if (!Number.isInteger(id) || id <= 0) return error("id must be a positive integer", 404);
  const { body, error: parseError } = await readJson(context.request);
  if (parseError) return error(parseError);
  const { value, error: vError } = validateLunchPatch(body);
  if (vError) return error(vError);

  const existing = await context.env.DB.prepare("SELECT * FROM lunch_days WHERE id = ?").bind(id).first();
  if (!existing) return error("Lunch day not found", 404);

  const actor = actorOf(context.request);
  const sets = Object.keys(value).map((k) => `${k} = ?`).join(", ");
  const params = [...Object.values(value), actor, id];
  await context.env.DB.prepare(
    `UPDATE lunch_days SET ${sets}, actor = ?, updated_at = datetime('now') WHERE id = ?`
  )
    .bind(...params)
    .run();
  const row = await context.env.DB.prepare("SELECT * FROM lunch_days WHERE id = ?").bind(id).first();
  const planChanged = value.plan !== undefined && value.plan !== existing.plan;
  await notify(context, actor, planChanged ? {
    eventType: "lunch_plan_change",
    title: `${kidLabel(row.child)} · Lunch plan: ${planLabel(row.plan)}`,
    body: `${row.date}${row.no_school ? "" : " · " + mainDish(row.menu_text)}`,
  } : {
    eventType: "lunch_change",
    title: row.no_school
      ? `${kidLabel(row.child)} · No school: ${row.date}`
      : `${kidLabel(row.child)} · Lunch updated: ${row.date}`,
    body: row.no_school ? "" : mainDish(row.menu_text),
  });
  return json({ ok: true, lunch: rowToLunch(row) });
}

export async function onRequestDelete(context) {
  const bad = dbOrError(context);
  if (bad) return bad;
  const id = Number(context.params.id);
  if (!Number.isInteger(id) || id <= 0) return error("id must be a positive integer", 404);
  const existing = await context.env.DB.prepare("SELECT * FROM lunch_days WHERE id = ?").bind(id).first();
  if (!existing) return error("Lunch day not found", 404);
  await context.env.DB.prepare("DELETE FROM lunch_days WHERE id = ?").bind(id).run();
  await notify(context, actorOf(context.request), {
    eventType: "lunch_change",
    title: `${kidLabel(existing.child)} · Lunch removed: ${existing.date}`,
    body: "",
  });
  return json({ ok: true, deleted: true, id });
}
