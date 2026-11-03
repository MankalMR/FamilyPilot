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

export async function onRequestPatch(context) {
  const bad = dbOrError(context);
  if (bad) return bad;
  const id = Number(context.params.id);
  if (!Number.isInteger(id) || id <= 0) return error("id must be a positive integer", 404);
  const { body, error: parseError } = await readJson(context.request);
  if (parseError) return error(parseError);
  const { value, error: vError } = validateItemPatch(body);
  if (vError) return error(vError);

  const existing = await context.env.DB.prepare("SELECT id FROM items WHERE id = ?").bind(id).first();
  if (!existing) return error("Item not found", 404);

  const sets = Object.keys(value).map((k) => `${k} = ?`).join(", ");
  const params = [...Object.values(value), actorOf(context.request), id];
  await context.env.DB.prepare(
    `UPDATE items SET ${sets}, actor = ?, updated_at = datetime('now') WHERE id = ?`
  )
    .bind(...params)
    .run();
  const row = await context.env.DB.prepare("SELECT * FROM items WHERE id = ?").bind(id).first();
  return json({ ok: true, item: rowToItem(row) });
}

export async function onRequestDelete(context) {
  const bad = dbOrError(context);
  if (bad) return bad;
  const id = Number(context.params.id);
  if (!Number.isInteger(id) || id <= 0) return error("id must be a positive integer", 404);
  const existing = await context.env.DB.prepare("SELECT id FROM items WHERE id = ?").bind(id).first();
  if (!existing) return error("Item not found", 404);
  await context.env.DB.prepare("DELETE FROM items WHERE id = ?").bind(id).run();
  return json({ ok: true, deleted: true, id });
}
