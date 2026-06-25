![release badge](https://img.shields.io/github/v/release/stucco-software/octothorp.es)

 
# Octothorpe Protocol Server #️⃣♥️#️⃣

A relay that connects independent websites with Octothorpe Protocol. Implements OP core features and includes a limited front-end UI.

- [Documentation](https://docs.octothorp.es)
- [Main OP Server](https://octothorp.es)
- [Demo site](https://demo.idestore.dev)

## Local Development

```
❯ cp .env.example .env
```

**Note:** A connection to on OP-compatible datastore is required. For full-local development, see [octothorpes-suite](https://github.com/stucco-software/octothorpes-suite). Otherwise, credentials for a hosted instance will be required in `.env`

Start the local dev server:

```
❯ npm run dev
````

Visit the Site UI:

[http://localhost:5173/](http://localhost:5173/)

## Relay links and endpoints
- Domains: `http://localhost:5173/domains`
- Hashtags: `http://localhost:5173/~/`
- Test indexing a page: `http://localhost:5173/debug/orchestra-pit?uri=FULL-TEST-URL-HERE`
- Example API endpoint: `http://localhost:5173/get/everything/posted/debug?s=demo.ideastore.dev` See the [API docs](https://docs.octothorp.es/op-api/) for more

## Smoke test

An end-to-end smoke test that wipes the demo records off a target relay, re-indexes the canonical demo pages ([devdemo](https://nimdaghlian.github.io/devdemo/)), runs a fixed query set, and diffs the responses against committed golden files in `src/tests/integration/golden/`. Use it before merging a feature branch to confirm indexing and querying still behave as approved.

**Prerequisites**
- A running dev server (`npm run dev`) and a reachable SPARQL store.
- `.env` pointed at an approved target. The destructive wipe refuses to run unless **both** are whitelisted:
  - `instance` is `http://localhost:5173` or `https://next.octothorp.es`
  - `sparql_endpoint` is `http://0.0.0.0:7878` or `https://octothorpes-next.fly.dev`

  This guard is what keeps the wipe from ever touching production. Staging credentials live in `.env`.

**Run the cycle** (dump → wipe → re-index → capture). The dump writes a full pre-wipe backup to `tmp/`; the re-index paces itself under the relay's rate limit, so a run takes a couple of minutes:

```
❯ npm run smoketest
```

**Check captured results against the approved golden:**

```
❯ npx vitest run src/tests/integration/smoketest.test.js
```

A failing diff names the query whose response changed. If the change is expected (you intended to change behavior, or updated the demo source), re-bless the golden and review the diff before committing:

```
❯ npm run smoketest:update
❯ git diff src/tests/integration/golden
```

**Notes**
- Golden files are target-independent: the active instance origin is normalized to `{INSTANCE}` and volatile index-time dates are dropped, so determinism rests on each page's source-declared `octo:postDate`. The same golden checks against both local and staging.
- The canonical URL set lives in `src/routes/debug/index-check/test-urls.yaml`. Changing the demo domain there is a one-file edit; re-bless the golden afterward.

COMMIT BUMP