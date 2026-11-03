# Family Pilot

Family school tracker: tasks and school lunch for the kids, shared by both parents.

- Hosting: Cloudflare Pages + D1
- Frontend: plain HTML, CSS, and vanilla JavaScript (no framework)
- Backend: Pages Functions, D1 as the only database
- Login: Cloudflare Access (allowlisted parents only — addresses are configured in Cloudflare, never listed in this repo)
- Scope: lunch only
- Subdomain: family-pilot.mankala.space (Namecheap CNAME-only, no nameserver move)

Secrets (service tokens, push keys) live in Cloudflare/Wrangler secrets only — never in this repo.

## Phase 0 — scaffold (this commit)

Files in this commit:

- `public/` — hello page, mobile-first CSS, vanilla JS health check
- `functions/api/health.js` — GET /api/health, proves Functions routing
- `migrations/0001_initial.sql` — D1 schema for Phase 1 (items, lunch_days, meta, push_subscriptions, notification_prefs). Dates are ET calendar dates as TEXT, never UTC timestamps. Mutable rows carry actor + updated_at.
- `wrangler.toml` — Pages project `family-pilot`, D1 binding `DB` (fill `database_id` after `wrangler d1 create family-pilot`)

## Phase 0 proof (not yet done — held as one batched ask)

Before Phase 1 features begin, all of these must pass:

1. Connect this repo in Cloudflare Pages as project `family-pilot` and create the D1 database; fill its id in `wrangler.toml`.
2. Add the custom domain `family-pilot.mankala.space` in Pages.
3. At Namecheap, add exactly one record: CNAME `family-pilot` → `family-pilot.pages.dev`. No other Namecheap record changes.
4. No-regression check, before AND after the CNAME change: evite.mankala.space, options-bookie.mankala.space, and play.mankala.space must all still load. Rollback is deleting just the `family-pilot` CNAME.
5. Cloudflare Access: create an application for `family-pilot.mankala.space`, allowlist both parents, and test login from both phones. Also check the direct `family-pilot.pages.dev` URL is not a backdoor around Access.
6. Open `family-pilot.mankala.space`, click Check API, and confirm `/api/health` returns ok.

## Phase 1 — MVP (built locally, NOT yet pushed or seeded to production)

API (`functions/api/`, plain Pages Functions, no framework):
- `GET /api/items?status=&child=&from=&to=`, `POST /api/items`, `PATCH /api/items/:id`, `DELETE /api/items/:id`
- `GET /api/lunch?child=&from=&to=`, `POST /api/lunch`, `PATCH /api/lunch/:id`, `DELETE /api/lunch/:id`
- `POST /api/lunch/import` — batch month import. Import guard: new child+date rows are inserted with plan `undecided`; existing rows may have `menu_text`/`no_school` refreshed, but their `plan` and `note` are NEVER touched. An import day's `plan` field is ignored.
- `GET /api/health` now reports `phase: 1`.
- Shared validation in `functions/api/_shared.js` (underscore = not a route): child pia/misha only, item categories test/homework/project/form_to_sign/event/no_school/heads_up, lunch plans undecided/school/pack, dates as YYYY-MM-DD text. Actor = `Cf-Access-Authenticated-User-Email` header when present, otherwise `service`; no email is hardcoded. All mutations return the updated row and set `actor` + `updated_at`.
- Single `POST /api/lunch` for an existing child+date returns 409 with the existing row (use PATCH or import instead).

UI (`public/`, mobile-first, plain HTML/CSS/vanilla JS):
- Today view: today's lunch per kid + items due today or overdue. Next 14 days view: lunch per kid for the window + items in the window (open includes overdue; done shown only with "Show done").
- Lunch plan toggles (undecided / school / pack) per lunch card; no-school days get a distinct "No school" flag and styling, different from an empty day with no saved row.
- Add/edit/delete item and lunch day forms; Done/reopen buttons. Dates use ET (`America/New_York`) calendar dates, never UTC timestamps.
- No push notifications in Phase 1 (Phase 2/3). The site never scrapes a school site.

Seed preparation (`scripts/`, local only):
- `scripts/seed-check.mjs` validates a seed JSON file (schema, duplicates, plan must not be preset), counts items/lunch, and optionally posts to a LOCAL base only. It REFUSES any base containing `pages.dev` or `mankala.space`.
- `scripts/seed-check-local-test-data.json` is SYNTHETIC test data only (4 items, 4 lunch days, 1 no-school day) — not real dashboard/Sheet data.
- Real production seed (requirements §9, ~20 open items; Misha Nov 2026 lunch 21 entries) is NOT built or verified here; it must be built from the dashboard/Sheet export and count-checked separately after review.

### Test locally (before any push)

```bash
cd ~/workspace/family-pilot-scaffold
node --check functions/api/*.js functions/api/*/*.js public/app.js scripts/seed-check.mjs
node scripts/seed-check.mjs scripts/seed-check-local-test-data.json   # dry run only
npx wrangler pages dev public --port 8788 --local --d1 DB=family-pilot
# In a second shell, with the dev server running:
#   Apply migrations/0001_initial.sql to the LOCAL D1 store if the
#   tables are missing (see note below), then:
node scripts/seed-check.mjs scripts/seed-check-local-test-data.json --post --base http://localhost:8788
```

Local-D1 quirk found while testing: `wrangler pages dev --d1 DB=family-pilot` and `wrangler d1 migrations apply --local` use DIFFERENT local SQLite files (different hashes for the placeholder `database_id` vs the `--d1` name), so a migration applied via the CLI did not appear in the running dev server. For the local test, the migration SQL was applied directly to the dev server's local SQLite file, after which all endpoints worked. This affects local testing only — production migration still goes through `wrangler d1 migrations apply` against the real D1 database after the real `database_id` is filled in `wrangler.toml` (still a placeholder here; do not invent one).

### After review — exact next steps (do not do these until reviewed)

1. Confirm the pages.dev second door is closed (second destination on the same Access app, saved + login-tested on pages.dev).
2. Copy this scaffold into `MankalMR/FamilyPilot`, commit, push to main (auto-deploys to Pages).
3. In Cloudflare, fill the real D1 `database_id` in `wrangler.toml` if not already done, then `wrangler d1 migrations apply family-pilot --remote` (or via the Pages D1 binding flow).
4. Build the real seed from the dashboard/Sheet export, run `scripts/seed-check.mjs` on it (expect ~20 open items, Misha Nov 2026 lunch 21), then post it to production via `/api/lunch/import` + `/api/items` with a service actor.
5. Verify on the live site: both phones log in, Today/Week render, a plan survives a re-import, counts match the Sheet/dashboard.

Push (Phase 2) and fan-out (Phase 3) come after the MVP works.
