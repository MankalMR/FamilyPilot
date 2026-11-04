// POST /api/lunch/import — batch import of a month's lunch days.
//   Used by Muse refresh jobs. The site itself never scrapes a
//   school site; callers bring already-fetched menu data here.
//
//   Import guard (load-bearing, from requirements §0):
//   - A new child+date row is inserted with plan "undecided".
//   - An existing child+date row MAY have its menu_text (and
//     no_school flag) refreshed, but its plan is NEVER touched,
//     and its user note is NEVER touched.
//   - An import day never sets a plan, even if the caller sends
//     one: the plan field is ignored on import.
//   Invalid days are reported in `errors` and do not abort the
//   rest of the batch. The response summary counts what happened.
//
//   Body: { "days": [{child, date, menu_text, no_school, note?, source?}, ...] }
//   An optional top-level "source" is used as a fallback for days
//   without their own source. A day's own source wins.
import {
  actorOf,
  dbOrError,
  error,
  isDateText,
  json,
  readJson,
} from "../_shared.js";
import { sendPush } from "../_push.js";

export async function onRequestPost(context) {
  const bad = dbOrError(context);
  if (bad) return bad;
  const { body, error: parseError } = await readJson(context.request);
  if (parseError) return error(parseError);
  if (!Array.isArray(body.days) || body.days.length === 0) {
    return error("days must be a non-empty array");
  }
  const fallbackSource = typeof body.source === "string" ? body.source.slice(0, 500) : "";
  const actor = actorOf(context.request);

  let inserted = 0;
  let menuUpdated = 0;
  let unchanged = 0;
  const errors = [];

  for (let i = 0; i < body.days.length; i++) {
    const day = body.days[i];
    if (!day || typeof day !== "object") {
      errors.push({ index: i, error: "Day must be an object" });
      continue;
    }
    if (!["pia", "misha"].includes(day.child)) {
      errors.push({ index: i, child: day.child, date: day.date, error: "child must be pia or misha" });
      continue;
    }
    if (!isDateText(day.date)) {
      errors.push({ index: i, child: day.child, date: day.date, error: "date must be YYYY-MM-DD" });
      continue;
    }
    const menuText = typeof day.menu_text === "string" ? day.menu_text.trim().slice(0, 4000) : "";
    const noSchool = day.no_school === true || day.no_school === 1 || day.no_school === "1" ? 1 : 0;
    const source = (typeof day.source === "string" && day.source ? day.source : fallbackSource).slice(0, 500);

    const existing = await context.env.DB.prepare(
      "SELECT * FROM lunch_days WHERE child = ? AND date = ?"
    )
      .bind(day.child, day.date)
      .first();

    if (!existing) {
      await context.env.DB.prepare(
        "INSERT INTO lunch_days (child, date, menu_text, no_school, plan, note, source, actor) VALUES (?, ?, ?, ?, 'undecided', '', ?, ?)"
      )
        .bind(day.child, day.date, menuText, noSchool, source, actor)
        .run();
      inserted++;
    } else if (existing.menu_text !== menuText || existing.no_school !== noSchool) {
      // Refresh the menu only. plan and note are deliberately
      // absent from this UPDATE — a parent's plan decision and
      // note survive every monthly import, unchanged.
      await context.env.DB.prepare(
        "UPDATE lunch_days SET menu_text = ?, no_school = ?, source = ?, actor = ?, updated_at = datetime('now') WHERE id = ?"
      )
        .bind(menuText, noSchool, source, actor, existing.id)
        .run();
      menuUpdated++;
    } else {
      unchanged++;
    }
  }

  // One batched menu_load push for the whole import, never one
  // per day. menu_load defaults OFF (see _push.js), so this is a
  // no-op unless a parent turns it on — the batching is what keeps
  // it from becoming 30+ pushes if they do.
  if (inserted + menuUpdated > 0) {
    try {
      await sendPush(context.env, {
        actor,
        eventType: "menu_load",
        title: "Menus loaded",
        body: `${inserted} new days, ${menuUpdated} updated.`,
      });
    } catch {}
  }

  return json({
    ok: true,
    inserted,
    menu_updated: menuUpdated,
    unchanged,
    errors,
    total: body.days.length,
  });
}
