// GET /api/records?child= — list info-only reference records.
// Records are written by Parent Muse scans directly to D1 (the
// same write-D1-directly rule as items/lunch); there is no POST
// here, so the site can never turn a record into a task, a due
// date, or an alert. Read-only by design.
import { dbOrError, error, json } from "./_shared.js";

export async function onRequestGet(context) {
  const bad = dbOrError(context);
  if (bad) return bad;
  const url = new URL(context.request.url);
  const child = url.searchParams.get("child");
  if (child && !["pia", "misha"].includes(child)) return error("child must be pia or misha");
  let sql = "SELECT * FROM records WHERE 1=1";
  const params = [];
  if (child) { sql += " AND child = ?"; params.push(child); }
  sql += " ORDER BY as_of DESC, id DESC";
  const { results } = await context.env.DB.prepare(sql).bind(...params).all();
  return json({ ok: true, records: results || [] });
}
