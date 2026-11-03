# Family Pilot

Family school tracker: tasks and school lunch for the kids, shared by both parents.

- Hosting: Cloudflare Pages + D1
- Frontend: plain HTML, CSS, and vanilla JavaScript (no framework)
- Backend: Pages Functions, D1 as the only database
- Login: Cloudflare Access (allowlisted parents only — addresses are configured in Cloudflare, never listed in this repo)
- Scope: lunch only — no breakfast content
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

Phase 1 (next): items + lunch API and Today/Week UI, seeded and count-checked. Push (Phase 2) and fan-out (Phase 3) come after the MVP works.
