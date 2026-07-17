---
name: octothorpes:new-client
description: Use when setting up a new OP Client — a full OP install in its own standalone repo with its own profile. Triggers include "new OP client", "scaffold an OP client", "set up an OP install", "create a client repo".
---

# Scaffolding a New OP Client

## Version assumptions

Written against `octothorpes@0.3.5` (npm). Before scaffolding, run `npm view octothorpes version`; if it is newer than 0.3.5, check the change-watch list at the bottom of this doc and the package release notes for anything that invalidates the skeletons below.

## Terminology

- **OP Client** — a full OP install: its own committed `profile.json`, its own connection to a triplestore, business logic via the `octothorpes` npm package, and an interface. This is what this skill builds.
- **OP datastore / OP triplestore / OP database** — the RDF triplestore *service* (e.g. Oxigraph). These are separate things. The datastore is assumed provisioned and credentialed before this skill runs. This skill NEVER sets one up, and never asks for or handles credential *values* — a human fills in `.env`.

Relay/Core/Publisher/Harmonizer vocabulary is inherited from the parent `octothorpes` skill — read its Architecture Terminology section first if this session hasn't loaded it.

## Operating mode

- The new client lives in a **standalone repo outside octothorp.es**. Confirm or ask for the target directory; `git init` if new. Use absolute paths.
- Core is consumed **from npm** (`npm install octothorpes`). Never workspace-link or file-link into a local octothorp.es checkout.
- Treat the octothorp.es repo (if present on the machine) as read-only reference. Nothing in this skill modifies it.

## Interview

Ask one at a time; skip anything the user already supplied.

1. **Target directory / repo name.**
2. **Instance identity** — name, one-line description, and the URL the instance will run at (feeds `profile.json` and `createClient({ instance })`; trailing slash).
3. **Interface framework** — open question with three named defaults: (a) minimal Node server + plain pages, (b) SvelteKit (mini-octothorp.es; the octothorp.es repo's `src/lib/*.js` adapters are the worked example), (c) CLI-first. The user may name any other framework — adapt the scaffold to it rather than refusing.
4. **Endpoint tier** — `/profile` + `/profile.json` are always served (state this, don't ask). Then ask separately: expose a public `/index`? expose a public `/get`? Warn that a public `/index` carries origin-verification and rate-limiting responsibilities (see `octothorpes:indexing`).
5. **Vocabulary starters** — any relationship subtypes or documentRecord predicates to declare now? Default: minimal valid `vocabulary` block (empty arrays); point to the canonical vocabulary spec for later extension.
6. **Publishers** — `rss2` (alias `rss`), `standardSiteDocument`, and `bluesky` are built into core's registry. Ask whether custom publishers are needed now; default no, pointing to `octothorpes:publishers`.

Do NOT ask about external accounts (bluesky handles etc.) or credential values — those are post-scaffold human edits.

## Scaffold output

### package.json

`"type": "module"`, `octothorpes` pinned `^0.3.5` (or current), plus framework dependencies.

### profile.json (repo root)

Authored from interview answers. Contract: `relay` MUST be committed as `null` (resolved from `instance` at load); `name`, `description`, `vocabulary` are required; NO secret-shaped keys (the loader's guard throws). Minimal valid skeleton:

```json
{
  "name": "<instance name>",
  "description": "<one-liner>",
  "relay": null,
  "vocabulary": {
    "relationshipSubtypes": [],
    "documentRecord": []
  }
}
```

Validate the authored file against the schema shipped in the package (see the fs-read note below) using `ajv` — actually run the validation; don't eyeball it.

### .env.example + .env

Secrets ONLY (the Wave-2 rule: everything non-secret belongs in `profile.json`). Write `.env.example` with placeholder names and a gitignored empty `.env` stub; tell the user to fill in real values themselves.

```sh
sparql_endpoint=
sparql_user=
sparql_password=
# per external-account provider, if any are added later (credentialEnvKey convention):
# <PROVIDER>_APP_PASSWORD=
```

### src/client.js — the one wiring point

All env/profile injection happens here and nowhere else. Framework-idiomatic equivalent is fine (e.g. read env via the framework's mechanism), but keep it to one file.

```js
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createClient, createProfile } from 'octothorpes'

// profile.schema.json ships in the package but is NOT in its exports map —
// import will throw. Read it as a file relative to the package entry point.
const pkgEntry = fileURLToPath(import.meta.resolve('octothorpes'))
const schema = JSON.parse(readFileSync(new URL('./profile.schema.json', import.meta.resolve('octothorpes')), 'utf8'))
const profileJson = JSON.parse(readFileSync(new URL('../profile.json', import.meta.url), 'utf8'))

const instance = process.env.instance // or framework env mechanism; trailing slash

export const profile = createProfile({ profile: profileJson, schema, instance, env: process.env })

export const client = createClient({
  instance,
  // accepts { endpoint, user, password } or a flat env object
  // ({ sparql_endpoint, sparql_user, sparql_password })
  sparql: process.env,
})
```

`createClient` returns `{ indexSource, get, getfast, harmonize, publish, prepare, harmonizer, handler, publisher, sparql, api }`. `createProfile` returns `{ getProfile, getAccountCredentials }` — credentials resolve at point-of-use from env via the `credentialEnvKey(provider)` convention, never from the profile.

### Routes / commands (per framework + tier)

- **Always:** `/profile` (HTML rendering of identity fields) and `/profile.json` (the loaded profile via `getProfile()`, which resolves `relay`).
- **Opt-in:** `/index` → thin wrapper over `client.indexSource`; `/get/...` → thin wrapper over `client.get`. Each wrapper carries an explicit "no logic here — logic lives in octothorpes core" comment. Keep them thin: inline validation in route handlers is the known tech-debt pattern to avoid.
- CLI-first scaffolds map the same tiers to subcommands (`<name> profile`, `<name> index <url>`, `<name> get <what> <by>`).

### Interface

One landing page (or root command) that renders profile identity plus a recent-activity list via `client.getfast`. Deliberately minimal and unstyled — mark it as the user's canvas, not a design deliverable.

### scripts/smoke.js

Modeled on octothorp.es' `scripts/core-test.js`. Checks, in order:

1. Triplestore reachable (SPARQL endpoint responds).
2. `client.getfast.terms()` returns without throwing.
3. `profile.json` validates against the shipped schema.
4. `/profile.json` serves (if an HTTP interface was scaffolded) and `relay` is resolved to the instance URL.

## Definition of done

Run `scripts/smoke.js` and report its actual output. A scaffold whose smoke check hasn't run is not done. Note: the profile Rev-1 + documentRecord machinery (epic #240) is merged but lightly field-tested — a first real scaffold run doubles as verification of it; report anomalies upstream as octothorp.es issues.

## Not covered (pointers)

- Triplestore provisioning and credential values — human-owned.
- Custom publishers → `octothorpes:publishers`. Custom harmonizers → `octothorpes:harmonizers`. Handler modes → `octothorpes:handlers`. Query surface → `octothorpes:api-reference`.
- UI design/styling.

## Change-watch (what would invalidate this skill)

Tracked in `docs/plans/point7/v07-tracker.md`. Summary:

1. ~~Publish `octothorpes@0.3.5`~~ — done 2026-07-17.
2. **#235** `packages/core/index.js` → `client.js` rename — if the package entry or import paths change, update the skeletons here.
3. **#217 Rev 2** — behavior-gating profile fields (`indexingMode`, `registrationPolicy`, harmonizer/publisher defaults) go live; the profile skeleton stops being inert. Field set is stable (closed schema); semantics aren't.
4. **#195** vocabulary registry (`packages/core/vocabulary.js`) — may change how the `vocabulary` block is validated/consumed.
5. **Wave 4.5 RDF-star migration** — scaffold survives, but `/get` output shapes and smoke-test expectations may shift.
6. **#204** typed `IndexError` — would improve the `/index` wrapper's error mapping (enhancement).
7. **#249** harmonizer envelope `@`-key drop — touches blobject key shapes the interface page renders.
8. `profile.schema.json` is not in the package `exports` map (fs-read workaround above) — if a future release adds `"./profile.schema.json"` to exports, simplify `client.js` to a direct import.
