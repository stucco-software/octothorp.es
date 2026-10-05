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
- `registration_mode` → `approval` (default) alerts `admin_email` to vet each
  new domain; `open` auto-verifies origins on register and first index, with no
  admin email. Pick `open` only if you want unsupervised sign-ups.
- `admin_secret` → secret for the admin form at `/admin` and the
  `POST /admin/approve`, `/admin/ban`, and `/admin/unban` endpoints. The
  registration email links straight to `/admin` — enter the domain and the
  secret to approve or ban. No verificator app, WebID, or direct SPARQL
  access is needed (the oxigraph service is private-network-only anyway).
  Leave unset to disable all admin functions (503).
- Leave `sparql_user` / `sparql_password` unset.
`sparql_endpoint` and `ADAPTER` are already correct in the example.

With `registration_mode=approval`, "rejecting" a request is a no-op (pending
requests are not persisted — the email is the record); use the Ban action for
abuse. With `registration_mode=open` you likely won't need approvals at all —
they're automatic.

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
3. Wire `instance` to the app service's generated domain: set its value to
   `https://${{RAILWAY_PUBLIC_DOMAIN}}/`. Railway resolves the `${{...}}`
   reference at deploy time, so every deployment gets its own domain with no
   manual editing. The full URL matters — the app parses `instance` with
   `new URL()` (badge asset loading, origin checks), so a bare domain breaks
   it. If a custom domain is attached later, update `instance` to it.
4. Save and publish; the resulting deploy button provisions both services, the
   volume, and the private networking automatically.

Keep this doc and `.env.railway.example` in sync with the template inputs.
