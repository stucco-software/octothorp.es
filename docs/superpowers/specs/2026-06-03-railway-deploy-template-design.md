# Railway Deploy Template — Design

**Date:** 2026-06-03
**Status:** Approved (pending spec review)

## Goal

Make deploying octothorp.es to Railway fast and repeatable: the SvelteKit
server plus a **private** Oxigraph triplestore with a persistent volume. Two
deliverables:

- **A — Repo config** so a GitHub-connected deploy or `railway up` works for our
  own deploys.
- **B — Shareable Railway Template** (one-click), structured so publishing later
  is just clicking through Railway's template composer. We cannot create the
  published template from code, but we provide everything it needs plus a
  step-by-step.

## Architecture

Two services in one Railway project:

```
┌─────────────────────────────┐         ┌───────────────────────────┐
│  app  (this repo)            │  HTTP   │  oxigraph (docker image)  │
│  SvelteKit + adapter-node    │ ──────▶ │  ghcr.io/oxigraph/oxigraph│
│  public domain, $PORT        │ private │  PRIVATE only, no domain  │
└─────────────────────────────┘ network └────────────┬──────────────┘
                                                      │ volume
                                                ┌─────▼─────┐
                                                │  /data    │ persistent
                                                └───────────┘
```

- **app** — builds from this repo, gets a public Railway domain, listens on
  `$PORT` (adapter-node reads it automatically).
- **oxigraph** — official image, **no public domain**. "Private" means reachable
  only over Railway's internal network. Volume mounted at `/data` so the
  triplestore survives redeploys.
- App reaches the store at `http://oxigraph.railway.internal:7878`. No SPARQL
  auth: privacy is network isolation, not Basic auth (Oxigraph has none).
  `sparql_user`/`sparql_password` are left unset; with the runtime env model
  (see below) they resolve to `undefined` and `createSparqlClient`'s
  `if (user && password)` guard sends no `Authorization` header.

## Runtime env model (build-time → runtime) — REQUIRED

The app currently reads **all** config via `$env/static/private`, which SvelteKit
**bakes into the bundle at build time**. A Docker image is built once and run with
Railway's per-service runtime variables, so static baking would capture empty
values at `docker build` time and never see the real config at runtime. This must
change for the deploy to function at all.

**Fix (smallest blast radius):** a single shim module `src/lib/config.js` that
re-exports every used var from `$env/dynamic/private` (resolved at runtime from
`process.env`), then change the **import source** at every site from
`'$env/static/private'` to `'$lib/config.js'`. Named imports are preserved, so no
per-usage edits — just the source string changes.

```js
// src/lib/config.js
import { env } from '$env/dynamic/private';
export const {
  sparql_endpoint, sparql_user, sparql_password,
  instance, server_name, admin_email, badge_image,
  smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password, robot_email,
} = env;
```

These `const` exports evaluate when the module first loads in the running server
(request time), by which point adapter-node has populated dynamic env — so they
carry real runtime values.

**Affected sites (~30 occurrences across 27 files):** all files importing
`$env/static/private`, including `src/lib/sparql.js`, `src/lib/converters.js`,
`src/lib/getHarmonizer.js`, `src/lib/mail/send.js`, `src/lib/emails/alertAdmin.js`,
`src/lib/assert.js`, `src/lib/ld/rdfa2triples.js`, and many `src/routes/**`
(a few files have two import lines).

**Test mocks (REQUIRED change, not optional):** `src/tests/indexing.test.js` and
`src/tests/badge-route.test.js` call `vi.mock('$env/static/private', ...)`. After
the source change, those mocks no longer intercept anything and the tests hit
real dynamic env. The mock target **must** change to `$lib/config.js` (or mock
`$env/dynamic/private`). Verify the suite passes after the edit.

**Complete env var set used in code** (reconcile `.env.railway.example` against
this exactly — a referenced-but-undeclared var breaks the import):
`sparql_endpoint`, `sparql_user`, `sparql_password`, `instance`, `server_name`,
`admin_email`, `badge_image`, `smtp_host`, `smtp_port`, `smtp_secure`,
`smtp_user`, `smtp_password`, `robot_email`. (`fastmail_password` appears in
`.env.example` but is **not** referenced in code — drop it from the Railway
example.)

With dynamic env, vars no longer need to be *present at build*. `sparql_user`/
`sparql_password` may simply be unset on Railway — `createSparqlClient` already
guards `if (user && password)`, so no `Authorization` header is sent. (This
guard works correctly only because dynamic env returns `undefined` for unset
keys rather than failing the import the way a static named import would.)

## App build & adapter detection

Keep `adapter-auto`; add `@sveltejs/adapter-node`. `svelte.config.js` selects the
adapter from the environment so local dev and any future Vercel build are
unchanged:

```js
const onRailway =
  process.env.ADAPTER === 'node' || !!process.env.RAILWAY_ENVIRONMENT;
const adapter = onRailway
  ? (await import('@sveltejs/adapter-node')).default
  : (await import('@sveltejs/adapter-auto')).default;
```

Gating on **both** an explicit `ADAPTER=node` (self-documenting, set by the
template) and Railway's auto-injected `RAILWAY_ENVIRONMENT` (fallback so a
forgotten var can't break the build).

`svelte.config.js` is an ESM module; the dynamic `import()` requires the config's
top level to support `await`. SvelteKit loads the config as ESM, so top-level
`await` is available. If it is not in a given toolchain version, fall back to a
static conditional import using a synchronous `require`-free pattern — verify
during implementation.

### Production Dockerfile

New file `Dockerfile.railway` (the existing `Dockerfile` stays for local docker
dev). Multi-stage:

1. **build stage** — `npm ci` at the workspace root (installs the
   `packages/*` workspace), copy source, `npm run build` (runs
   `build:components` then `vite build`; adapter-node emits `build/`).
2. **runtime stage** — slim node image; copy `build/`, `package.json`,
   `package-lock.json`, and production `node_modules`; `CMD ["node", "build"]`.
   Set `ENV ADAPTER=node` and `NODE_ENV=production`.

adapter-node listens on `$PORT`, which Railway injects.

## Railway config & wiring

### Repo files (A)

- **`railway.json`** (repo root) — app service uses `Dockerfile.railway`; sets a
  restart policy (`ON_FAILURE`). Makes GitHub-connected deploy / `railway up`
  work without dashboard build config.
- **`.env.railway.example`** — env vars for the **app** service (must match the
  complete set in the Runtime env model section exactly):
  - `ADAPTER=node`
  - `sparql_endpoint=http://oxigraph.railway.internal:7878`
  - `instance=https://<your-app>.up.railway.app/` (or custom domain)
  - `server_name` — base host/name used by register/badge/index routes.
  - SMTP/email secrets: `smtp_host`, `smtp_port`, `smtp_secure`, `smtp_user`,
    `smtp_password`, `robot_email`, `admin_email`, `badge_image` — filled in by
    the operator. (No `fastmail_password` — unused in code.)
  - `sparql_user` / `sparql_password` — left unset (private network, no auth).
    Safe to omit because dynamic env returns `undefined` for unset keys.

### Oxigraph service (created once in dashboard; documented)

- Image: `ghcr.io/oxigraph/oxigraph:latest`
- Start command: `serve --location /data --bind [::]:7878`
  - The `[::]` IPv6 bind is **required** for Railway private networking. A
    `0.0.0.0`-only bind is the most common reason the app cannot reach the store.
  - If the image entrypoint already includes the `oxigraph` binary, the start
    command becomes just `serve --location /data --bind [::]:7878`; verify the
    image's entrypoint during implementation and document the exact value.
- Volume mounted at `/data`.
- No public domain.

### Docs (A + B)

`docs/railway-deploy.md`:

- Click-path to provision both services, attach the volume, wire env vars.
- Verification: app boots, `/get/...` returns data, data persists across an
  oxigraph redeploy.
- Section B: how to publish this as a one-click Railway Template (template
  composer steps, the two service definitions, the shared variable references).

## Non-goals / YAGNI

- No SPARQL Basic auth setup (network isolation is the boundary).
- No change to the existing local `Dockerfile` or `npm run dev`.
- No automated creation of the published Railway Template (manual, documented).
- No multi-region / replica / backup automation (note volume backup as a manual
  follow-up in docs).
- Not fixing the local `.env.example` (also missing `server_name`) — out of
  scope, but worth a one-line follow-up commit.

## Risks / things to verify in implementation

1. Oxigraph image entrypoint vs. start command (exact start string).
2. Railway private DNS name matches the service name (`oxigraph` →
   `oxigraph.railway.internal`); document that renaming the service changes the
   host.
3. `svelte.config.js` top-level `await` support in the project's SvelteKit
   version.
4. Production `node_modules` pruning in the runtime stage (workspace symlink for
   `octothorpes` must resolve — may need to copy the whole installed tree rather
   than a pruned prod install).
```
