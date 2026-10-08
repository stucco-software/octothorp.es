# Proposal: A Lightweight OP Relay

Status: proposal (not scheduled)
Date: 2026-10-06

## Problem

The octothorp.es SvelteKit site is the flagship relay. It has to carry every feature, demo page, and route the project needs, which makes it a poor starting point for someone who wants to run their own relay. A semi-technical operator wants three things it doesn't make easy:

1. **Change how it looks** without learning a framework.
2. **Use it**: index, query, browse terms and members.
3. **Configure the OP client settings** (`octothorpes.json`: identity, policies, routes, vocabulary, extensions) without hand-editing JSON against a schema.

op-test-site and op-atproto already show that core does almost all of the work. op-test-site is a working relay in about 360 lines of `node:http`. What each of those repos re-implements is the glue: env and profile to `createClient` config, and a hand-written route table.

## Shared foundation (needed by either option)

These pieces belong in core, or next to it, regardless of which option is chosen.

**`createRelay(client, options)`** — a web-standard `(Request) => Promise<Response>` handler covering the public relay API:

- `GET /get/:what/:by` (and `?as=` publishers)
- `POST /index`
- `GET /harmonize`
- `GET /profile.json`
- `GET /identity.json`
- `GET /debug/*`

It owns the URL shape that `routes` in `createClient` currently has to be told about. It replaces the route tables in op-test-site, op-atproto, and the thin `/index` + `/indexwrapper` wrappers in this repo. Because it uses the standard `Request`/`Response` shape, it runs unchanged on Node, Bun, Deno, or behind a SvelteKit catch-all route.

**A schema-driven settings editor.** This is a form generated from `profile.schema.json`. It validates with the same ajv setup `profile.js` uses and writes `octothorpes.json`, then reloads the client. It's built once as a framework-free web component (`<op-profile-editor>`) so both options can embed it. This is the piece that addresses "configure the OP client settings", and it doesn't exist anywhere today.

**Component bundle.** The `octo-*` web components (`src/lib/web-components/`) published as one versioned bundle, so a relay can serve its own copy instead of loading from octothorp.es.

## Option A: Retool the SvelteKit site ("relay starter")

Extract a separate template repo from this one rather than adding feature flags to the flagship.

What it keeps:
- the `/get`, `/index`, `/harmonize`, `/profile.json`, `/debug` routes, rewritten as a single catch-all that delegates to `createRelay`
- `explore`, `terms`, `domains`, `webrings`, `register`, `badge`
- one layout and one stylesheet

What it drops: `about`, `ethos`, `flyer`, `ratbike`, `wwo`/`xoxo` pages, `docs`, `vocab`, demo pages, and anything flagship-specific.

How it's customized:
- **Look:** a single `theme.css` of CSS custom properties (lewk-compatible). Layout markup lives in one `+layout.svelte` that's commented for non-Svelte users.
- **Settings:** an `/admin/settings` page that hosts `<op-profile-editor>`.

| Pros | Cons |
|---|---|
| Reuses the most existing UI (explore, terms, register pages) | Operators who want to change markup still face Svelte and a build step |
| Same stack as the flagship; fixes flow both ways | The template drifts from octothorp.es unless it's regenerated from it |
| Railway template already exists for this stack (`Dockerfile.railway`, `docs/railway-deploy.md`) | `npm run build` on every theme change |

## Option B: No framework (Hono + Liquid templates)

A small Node server with no build step.

```
octothorpes.json        OP client profile (edited via /admin/settings)
.env                    sparql creds + ADMIN_PASSWORD only
theme/
  layout.liquid         page shell
  home.liquid           landing page
  term.liquid           /~/:term page
  domain.liquid         /domains/:origin page
  theme.css             custom properties
static/                 images, fonts, the octo-* bundle
publishers/ handlers/ harmonizers/   drop-in extensions (already walked by discover*)
server.js               ~100 lines: createClient + createRelay + template routes
```

Stack choices:

- **Hono** for routing. It's small and web-standard, so `createRelay` mounts directly. Plain `node:http` (as in op-test-site) also works; Hono adds middleware for sessions, static files, and compression without much weight.
- **Liquid templates** (`liquidjs`). It's the templating language semi-technical people are most likely to have met (Jekyll, Shopify, 11ty). Templates get `op.get()` results as data, so term and domain pages render on the server and work without JavaScript. Interactive pieces use the `octo-*` components.
- **No build step.** Edit a `.liquid` or `.css` file and refresh.

How it's customized, from least to most technical:
1. **Settings page:** identity, policies, and theme colours. No files touched.
2. **`theme/theme.css`:** CSS custom properties.
3. **`theme/*.liquid`:** HTML with `{{ }}` and `{% %}`.
4. **Drop-in publishers, handlers, and harmonizers:** this already works.

| Pros | Cons |
|---|---|
| No build, no framework; the files are the site | New UI to write (explore/terms/register equivalents) |
| Server-rendered pages: works without JS, good for SEO | Second relay codebase to maintain alongside the flagship |
| Same runtime shape as op-test-site, which already passes a profile-matrix smoke test | Liquid is a dependency users need to learn a little of |
| Natural base for the member site (same server pattern) | |

## Recommendation

**Option B.** The goal is "easier to customize than SvelteKit", and Option A only partly delivers that: the moment someone wants to change markup they're back in Svelte with a build step. Option B shares its server pattern with op-test-site and the member site (see `2026-10-06-member-site-design.md`), so the three converge on one runtime shape.

Sequence:
1. `createRelay` in core. op-test-site adopts it first as the proving ground.
2. `<op-profile-editor>` component.
3. Option B template repo, with a Railway template using the existing app + Oxigraph layout from `docs/railway-deploy.md`.

Option A stays available as a fallback if the explore and terms UI turns out to be too much to rebuild.

## Open questions

- Should `createRelay` live in core (`octothorpes`) or a sibling package (`octothorpes/relay`)? Core currently has no HTTP or transport code, by design.
- Should the settings editor be able to edit everything in the profile, or only a "safe" subset, with the rest in the file?
- Does the flagship eventually move onto `createRelay` too, so the `/index` / `/indexwrapper` duplication goes away?
