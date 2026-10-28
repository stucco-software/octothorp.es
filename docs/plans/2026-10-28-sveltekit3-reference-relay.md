# Plan: SvelteKit 3 reference relay

Status: draft for review
Date: 2026-10-28
Related: #319 (SvelteKit 3 deferred there), `2026-10-06-lite-relay-proposal.md`

## Goal

A new, unstyled SvelteKit 3 app in its own repo that is a full OP relay: it owns a triplestore and serves the whole public relay API. It is the reference client other developers copy, and complete enough that octothorp.es could later move onto it.

Every route is a passthrough: parse the HTTP request, call `octothorpes` core, map the result to a Response. No business logic in the app.

## Decisions (2026-10-28)

- **Backend:** full relay. `createClient` with its own Oxigraph, not `createRemoteClient`.
- **Purpose:** reference client, full-featured enough to replace octothorp.es.
- **Core version:** depends on published `octothorpes`. 0.6.9 is on npm (published 2026-10-27 17:11 PDT), but development has core changes since then: the Link/Backlink enrichment fix (#340/#341) and term identity (#329, adds `termLabels.js`). Publish a 0.6.10 before phase 2, and include the jsonld 9 bump from #319 if that has merged. Use `npm link` / `file:` only while a core change and an app change are being developed together.

## Relationship to the lite-relay proposal

`2026-10-06-lite-relay-proposal.md` recommended Option B (Hono + Liquid, no framework) for operators who want to customize without a build step. This plan is its Option A, rebuilt fresh on SvelteKit 3 instead of extracted from this repo. Both options need the same foundation, so this plan builds that first:

- **`createRelay(client, options)`**: a web-standard `(Request) => Promise<Response>` handler for the public API. It does not exist yet. With it, the SvelteKit app is one catch-all route, and op-test-site, op-atproto, and a later Option B all mount the same handler.

Open question from that proposal, still open: does `createRelay` live in core or in a sibling export (`octothorpes/relay`)? Core has no HTTP code today by design.

## Scope

In:
- `GET /get/:what/:by/:as?` including publishers
- `POST /index` (request, active, blobject modes as configured by the profile)
- `GET /harmonizer/:id`
- `GET /profile.json` and the public profile/identity card
- Origin registration and the term/domain/webring read pages, as plain HTML
- Drop-in handlers, harmonizers, publishers, endorsers loaded from a built path

Out:
- Any CSS or design work
- Explore UI, web components, badges, flyer/about/demo pages
- Admin UI, email, settings editor (a later `<op-profile-editor>` can be embedded)
- Bridges

## Phases

1. **`createRelay` in core.** Port the route behavior from this repo's `/get`, `/index`, `/harmonizer/[id]`, `/profile` routes into one handler, including the shared error mapping (core validation errors -> 4xx, everything else -> 500). op-test-site adopts it first as the proving ground. Publish.
2. **Scaffold.** `sv create` on SvelteKit 3, Node 24, adapter-node, `paths.origin` from env. Config lives in `vite.config.js`; imports use `#lib`. `profile.json` + `.env` (secrets only).
3. **Wire core.** `#lib/op.js` builds one `createClient` from profile + env. A single `src/routes/[...path]/+server.js` hands API requests to `createRelay`.
4. **Bare HTML pages.** Server-rendered pages for home (profile summary), terms, domains, webrings, registration, plus one `<form>` each for `/get` and `/index`. Data comes from `op.get()` in `+page.server.js`. No CSS.
5. **Conformance.** Run `api-smoketest` and `production-smoke` against this app and octothorp.es and diff the results. Differences are bugs in one of them.
6. **Deploy template.** `Dockerfile` + Railway template (app + Oxigraph), following `docs/railway-deploy.md`.

## Known traps

- **CSRF is always on in SvelteKit 3.** `csrf.checkOrigin: false` is gone. Cross-origin `POST /index` from member sites needs `csrf.trustedOrigins` (`'*'` reproduces today's behavior) or a required `Content-Type` contract. Decide this in phase 2; it is protocol-visible.
- **Extensions must load from a built path** (`static/` or similar), walked at runtime. Source-tree imports with `@vite-ignore` break in production.
- **One bad publisher must not take down `/get`.** Load publishers with per-extension try/catch, as `src/lib/indexing.js` does for handlers.
- **Empty 2xx responses have no body in SvelteKit 3.** Check any route that returns an empty JSON body today.
- **adapter-node serves only static files present at build time.** Extensions or assets dropped in after build will not be served.

## Open questions

- `createRelay` in core or `octothorpes/relay`?
- Repo name and location (`~/dev/<name>`), and whether it lives under stucco-software.
- `csrf.trustedOrigins: '*'` vs a `Content-Type` contract for `/index`.
- Does octothorp.es move onto `createRelay` before this app exists? That would remove the `/index` + `/indexwrapper` duplication early.
