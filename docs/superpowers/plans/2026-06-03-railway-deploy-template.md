# Railway Deploy Template Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make octothorp.es deployable to Railway as two services — the SvelteKit app and a private Oxigraph triplestore with a persistent volume — with repo config now (A) and a documented path to a one-click template (B).

**Architecture:** App builds from this repo via a production Dockerfile using `@sveltejs/adapter-node`, selected at build time by env detection so local dev / Vercel are unchanged. All app config moves from build-time `$env/static/private` to runtime `$env/dynamic/private` via a single `src/lib/config.js` shim, so Railway's per-service runtime variables actually reach the app. Oxigraph runs the official image over Railway's private network with a volume at `/data`.

**Tech Stack:** SvelteKit (Svelte 4), `@sveltejs/adapter-node`, Docker, Railway, Oxigraph.

**Spec:** `docs/superpowers/specs/2026-06-03-railway-deploy-template-design.md`

**Workflow note:** This user works trunk-based — each task commits directly to `main` and pushes. Each commit must be independently deployable. The env migration (Chunk 1) is the only change touching app code; the Railway artifacts (Chunk 2) are additive.

---

## Chunk 1: Runtime env model + adapter detection

### Task 1: Runtime env shim and import-source migration

The app reads all config via `$env/static/private` (baked at build time). Replace the import *source* with a runtime shim so Railway's runtime vars apply. Named imports are preserved — only the source string changes.

**Files:**
- Create: `src/lib/config.js`
- Modify (import source `'$env/static/private'` → `'$lib/config.js'`): `src/lib/assert.js`, `src/lib/getHarmonizer.js`, `src/lib/ld/rdfa2triples.js`, `src/lib/mail/send.js`, `src/lib/sparql.js` (2 lines), `src/lib/emails/alertAdmin.js`, `src/lib/converters.js`, `src/routes/+layout.server.js`, `src/routes/rss/+server.js`, `src/routes/index.js`, `src/routes/load.js` (2 lines), `src/routes/register/+page.server.js` (2 lines), `src/routes/bookmarks/load.js`, `src/routes/index/+server.js`, `src/routes/report/+page.server.js`, `src/routes/~/load.js`, `src/routes/~/[thorpe]/rss/+server.js`, `src/routes/~/[thorpe]/load.js`, `src/routes/debug/core/+server.js`, `src/routes/debug/api-check/+server.js`, `src/routes/debug/testHarmonizer.js`, `src/routes/debug/index-check/+server.js`, `src/routes/debug/rolodex/+server.js`, `src/routes/badge/+server.js`, `src/routes/backlinks/load.js`
- Modify (test mock target): `src/tests/indexing.test.js:14`, `src/tests/badge-route.test.js:14`

- [ ] **Step 1: Create the shim `src/lib/config.js`**

```js
// Runtime config. Re-exports every env var the app uses from $env/dynamic/private
// so values are read from process.env at RUNTIME (required for Docker/Railway,
// where the image is built once and run with per-service variables). Do NOT
// switch this back to $env/static/private — that bakes values in at build time.
import { env } from '$env/dynamic/private';

export const {
  sparql_endpoint,
  sparql_user,
  sparql_password,
  instance,
  server_name,
  admin_email,
  badge_image,
  smtp_host,
  smtp_port,
  smtp_secure,
  smtp_user,
  smtp_password,
  robot_email,
} = env;
```

- [ ] **Step 2: Confirm the baseline test suite passes (pre-change)**

Run: `npm test -- --run`
Expected: PASS (record the count; Step 6 must match or exceed it). If pre-existing failures unrelated to env exist, note them so they aren't blamed on this change.

- [ ] **Step 3: Migrate every import source in `src/lib` and `src/routes`**

This replaces only the trailing source string; the `import { ... }` names are untouched. `src/lib/config.js` is unaffected (it imports from `$env/dynamic/private`, not `static`).

Run:
```bash
grep -rl "\$env/static/private" src/lib src/routes \
  | xargs sed -i '' "s#'\$env/static/private'#'\$lib/config.js'#g; s#\"\$env/static/private\"#'\$lib/config.js'#g"
```

Verify zero remaining references in app code:
```bash
grep -rn "\$env/static/private" src/lib src/routes
```
Expected: no output.

- [ ] **Step 4: Update the two test mocks**

In `src/tests/indexing.test.js` change:
```js
vi.mock('$env/static/private', () => ({
  server_name: 'test-server',
}))
```
to:
```js
vi.mock('$lib/config.js', () => ({
  server_name: 'test-server',
}))
```

In `src/tests/badge-route.test.js` change:
```js
vi.mock('$env/static/private', () => ({
  instance: 'http://localhost:5173/',
  badge_image: 'badge.png',
  server_name: 'Test Server',
}))
```
to:
```js
vi.mock('$lib/config.js', () => ({
  instance: 'http://localhost:5173/',
  badge_image: 'badge.png',
  server_name: 'Test Server',
}))
```

- [ ] **Step 5: Confirm no stale static-private mocks remain**

Run: `grep -rn "env/static/private" src/`
Expected: no output.

- [ ] **Step 6: Run the full suite**

Run: `npm test -- --run`
Expected: PASS, count ≥ the Step 2 baseline.
If a test that transitively loads `src/lib/config.js` fails because `$env/dynamic/private` resolves to empty values, fix it by adding `vi.mock('$lib/config.js', () => ({ /* needed vars */ }))` to that test file (same pattern as Step 4). Do not weaken assertions.

- [ ] **Step 7: Commit and push**

```bash
git add src/lib/config.js src/lib src/routes src/tests
git commit -m "Read config at runtime via \$env/dynamic/private shim

Move all config off build-time \$env/static/private to a src/lib/config.js
shim backed by \$env/dynamic/private, so Railway runtime variables reach the
app. Import names unchanged; only the source module changed.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push
```

---

### Task 2: adapter-node with build-time detection

**Files:**
- Modify: `package.json` (devDependencies — via npm)
- Modify: `svelte.config.js`

- [ ] **Step 1: Install adapter-node**

Run: `npm install -D @sveltejs/adapter-node`
Expected: `@sveltejs/adapter-node` added to `devDependencies`; `package-lock.json` updated.

- [ ] **Step 2: Rewrite `svelte.config.js` for conditional adapter**

Replace the file with:
```js
import mdsvexConfig from "./mdsvex.config.js";
import { mdsvex } from "mdsvex";

// On Railway (or any container) build with adapter-node; everywhere else keep
// adapter-auto so local dev and other hosts are unchanged. Gate on an explicit
// ADAPTER=node (set by the Dockerfile/template) and Railway's auto-injected
// RAILWAY_ENVIRONMENT as a fallback.
const onRailway =
  process.env.ADAPTER === 'node' || !!process.env.RAILWAY_ENVIRONMENT;

const adapter = onRailway
  ? (await import('@sveltejs/adapter-node')).default
  : (await import('@sveltejs/adapter-auto')).default;

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter(),
    csrf: {
      checkOrigin: false
    }
  },
  extensions: [".svelte", ".md"],
  preprocess: [mdsvex(mdsvexConfig)]
};

export default config;
```

- [ ] **Step 3: Verify the default (adapter-auto) build still loads config**

Run: `npx svelte-kit sync`
Expected: completes without error (config parses; top-level `await` is supported in the ESM config). If it errors on top-level await, fall back to a static conditional: import both adapters at the top and pick one — verify and adjust.

- [ ] **Step 4: Verify the Railway (adapter-node) build produces a server**

Run: `ADAPTER=node npm run build`
Expected: build succeeds and creates `build/index.js` (adapter-node output).

- [ ] **Step 5: Smoke-test the built server reads runtime env**

Run:
```bash
ADAPTER=node sparql_endpoint=http://127.0.0.1:7878 instance=http://localhost:3000/ PORT=3000 node build &
sleep 2 && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/ ; kill %1
```
Expected: a HTTP status (200/3xx/4xx — not a connection refusal), proving the server boots on `$PORT` with runtime env. A non-2xx from a route that needs SPARQL is fine here; we only need the server to start.

- [ ] **Step 6: Commit and push**

```bash
git add package.json package-lock.json svelte.config.js
git commit -m "Select adapter-node on Railway via build-time detection

Keep adapter-auto as the default; switch to adapter-node when ADAPTER=node or
RAILWAY_ENVIRONMENT is set. Local dev and Vercel builds are unchanged.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push
```

---

## Chunk 2: Railway deploy artifacts

### Task 3: Production Dockerfile

**Files:**
- Create: `Dockerfile.railway` (the existing `Dockerfile` is left untouched for local dev)
- Create: `.dockerignore`

- [ ] **Step 1: Create `.dockerignore`**

There is no `.dockerignore` in the repo, and Docker ignores `.gitignore`. Without
this, `COPY . .` ships the local `node_modules`/`build`/`.svelte-kit` into the
build context — bloating it and risking a stale `node_modules` clobbering the
fresh `npm ci` layer (which would break the `octothorpes` workspace symlink).

```
node_modules
build
.svelte-kit
.git
.env
.env.*
.DS_Store
```

- [ ] **Step 2: Create `Dockerfile.railway`**

```dockerfile
# syntax=docker/dockerfile:1
# Production image for Railway. The repo's ./Dockerfile is the dev image and is
# intentionally NOT used here.
FROM node:20-alpine AS build
WORKDIR /app
ENV ADAPTER=node
# Install with the workspace (packages/*) present so the `octothorpes` workspace
# package resolves.
COPY package.json package-lock.json ./
COPY packages ./packages
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV ADAPTER=node
# adapter-node externalizes dependencies, so the runtime needs node_modules.
# Copy the full tree (incl. the octothorpes workspace symlink and its target)
# rather than a pruned prod install, so the symlink resolves.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./package.json
EXPOSE 3000
CMD ["node", "build"]
```

- [ ] **Step 3: Build the image locally**

Run: `docker build -f Dockerfile.railway -t octothorpes-app .`
Expected: build completes; final stage tagged `octothorpes-app`.

- [ ] **Step 4: Run the image and confirm it boots**

Run:
```bash
docker run --rm --name octo-smoke -e PORT=3000 -e instance=http://localhost:3000/ \
  -e sparql_endpoint=http://127.0.0.1:7878 -p 3000:3000 octothorpes-app &
sleep 3 && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/ ; docker stop octo-smoke
```
Expected: an HTTP status code (server started on `$PORT`). If `octothorpes` fails to resolve at runtime, the symlink wasn't copied — confirm Step 2's `COPY packages` and `node_modules` lines.

- [ ] **Step 5: Commit and push**

```bash
git add Dockerfile.railway .dockerignore
git commit -m "Add production Dockerfile for Railway

Multi-stage adapter-node build; runtime stage runs \`node build\` on \$PORT.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push
```

---

### Task 4: railway.json

**Files:**
- Create: `railway.json`

- [ ] **Step 1: Create `railway.json`**

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile.railway"
  },
  "deploy": {
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

- [ ] **Step 2: Validate JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('railway.json','utf8')); console.log('ok')"`
Expected: `ok`.

- [ ] **Step 3: Commit and push**

```bash
git add railway.json
git commit -m "Add railway.json pointing the app service at Dockerfile.railway

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push
```

---

### Task 5: .env.railway.example

**Files:**
- Create: `.env.railway.example`

- [ ] **Step 1: Create `.env.railway.example`**

```bash
# Environment variables for the Railway APP service.
# (The oxigraph service needs no app env — see docs/railway-deploy.md.)

# Selects adapter-node at build time.
ADAPTER=node

# Private Oxigraph service over Railway's internal network. The host is the
# oxigraph service name + .railway.internal — update it if you rename the service.
sparql_endpoint=http://oxigraph.railway.internal:7878

# Public base URL of THIS app (Railway-generated domain or your custom domain).
instance=https://CHANGEME.up.railway.app/
server_name=CHANGEME

# Email (fill in real values).
smtp_host=smtp.fastmail.com
smtp_port=587
smtp_secure=false
smtp_user=
smtp_password=
robot_email=
admin_email=
badge_image=badge.png

# Oxigraph has no auth and is private, so leave these UNSET on Railway.
# The SPARQL client only sends an Authorization header when both are present.
# sparql_user=
# sparql_password=
```

- [ ] **Step 2: Confirm `.gitignore` does not exclude it**

Run: `git check-ignore .env.railway.example && echo IGNORED || echo TRACKED`
Expected: `TRACKED`. (`.gitignore` ignores `.env.*` but whitelists `!.env.example`; this filename differs, so confirm. If it shows `IGNORED`, add `!.env.railway.example` to `.gitignore` in this commit.)

- [ ] **Step 3: Commit and push**

```bash
git add .env.railway.example .gitignore
git commit -m "Add Railway app-service env example

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push
```

---

### Task 6: Deployment docs (A) + template publishing path (B)

**Files:**
- Create: `docs/railway-deploy.md`

- [ ] **Step 1: Create `docs/railway-deploy.md`**

````markdown
# Deploying octothorp.es to Railway

Two services in one Railway project: **app** (this repo) and a **private
Oxigraph** triplestore with a persistent volume.

## A. Deploy your own

### 1. Create the project and app service
1. New Project → Deploy from GitHub repo → pick this repo.
2. Railway reads `railway.json` and builds with `Dockerfile.railway`.
3. Settings → Networking → Generate Domain (this is your public URL).

### 2. Add the Oxigraph service
1. New → Empty Service (name it `oxigraph` — the name becomes the private
   hostname `oxigraph.railway.internal`).
2. Settings → Source → Docker Image: `ghcr.io/oxigraph/oxigraph:latest`.
3. Settings → Deploy → Custom Start Command:
   `serve --location /data --bind [::]:7878`
   - The `[::]` (IPv6 wildcard) bind is **required** for Railway private
     networking. A `0.0.0.0`-only bind is the most common reason the app
     cannot reach the store.
   - If the image entrypoint already includes the `oxigraph` binary, this is the
     full command; if not, prefix it with `oxigraph`. Check the deploy logs.
4. Do **not** generate a public domain for this service — keep it private.

### 3. Add the volume
1. On the `oxigraph` service: New → Volume.
2. Mount path: `/data` (matches `--location /data`).

### 4. Set app env vars
Copy `.env.railway.example` into the **app** service variables and fill in:
- `instance` → your generated/custom domain.
- `server_name` → your host/name.
- SMTP/email values.
- Leave `sparql_user` / `sparql_password` unset.
`sparql_endpoint` and `ADAPTER` are already correct in the example.

### 5. Verify
- App URL loads.
- `GET <app>/get/everything/posted` returns JSON (empty results are fine).
- Index a page, then redeploy the `oxigraph` service — the data persists
  (proves the volume is mounted).
- If the app logs SPARQL connection errors: confirm the oxigraph start command
  uses `[::]` and that `sparql_endpoint` matches the oxigraph service name.

### Backups (manual follow-up)
Railway volumes are not auto-backed-up. Periodically dump the store
(`GET http://oxigraph.railway.internal:7878/store` via a one-off job, or use
Oxigraph's dump tooling) to external storage.

## B. Publish as a one-click template

To let others deploy this stack in one click, recreate it in Railway's template
composer (railway.com → Templates → New Template):

1. **Service 1 — app:** source = this GitHub repo. It builds via `railway.json`
   + `Dockerfile.railway`. Expose the variables from `.env.railway.example` as
   template inputs (mark secrets as such; pre-fill `ADAPTER=node` and
   `sparql_endpoint=http://oxigraph.railway.internal:7878`).
2. **Service 2 — oxigraph:** source = Docker image
   `ghcr.io/oxigraph/oxigraph:latest`; start command
   `serve --location /data --bind [::]:7878`; attach a volume at `/data`; no
   public domain.
3. Wire `instance` to reference the app service's generated domain variable.
4. Save and publish; the resulting deploy button provisions both services, the
   volume, and the private networking automatically.

Keep this doc and `.env.railway.example` in sync with the template inputs.
````

- [ ] **Step 2: Sanity-check the doc renders / has no broken fences**

Run: `node -e "const s=require('fs').readFileSync('docs/railway-deploy.md','utf8'); console.log(s.split('\n').length+' lines')"`
Expected: a line count printed (file exists and is non-trivial).

- [ ] **Step 3: Commit and push**

```bash
git add docs/railway-deploy.md
git commit -m "Document Railway deploy and one-click template path

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push
```

---

## Final verification

- [ ] `npm test -- --run` passes (≥ baseline).
- [ ] `ADAPTER=node npm run build` produces `build/index.js`.
- [ ] `docker build -f Dockerfile.railway .` succeeds and the container boots on `$PORT`.
- [ ] No `$env/static/private` references remain in `src/`.
- [ ] Local `npm run dev` still works (adapter-auto path unaffected).
