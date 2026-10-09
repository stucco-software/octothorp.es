# v0.7 Cutover Checklist

The cutover source is `development` (merge-prep merged back via PR #308). Staging (next) verified green 2026-10-08: smoketest 24/24, api-smoketest clean, B2 CORS live, /admin auth wall confirmed. What follows is in execution order; the first five are pre-cutover, the last three are the cutover itself and its tail.

## Before the switch

- [ ] Set `admin_secret` in the Vercel env for next and production. Without it, every /admin action returns 503.
- [ ] Click through /admin on next: approve, ban, and unban a test origin via the form. The endpoints are tested; no human has used the page yet.
- [ ] Run the remaining manual checks from the week doc §5 that the smoketests don't cover: webring handshake, badge flow, and a browser-initiated index via an embedded `octo-thorpe` (also confirms the new script-origin server default).
- [ ] Pin the Oxigraph image to the version tested on next. Production runs 0.3 on an unpinned `latest`; next tested on 0.4, and #282 was a 0.4-only bug.
- [ ] Dump the production triplestore. The archive tag rolls back code, not data.
- [ ] Close #307 and #275 (both verified; note the scheme caveat on #276/#277 when closing #275).
- [ ] #309: the SvelteKit side reads the resolved profile's `identity.instance`, not raw `.env`. Pulled forward because the Railway one-click deploy test needs it.

## The switch

- [ ] Tag `main` as `archive/v0.6`, push the tag, record the SHA.
- [ ] Replace `main` with `development`, tag `v0.7.0`, deploy, watch the Vercel logs.

## After the switch

- [ ] #305 data migration: re-index pages carrying `octo:mentions`, then run `scripts/canonicalize-origins.js` as a dry run and again with `--write`.
- [ ] Run the post-merge api-smoketest checklist against production.
- [ ] Data hygiene, can ride with #305: re-register `mmmx.cloud` as `https://` (it registered as `http://`, so https URLs 401), and delete the junk registration `http://octothorpes-next.fly.dev/null`.

## Deferred — not cutover-blocking

- RDF-star (270) → Deletion (271) → Batch Indexing (274), then docs/demos for the Profile, Handlers, and Publishers epics.
- Read-side domain listings filter only `octo:banned`, not profile blocks (#310 notes).
