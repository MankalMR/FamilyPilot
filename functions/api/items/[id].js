// PATCH /api/items/:id — edit, including status open/done. Returns the updated row.
// DELETE /api/items/:id — delete. Returns {deleted: true, id}.
import {
  actorOf,
  dbOrError,
  error,
  json,
  readJson,
  rowToItem,
  validateItemPatch,
} from "../_shared.js";
import { kidLabel, sendPush } from "../_push.js";

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
  const { value, error: vError } = validateItemPatch(body);
  if (vError) return error(vError);

  const existing = await context.env.DB.prepare("SELECT * FROM items WHERE id = ?").bind(id).first();
  if (!existing) return error("Item not found", 404);

  const actor = actorOf(context.request);
  const sets = Object.keys(value).map((k) => `${k} = ?`).join(", ");
  const params = [...Object.values(value), actor, id];
  await context.env.DB.prepare(
    `UPDATE items SET ${sets}, actor = ?, updated_at = datetime('now') WHERE id = ?`
  )
    .bind(...params)
    .run();
  const row = await context.env.DB.prepare("SELECT * FROM items WHERE id = ?").bind(id).first();
  const statusChanged = value.status !== undefined && value.status !== existing.status;
  await notify(context, actor, {
    eventType: "status_change",
    title: statusChanged
      ? `${kidLabel(row.child)} · ${row.status === "done" ? "Done" : "Reopened"}: ${row.title}`
      : `${kidLabel(row.child)} · Updated: ${row.title}`,
    body: `Due ${row.due_date}${row.due_time ? " " + row.due_time : ""}`,
  });
  return json({ ok: true, item: rowToItem(row) });
}

export async function onRequestDelete(context) {
  const bad = dbOrError(context);
  if (bad) return bad;
  const id = Number(context.params.id);
  if (!Number.isInteger(id) || id <= 0) return error("id must be a positive integer", 404);
  const existing = await context.env.DB.prepare("SELECT * FROM items WHERE id = ?").bind(id).first();
  if (!existing) return error("Item not found", 404);
  await context.env.DB.prepare("DELETE FROM items WHERE id = ?").bind(id).run();
  await notify(context, actorOf(context.request), {
    eventType: "status_change",
    title: `${kidLabel(existing.child)} · Removed: ${existing.title}`,
    body: `Due ${existing.due_date}`,
  });
  return json({ ok: true, deleted: true, id });
}
