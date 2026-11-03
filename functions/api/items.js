// GET /api/items?status=&child=&from=&to=  — list items
// POST /api/items — create an item. Returns the created row.
import {
  actorOf,
  dbOrError,
  error,
  isDateText,
  json,
  readJson,
  rowToItem,
  validateItemInput,
} from "./_shared.js";

export async function onRequestGet(context) {
  const bad = dbOrError(context);
  if (bad) return bad;
  const url = new URL(context.request.url);
  const status = url.searchParams.get("status");
  const child = url.searchParams.get("child");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (status && !["open", "done"].includes(status)) return error("status must be open or done");
  if (child && !["pia", "misha"].includes(child)) return error("child must be pia or misha");
  if (from && !isDateText(from)) return error("from must be YYYY-MM-DD");
  if (to && !isDateText(to)) return error("to must be YYYY-MM-DD");

  let sql = "SELECT * FROM items WHERE 1=1";
  const params = [];
  if (status) { sql += " AND status = ?"; params.push(status); }
  if (child) { sql += " AND child = ?"; params.push(child); }
  if (from) { sql += " AND due_date >= ?"; params.push(from); }
  if (to) { sql += " AND due_date <= ?"; params.push(to); }
  sql += " ORDER BY due_date ASC, id ASC";

  const { results } = await context.env.DB.prepare(sql).bind(...params).all();
  return json({ ok: true, items: (results || []).map(rowToItem) });
}

export async function onRequestPost(context) {
  const bad = dbOrError(context);
  if (bad) return bad;
  const { body, error: parseError } = await readJson(context.request);
  if (parseError) return error(parseError);
  const { value, error: vError } = validateItemInput(body);
  if (vError) return error(vError);
  const actor = actorOf(context.request);
  const res = await context.env.DB.prepare(
    "INSERT INTO items (child, title, category, due_date, due_time, status, details, source, actor) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(value.child, value.title, value.category, value.due_date, value.due_time, value.status, value.details, value.source, actor)
    .run();
  const row = await context.env.DB.prepare("SELECT * FROM items WHERE id = ?")
    .bind(res.meta.last_row_id)
    .first();
  return json({ ok: true, item: rowToItem(row) }, 201);
}
