// Family Pilot — seed check (LOCAL ONLY, Phase 1 preparation).
//
// Purpose: validate a seed JSON file BEFORE it is ever used, count
// what it would load, and — only with --post and a LOCAL base URL —
// send it to a locally running Pages dev server.
//
//   node scripts/seed-check.mjs scripts/seed-check-local-test-data.json
//   node scripts/seed-check.mjs seed.json --post --base http://localhost:8788
//
// This script NEVER targets production. It refuses any base URL
// containing pages.dev or mankala.space, and it never reads the
// dashboard, the Sheet, or any school site. Real seed data must
// come later from the dashboard/Sheet export (requirements §9);
// the bundled example file is synthetic test data only, so its
// counts are local-test counts, not production counts.
//
// Seed JSON shape:
//   { "items": [{child, title, category, due_date, due_time?, details?, source?}],
//     "lunch": [{child, date, menu_text?, no_school?, note?, source?}] }
// Import guard (also enforced server-side): an import never
// overwrites an existing lunch plan. This script only counts;
// the server decides inserted vs menu_updated.
//
// Expected production scale (requirements §9, for the later real
// seed — NOT verified here): ~20 open items; Misha November 2026
// lunch 21 entries (16 school days + Nov 23-27 no-school days).
// Use --expect-items N --expect-lunch CHILD:COUNT to check a file
// against an expected scale, e.g.:
//   node scripts/seed-check.mjs seed.json --expect-items 20 --expect-lunch misha:21

import { readFileSync } from "node:fs";

const CHILDREN = new Set(["pia", "misha"]);
const CATEGORIES = new Set(["test", "homework", "project", "form_to_sign", "event", "no_school", "heads_up"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function fail(msg) {
  console.error("seed-check: " + msg);
  process.exit(1);
}

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const post = args.includes("--post");
const baseArg = args[args.indexOf("--base") + 1];
const base = baseArg || "http://localhost:8788";
if (!file) fail("Usage: node scripts/seed-check.mjs <seed.json> [--post] [--base URL] [--expect-items N] [--expect-lunch child:count]");

if (post && /pages\.dev|mankala\.space/i.test(base)) {
  fail("Refusing to POST to a production-looking base URL: " + base + " (local only)");
}
if (post && !/^http:\/\/localhost(:\d+)?$/i.test(base)) {
  fail("With --post, base must be a localhost URL, e.g. http://localhost:8788");
}

let data;
try {
  data = JSON.parse(readFileSync(file, "utf8"));
} catch (e) {
  fail("Cannot read/parse " + file + ": " + e.message);
}

const errors = [];
const items = Array.isArray(data.items) ? data.items : [];
const lunch = Array.isArray(data.lunch) ? data.lunch : [];
if (!Array.isArray(data.items)) errors.push("items must be an array");
if (!Array.isArray(data.lunch)) errors.push("lunch must be an array");

const itemKeys = new Set();
items.forEach((it, i) => {
  if (!CHILDREN.has(it.child)) errors.push(`items[${i}]: child must be pia or misha`);
  if (!it.title || typeof it.title !== "string") errors.push(`items[${i}]: title is required`);
  if (!CATEGORIES.has(it.category)) errors.push(`items[${i}]: bad category ${it.category}`);
  if (!DATE.test(it.due_date || "")) errors.push(`items[${i}]: due_date must be YYYY-MM-DD`);
  const key = `${it.child}|${it.title}|${it.due_date}`;
  if (itemKeys.has(key)) errors.push(`items[${i}]: duplicate item ${key}`);
  itemKeys.add(key);
});

const lunchKeys = new Set();
lunch.forEach((day, i) => {
  if (!CHILDREN.has(day.child)) errors.push(`lunch[${i}]: child must be pia or misha`);
  if (!DATE.test(day.date || "")) errors.push(`lunch[${i}]: date must be YYYY-MM-DD`);
  const key = `${day.child}|${day.date}`;
  if (lunchKeys.has(key)) errors.push(`lunch[${i}]: duplicate lunch day ${key}`);
  lunchKeys.add(key);
  if (day.plan !== undefined) errors.push(`lunch[${i}]: plan must not be set in seed data — imports always start undecided`);
});

const openItems = items.length; // seed files are open items by definition
const lunchByChild = {};
for (const day of lunch) lunchByChild[day.child] = (lunchByChild[day.child] || 0) + 1;

console.log(`seed-check: ${file}`);
console.log(`  items: ${items.length} (all treated as open)`);
console.log(`  lunch days: ${lunch.length} ${JSON.stringify(lunchByChild)}`);
console.log(`  no-school lunch days: ${lunch.filter((d) => d.no_school).length}`);
if (errors.length) {
  console.log("  ERRORS:");
  errors.forEach((e) => console.log("   - " + e));
  process.exit(1);
}

// Optional expected-scale checks (for the later real seed).
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--expect-items") {
    const n = Number(args[i + 1]);
    if (openItems !== n) fail(`Expected ${n} items, found ${openItems}`);
    console.log(`  expected items ${n}: OK`);
  }
  if (args[i] === "--expect-lunch") {
    const [child, n] = args[i + 1].split(":");
    if ((lunchByChild[child] || 0) !== Number(n)) fail(`Expected ${n} lunch days for ${child}, found ${lunchByChild[child] || 0}`);
    console.log(`  expected lunch ${child}:${n}: OK`);
  }
}

if (!post) {
  console.log("  DRY RUN only — nothing was posted. Add --post --base http://localhost:8788 to post to local dev.");
  process.exit(0);
}

console.log(`  POSTING to local base ${base} (items one by one, lunch via /api/lunch/import)…`);
let postedItems = 0;
for (const it of items) {
  const res = await fetch(`${base}/api/items`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(it),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) fail(`POST /api/items failed for ${it.title}: ${JSON.stringify(body)}`);
  postedItems++;
}
const imp = await fetch(`${base}/api/lunch/import`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ days: lunch, source: "seed-check-local" }),
});
const impBody = await imp.json().catch(() => ({}));
if (!imp.ok) fail(`POST /api/lunch/import failed: ${JSON.stringify(impBody)}`);
console.log(`  posted items: ${postedItems}`);
console.log(`  import result: ${JSON.stringify(impBody)}`);
console.log("  DONE (local only — production was not touched)");
