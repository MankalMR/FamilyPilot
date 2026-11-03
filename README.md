# Family Pilot

Family school tracker: tasks and school lunch for the kids, shared by both parents.

- Hosting: Cloudflare Pages + D1
- Frontend: plain HTML, CSS, and vanilla JavaScript (no framework)
- Backend: Pages Functions, D1 as the only database
- Login: Cloudflare Access (allowlisted parents only)
- Scope: lunch only — no breakfast content
- Subdomain: family-pilot.mankala.space (Namecheap CNAME-only, no nameserver move)

Secrets (service tokens, push keys) live in Cloudflare/Wrangler secrets only — never in this repo.
