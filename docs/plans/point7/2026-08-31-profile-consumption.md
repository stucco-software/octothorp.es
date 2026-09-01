# Profile Consumption (#217 Rev 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Goal

Make the OP Client Profile actually drive the client: a new nested authored schema loaded with deep defaults, an init-time **resolve** step that discovers publishers, handlers and harmonizers by directory walk and projects a merged public profile, and consumers (query layer, indexer, `createClient`, `/register`, `/badge`) reading the profile instead of hardcoded maps and `.env` twins.

## Architecture

The authored `octothorpes.json` is **declarative only** — identity, policies, and *pointers* (e.g. `api.publishers.dir`, `api.handlers.dir`, `api.harmonizers.dir`). `createProfile` validates it against a closed JSON Schema and fills documented defaults, so `getProfile()` always returns a fully-populated object. A second, init-time **resolve** step walks the declared directories, unions discovered names with core builtins, tags effective namespaces `builtin|declared`, expands feed term-names and relative image paths to URIs, and exposes the merged projection as `op.resolvedProfile()` — which `/profile` and `/profile.json` serve, so the public profile is a projection of the live client and cannot drift from what actually runs.

### The two policy axes (read this before touching Wave 4a)

`policies.indexing.mode` and `policies.access.registration` answer different questions and must stay distinct everywhere in this plan:

| | question | values |
|---|---|---|
| `policies.indexing.mode` | **What triggers** indexing? | `request` (someone asks via `/index`) · `active` (the relay crawls on its own schedule) |
| `policies.access.registration` | **What gate** must an index request pass? | `registered` (origin verified in the datastore) · `open` (no gate; `blocks.domains` applies) · `closed` (nothing indexed unless in `whitelist.domains`) |

They are orthogonal. **All six combinations are valid** — an `active` crawler can still be `registered`-gated (crawl only origins that signed up), and a `request`-driven relay can be `open` (index anything anyone submits). Nothing in the implementation may collapse one into the other.

`policies.indexing.mode` maps onto core's `createClient({ indexingMode })` as the **identity function** — same two spellings, no translation table. `policies.access.registration` is injected separately as `createClient({ access: { registration, blocks, whitelist } })` and is enforced at the indexer's origin-verification step. That same `access` block also carries `blocks.terms`, which is enforced at a *different* point (statement-write time) and in *every* registration mode — see the next section.

### The two blocklists (read this before touching Task 14)

`policies.access.blocks` is an **object with two sub-keys**, and they have two different enforcement points that must stay distinct everywhere in this plan:

| | what it lists | where it is enforced | mode dependence |
|---|---|---|---|
| `blocks.domains` | origins | the **access gate** in the indexing path (`checkAccessGate`, Task 14), plus the approved `/register` UX short-circuit (Task 15) | meaningful **only** under `registration: 'open'` |
| `blocks.terms` | term names | **write time during indexing** — a harmonized blobject carrying an octothorpe that names a blocked term has that *statement* dropped; the rest of the page indexes normally and the page is **not** rejected wholesale | **none — applies in ALL modes** (`registered`, `open`, `closed` alike) |

A relay wants to refuse a slur term regardless of how its origin gate is configured, which is why `blocks.terms` is deliberately orthogonal to `registration`.

**Both sub-keys accept either an inline array of strings or a string that is a path to a JSON file containing an array of strings.** Blocklists get long and are often maintained as separate files, sometimes shared between deployments. `createProfile` expands a path value by reading and parsing that file through an **injected read dependency** — core stays framework-agnostic and the SvelteKit adapter supplies it, the same pattern as the fs injection used for directory discovery in Wave 3. A missing or unparseable blocklist file is a **load-time error**, not a silent empty list. The **resolved profile always surfaces the expanded arrays, never the path** — consistent with the declarative-authored / resolved-representative model.

`policies.access.whitelist` takes the same object shape for symmetry, but carries `domains` **only**. A terms allowlist is a different product decision with no current use case; it is deliberately absent rather than reserved.

Two things this explicitly does not do, both recorded as non-goals below: pre-existing statements about a newly-blocked term are **not** retroactively removed, and there is **no read-time filtering** of blocked terms.

### The three extension directories

`api.publishers`, `api.handlers` and `api.harmonizers` are **siblings**, each with a `dir` pointer and a reserved `named` array. Handlers are not nested under harmonizers, for two reasons:

1. **The dependency points harmonizer → handler.** A harmonizer definition names its handler through its `mode` field (see `packages/core/harmonizers.js` — the `default` harmonizer is `"mode": "html"`). Nesting handlers under harmonizers would invert that.
2. **They are different artifact kinds.** Handlers are **JS modules exporting a function** (`{ mode, contentTypes, meta, harmonize }`); harmonizers are **declarative JSON** (`{ id, type, title, mode, schema: { subject: { …selectors } } }`). Same `dir` pattern, two different loaders: import modules vs read-and-validate JSON. A local harmonizer JSON file is the same shape as a harmonizer fetched over HTTP, which is why the loader can be shared with the remote path later.

`defaultHandler` therefore lives at `api.handlers.default`, finishing the "`html` is a handler **mode**, not a harmonizer id" category-error fix.

## Tech Stack

- ESM JavaScript, Node 20+
- `packages/core/` — framework-agnostic library (`octothorpes`); all deps injected
- SvelteKit 2 adapter layer in `src/lib/` and `src/routes/`
- `ajv` ^6 for JSON Schema (draft-07) validation
- `vitest` for tests

## Spec

- GitHub issue **#217**, specifically the comments: *Rev 2, restated (2026-08-27 gap audit)*, *Design direction settled (2026-08-29)*, *Addendum: federation block*, *Addendum: vocabulary block decisions (2026-08-31)*.
- `docs/plans/point7/profile-drafts/profile.schema.draft.json` — the authored contract, with design rationale in `description` fields.
- `docs/plans/point7/profile-drafts/profile.resolved.draft.json` — the resolved projection contract.
- `octothorpes.json` (repo root) — already on disk in the NEW shape.

## Explicitly OUT of scope

State these as non-goals; do not implement them, do not add TODOs beyond the documented code comments this plan asks for.

- **Namespace ontology import.** `vocabulary.namespaces[].import: true` must validate and be a documented **no-op**. Actual triple loading into a named graph rides on epic **#270**.
- **`policies.labels`.** Reserved array, schema-only. Rides on **#192** via **#270**.
- **Vocabulary document generation and `api.linkTypes` → published RDF.** Owned by **#270** (alongside `context.json` regeneration).
- **Federation.** `federation` is a reserved, unvalidated-beyond-`type: object` block. Candidate v0.8 feature.
- **Remote named publishers / handlers / harmonizers.** `api.publishers.named`, `api.handlers.named` and `api.harmonizers.named` are schema slots only; the resolve step must accept and pass them through but must not fetch them.
- **Batch / multi-record indexing.** The Wave 5 CSV handler deliberately treats one CSV document as **one subject**, exactly like the HTML handler. Creating a page-per-row is epic **#274**'s territory and is explicitly not attempted here.
- **A CSV library.** The Wave 5 parser stays minimal and dependency-free. Quoted-comma handling is in scope; full RFC 4180 conformance is not.
- **Retroactive removal of blocked terms.** Adding a term to `policies.access.blocks.terms` stops *new* statements from being written; statements already in the graph about that term stay there. Removing them is deletion work and belongs to epic **#271**. Do not attempt a migration or a sweep here.
- **Read-time filtering of blocked terms.** Refusing to *serve* a blocked term's page (or filtering it out of query results) is deliberately not included. `blocks.terms` is **write-time only**.
- **`invite` as a registration value.** Dropped from the enum, not renamed or aliased. `closed` + `whitelist.domains` *is* invite-only, and octothorp.es's own flow (form → admin email → admin approves) is `registered` with a human in the loop. No migration shim.
- **Posting-publisher credentials.** No publisher posts to an external account yet; `getAccountCredentials` is being deleted, not rewired (see Task 3).
- **`/terms` → `/rules` route rename.** `identity.terms` becomes a term-URI prefix in this plan; relocating the human terms-of-service link is a separate UI item.

## Global Constraints

- **Run tests with `npx vitest run <specific files>`, never bare.** A bare run takes ~150s and reads as hung. Each task names its files.
- **Core stays framework-agnostic.** No `$env`, no `$lib`, no `import.meta.glob`, no bare `fs`/`path` imports inside `packages/core/`. Filesystem access is an injected dependency; the SvelteKit adapter supplies it.
- **No secrets in the profile.** The `assertNoSecrets` guard stays and keeps firing independently of schema validation.
- **Tests own their fixtures.** No profile test may read the committed `octothorpes.json` as its fixture, with exactly one exception: the contract test that asserts the committed file validates and carries no secrets (Task 1).
- **Smoketest golden churn** is expected at **Wave 3** (the `/profile.json` shape changes) and again at **Wave 5** (discovered handlers/harmonizers appear in the projection, and the demo fixtures are added). Re-capture deliberately with `npm run smoketest` and review the diff. Waves 1, 2, and 4 expect **zero** golden churn.
- **One commit per task**, with trailer:
  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  ```
- Branch: `development`. Do not merge or push without the user asking.

---

# Wave 1 — Loader + shape

`octothorpes.json` on disk is already the new shape, so the old loader and its tests are **broken in the working tree right now**. Wave 1 restores green.

## Task 1: Promote the draft schema to `packages/core/profile.schema.json`

**Files**
- Modify: `packages/core/profile.schema.json` (full replacement)
- Test: `src/tests/profile-schema.test.js` (rewrite)

**Interfaces**
- Consumes: `docs/plans/point7/profile-drafts/profile.schema.draft.json`
- Produces: a draft-07 JSON Schema at `packages/core/profile.schema.json`, `additionalProperties: false` at every authored level.

**Steps**

- [ ] Rewrite `src/tests/profile-schema.test.js`. The committed-file contract check stays (it is the one sanctioned read of the real file); everything else moves to inline fixtures:

```js
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import Ajv from 'ajv'

// #217 Rev 2: the authored profile is a CLOSED contract. This suite pins the
// shape with its own fixtures; the only read of the committed octothorpes.json
// is the contract check that it still validates and carries no secrets.

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')

const schema = JSON.parse(
  readFileSync(resolve(repoRoot, 'packages/core/profile.schema.json'), 'utf8')
)

const ajv = new Ajv({ allErrors: true })
const validate = ajv.compile(schema)

const strip$schema = (o) => { const { $schema, ...rest } = o; return rest }

describe('authored profile schema (#217 Rev 2)', () => {
  it('accepts a minimal profile (every block optional)', () => {
    expect(validate({})).toBe(true)
  })

  it('accepts the full nested shape', () => {
    const ok = validate({
      identity: {
        instance: 'https://example.test/',
        name: 'Example',
        description: 'An example relay.',
        terms: 'https://example.test/~/',
        feeds: { thorpes: ['cats'], multipass: 'https://example.test/feed.json' },
        images: { favicon: '/favicon.ico', avatar: '/avatar.png' },
        contact: { email: 'admin@example.test' },
      },
      policies: {
        commercial: false,
        indexing: { mode: 'request', frequency: 'hourly' },
        access: {
          registration: 'open',
          badge: '/badge.png',
          blocks: { domains: ['bad.test'], terms: ['someslur'] },
          whitelist: { domains: [] },
        },
      },
      api: {
        linkTypes: [{ type: 'Item', label: 'Item', path: 'items' }],
        documentRecord: [{ predicate: 'encodingFormat', namespace: 'schema', range: 'literal' }],
        publishers: { dir: './src/lib/publishers', named: [] },
        handlers: { dir: './src/lib/handlers', default: 'html', named: [] },
        harmonizers: { dir: './src/lib/harmonizers', named: [] },
      },
      vocabulary: {
        octo: 'https://vocab.octothorp.es#',
        namespaces: [{ prefix: 'skos', iri: 'http://www.w3.org/2004/02/skos/core#', import: true }],
      },
      federation: {},
    })
    if (!ok) console.error(validate.errors)
    expect(ok).toBe(true)
  })

  it('rejects unknown top-level keys', () => {
    expect(validate({ nonsense: true })).toBe(false)
  })

  it('rejects the OLD flat shape (relay/name/vocabulary.relationshipSubtypes)', () => {
    expect(validate({ name: 'Octothorpes', relay: null })).toBe(false)
    expect(validate({ vocabulary: { relationshipSubtypes: [] } })).toBe(false)
  })

  it('accepts every registration gate value', () => {
    for (const registration of ['registered', 'open', 'closed']) {
      expect(validate({ policies: { access: { registration } } })).toBe(true)
    }
  })

  it("rejects the dropped 'invite' registration value", () => {
    // 'closed' + whitelist IS invite-only; there is no alias or shim.
    expect(validate({ policies: { access: { registration: 'invite' } } })).toBe(false)
  })

  it('rejects an unknown policies.access.registration value', () => {
    expect(validate({ policies: { access: { registration: 'maybe' } } })).toBe(false)
  })

  it('accepts both indexing modes and rejects the retired on-request spelling', () => {
    expect(validate({ policies: { indexing: { mode: 'request' } } })).toBe(true)
    expect(validate({ policies: { indexing: { mode: 'active' } } })).toBe(true)
    expect(validate({ policies: { indexing: { mode: 'on-request' } } })).toBe(false)
  })

  it('keeps the two policy axes distinct — a gate value is not an indexing mode', () => {
    // policies.indexing.mode answers "what triggers indexing";
    // policies.access.registration answers "what gate must it pass".
    expect(validate({ policies: { indexing: { mode: 'registered' } } })).toBe(false)
    expect(validate({ policies: { access: { registration: 'request' } } })).toBe(false)
  })

  it('admits all six axis combinations', () => {
    for (const mode of ['request', 'active']) {
      for (const registration of ['registered', 'open', 'closed']) {
        expect(validate({ policies: { indexing: { mode }, access: { registration } } })).toBe(true)
      }
    }
  })

  it('accepts blocks/whitelist sub-keys as either an array of strings or a path string', () => {
    // Blocklists get long and are often maintained as a separate, sometimes
    // shared, file — so both value forms are first-class in the contract.
    expect(validate({ policies: { access: { blocks: { domains: ['bad.test'] } } } })).toBe(true)
    expect(validate({ policies: { access: { blocks: { domains: './blocklists/domains.json' } } } })).toBe(true)
    expect(validate({ policies: { access: { blocks: { terms: ['someslur'] } } } })).toBe(true)
    expect(validate({ policies: { access: { blocks: { terms: './blocklists/terms.json' } } } })).toBe(true)
    expect(validate({ policies: { access: { whitelist: { domains: ['https://friend.test'] } } } })).toBe(true)
    expect(validate({ policies: { access: { whitelist: { domains: './allow.json' } } } })).toBe(true)
  })

  it('rejects the OLD flat array form of blocks and whitelist', () => {
    expect(validate({ policies: { access: { blocks: ['bad.test'] } } })).toBe(false)
    expect(validate({ policies: { access: { whitelist: ['https://friend.test'] } } })).toBe(false)
  })

  it('rejects unknown sub-keys, and a terms allowlist in particular', () => {
    // A terms ALLOWLIST is a different product decision with no current use
    // case — deliberately absent from whitelist rather than reserved.
    expect(validate({ policies: { access: { whitelist: { terms: ['ok'] } } } })).toBe(false)
    expect(validate({ policies: { access: { blocks: { hosts: [] } } } })).toBe(false)
  })

  it('rejects a non-string item inside either list form', () => {
    expect(validate({ policies: { access: { blocks: { domains: [1] } } } })).toBe(false)
    expect(validate({ policies: { access: { blocks: { terms: [{}] } } } })).toBe(false)
  })

  it('puts the default handler under api.handlers, not api.harmonizers', () => {
    expect(validate({ api: { handlers: { default: 'html' } } })).toBe(true)
    expect(validate({ api: { harmonizers: { defaultHandler: 'html' } } })).toBe(false)
  })

  it('rejects an unknown documentRecord range', () => {
    expect(validate({
      api: { documentRecord: [{ predicate: 'x', namespace: 'schema', range: 'blob' }] },
    })).toBe(false)
  })

  it('requires prefix and iri on a declared namespace', () => {
    expect(validate({ vocabulary: { namespaces: [{ prefix: 'skos' }] } })).toBe(false)
  })

  it('accepts feeds slots as either a url string or an array of term names', () => {
    expect(validate({ identity: { feeds: { thorpes: 'https://example.test/feed' } } })).toBe(true)
    expect(validate({ identity: { feeds: { thorpes: ['a', 'b'] } } })).toBe(true)
  })
})

describe('committed octothorpes.json contract', () => {
  const committed = JSON.parse(readFileSync(resolve(repoRoot, 'octothorpes.json'), 'utf8'))

  it('validates against the promoted schema', () => {
    const ok = validate(strip$schema(committed))
    if (!ok) console.error(validate.errors)
    expect(ok).toBe(true)
  })

  it('carries no secret-shaped keys', () => {
    const keys = []
    const walk = (n) => {
      if (Array.isArray(n)) return n.forEach(walk)
      if (n && typeof n === 'object') for (const [k, v] of Object.entries(n)) { keys.push(k); walk(v) }
    }
    walk(committed)
    expect(keys.some((k) => /key|secret|token|password|credential/i.test(k))).toBe(false)
  })
})
```

- [ ] Run `npx vitest run src/tests/profile-schema.test.js` — expect fail (old schema still in place).
- [ ] Copy `docs/plans/point7/profile-drafts/profile.schema.draft.json` over `packages/core/profile.schema.json` verbatim, changing only `"title"` to `"OP Client Profile (authored)"` (already correct in the draft) and keeping `"$id": "https://octothorp.es/profile.schema.json"`. Leave the draft file in place as the design record.
- [ ] Run `npx vitest run src/tests/profile-schema.test.js` — expect pass.
- [ ] Commit: `#217 wave 1: promote nested authored profile schema to core`

## Task 2: Rewrite `createProfile` — nested defaults + instance precedence

**Files**
- Modify: `packages/core/profile.js`
- Test: `src/tests/profileLoader.test.js` (rewrite)

**Interfaces**
- Consumes: `{ profile: Object, schema: Object, env?: Object }`
- Produces:
  ```js
  export const PROFILE_DEFAULTS: Object          // the deep default tree
  export const OCTO_VOCABULARY_IRI: string       // 'https://vocab.octothorp.es#'
  export const createProfile = ({ profile, schema, env, warn, readFile }) => ({ getProfile: () => Object })
  ```
- `readFile` is the **injected read dependency** used to expand path-form blocklists (`policies.access.blocks.domains`, `blocks.terms`, `whitelist.domains`). Signature `(path: string) => string` — it returns raw file contents and core does the `JSON.parse`, so parse errors stay in core and the adapter stays a one-liner (`readFileSync`). It is **synchronous**, because `createProfile`/`getProfile()` are synchronous and every consumer in this plan calls `getProfile()` at module scope. A missing or unparseable file **throws** at load time; there is no silent empty list.
  `getProfile()` returns a fully-populated, frozen-by-convention (not mutated) object matching the defaults tree merged under the authored values. Called repeatedly it returns the same object identity.
- Precedence for `identity.instance`: `env.instance` (deploy-level override) **wins** when non-empty; otherwise the authored value. `.env` remains secrets-plus-deploy-override.
- `relay` is **gone**. Consumers read `identity.instance`.

**Steps**

- [ ] Rewrite `src/tests/profileLoader.test.js` with its own fixtures:

```js
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createProfile, PROFILE_DEFAULTS, OCTO_VOCABULARY_IRI } from 'octothorpes'

// #217 Rev 2 loader. Framework-agnostic: schema, profile object and env are all
// injected. This suite NEVER reads the committed octothorpes.json — it owns its
// fixtures so the committed file can be re-authored without breaking the loader.

const here = dirname(fileURLToPath(import.meta.url))
const schema = JSON.parse(
  readFileSync(resolve(here, '../../packages/core/profile.schema.json'), 'utf8')
)

const fixture = () => ({
  identity: {
    instance: 'https://authored.test/',
    name: 'Fixture Relay',
    terms: 'https://authored.test/~/',
    feeds: { thorpes: ['cats'] },
  },
  policies: { access: { registration: 'closed', whitelist: { domains: ['https://friend.test'] } } },
  api: { publishers: { dir: './src/lib/publishers' } },
  vocabulary: {
    namespaces: [{ prefix: 'skos', iri: 'http://www.w3.org/2004/02/skos/core#', import: true }],
  },
})

const load = (profile, env, readFile) => createProfile({ profile, schema, env, readFile }).getProfile()

describe('createProfile — defaults filling', () => {
  it('an empty authored profile still yields a fully populated object', () => {
    const p = load({})
    expect(p.identity.feeds).toEqual({})
    expect(p.identity.images).toEqual({})
    expect(p.identity.contact).toEqual({})
    expect(p.policies.commercial).toBe(false)
    expect(p.policies.labels).toEqual([])
    expect(p.policies.indexing.mode).toBe('request')
    expect(p.policies.access.registration).toBe('registered')
    expect(p.policies.access.blocks).toEqual({ domains: [], terms: [] })
    expect(p.policies.access.whitelist).toEqual({ domains: [] })
    expect(p.api.linkTypes).toEqual([])
    expect(p.api.documentRecord).toEqual([])
    expect(p.api.publishers.named).toEqual([])
    expect(p.api.handlers.default).toBe('html')
    expect(p.api.handlers.named).toEqual([])
    expect(p.api.harmonizers.named).toEqual([])
    expect(p.vocabulary.namespaces).toEqual([])
  })

  it('defaults the two policy axes independently', () => {
    // Defaulting one axis must never imply anything about the other.
    const p = load({ policies: { indexing: { mode: 'active' } } })
    expect(p.policies.indexing.mode).toBe('active')
    expect(p.policies.access.registration).toBe('registered')

    const q = load({ policies: { access: { registration: 'open' } } })
    expect(q.policies.indexing.mode).toBe('request')
    expect(q.policies.access.registration).toBe('open')
  })

  it('no longer carries a defaultHandler under api.harmonizers', () => {
    expect(load({}).api.harmonizers.defaultHandler).toBeUndefined()
  })

  it('vocabulary.octo defaults to the canonical vocabulary IRI', () => {
    expect(load({}).vocabulary.octo).toBe('https://vocab.octothorp.es#')
    expect(OCTO_VOCABULARY_IRI).toBe('https://vocab.octothorp.es#')
  })

  it('an authored vocabulary.octo overrides the default (forking vocabulary identity)', () => {
    const p = load({ vocabulary: { octo: 'https://fork.test/vocab#' } })
    expect(p.vocabulary.octo).toBe('https://fork.test/vocab#')
  })

  it('authored values survive defaults merging', () => {
    const p = load(fixture())
    expect(p.identity.name).toBe('Fixture Relay')
    expect(p.policies.access.registration).toBe('closed')
    expect(p.policies.access.whitelist).toEqual({ domains: ['https://friend.test'] })
    expect(p.identity.feeds.thorpes).toEqual(['cats'])
    expect(p.vocabulary.namespaces).toHaveLength(1)
    expect(p.vocabulary.namespaces[0].import).toBe(true)
  })

  it('fills the per-item `import` default on declared namespaces', () => {
    const p = load({ vocabulary: { namespaces: [{ prefix: 'ex', iri: 'https://ex.test/' }] } })
    expect(p.vocabulary.namespaces[0].import).toBe(false)
  })

  it('does not mutate the injected profile object', () => {
    const authored = fixture()
    const snapshot = JSON.parse(JSON.stringify(authored))
    load(authored)
    expect(authored).toEqual(snapshot)
  })

  it('PROFILE_DEFAULTS is not shared by reference with the result', () => {
    const p = load({})
    p.policies.access.blocks.domains.push('mutated.test')
    expect(PROFILE_DEFAULTS.policies.access.blocks.domains).toEqual([])
    expect(load({}).policies.access.blocks.domains).toEqual([])
  })

  it('getProfile() is stable across calls', () => {
    const { getProfile } = createProfile({ profile: fixture(), schema })
    expect(getProfile()).toBe(getProfile())
  })
})

describe('createProfile — blocklist expansion', () => {
  const withAccess = (access) => ({ identity: { instance: 'https://x.test/' }, policies: { access } })

  it('passes an array-form blocklist through untouched', () => {
    const p = load(withAccess({ blocks: { domains: ['bad.test'], terms: ['someslur'] } }))
    expect(p.policies.access.blocks.domains).toEqual(['bad.test'])
    expect(p.policies.access.blocks.terms).toEqual(['someslur'])
  })

  it('expands a path-form blocklist by reading and parsing the file', () => {
    const readFile = vi.fn(() => JSON.stringify(['bad.test', 'worse.test']))
    const p = load(withAccess({ blocks: { domains: './blocklists/domains.json' } }), {}, readFile)
    expect(readFile).toHaveBeenCalledWith('./blocklists/domains.json')
    expect(p.policies.access.blocks.domains).toEqual(['bad.test', 'worse.test'])
  })

  it('expands every array-or-path slot, including whitelist.domains', () => {
    const readFile = vi.fn((path) =>
      JSON.stringify(path.includes('terms') ? ['someslur'] : ['https://friend.test'])
    )
    const p = load(
      withAccess({
        registration: 'closed',
        blocks: { terms: './blocklists/terms.json' },
        whitelist: { domains: './blocklists/allow.json' },
      }),
      {},
      readFile
    )
    expect(p.policies.access.blocks.terms).toEqual(['someslur'])
    expect(p.policies.access.whitelist.domains).toEqual(['https://friend.test'])
  })

  it('surfaces the expanded array, never the path', () => {
    const p = load(withAccess({ blocks: { domains: './b.json' } }), {}, () => '["bad.test"]')
    expect(typeof p.policies.access.blocks.domains).not.toBe('string')
  })

  it('throws when a declared blocklist file is missing — never a silent empty list', () => {
    const readFile = () => { throw new Error('ENOENT: no such file or directory') }
    expect(() => load(withAccess({ blocks: { domains: './missing.json' } }), {}, readFile))
      .toThrow(/blocks\.domains|missing\.json/i)
  })

  it('throws when a blocklist file is unparseable', () => {
    expect(() => load(withAccess({ blocks: { terms: './bad.json' } }), {}, () => '{nope'))
      .toThrow(/blocks\.terms|bad\.json/i)
  })

  it('throws when the parsed file is not an array of strings', () => {
    expect(() => load(withAccess({ blocks: { domains: './b.json' } }), {}, () => '{"a":1}'))
      .toThrow(/array of strings/i)
  })

  it('throws when a path is declared but no readFile dependency was injected', () => {
    expect(() => load(withAccess({ blocks: { domains: './b.json' } }))).toThrow(/readFile/i)
  })

  it('does not call readFile at all when every list is inline', () => {
    const readFile = vi.fn()
    load(withAccess({ blocks: { domains: ['bad.test'] } }), {}, readFile)
    expect(readFile).not.toHaveBeenCalled()
  })
})

describe('createProfile — instance precedence', () => {
  it('uses the authored identity.instance when no env override is present', () => {
    expect(load(fixture(), {}).identity.instance).toBe('https://authored.test/')
  })

  it('env.instance wins over the authored value', () => {
    const p = load(fixture(), { instance: 'https://staging.test/' })
    expect(p.identity.instance).toBe('https://staging.test/')
  })

  it('an empty-string env.instance does not clobber the authored value', () => {
    expect(load(fixture(), { instance: '' }).identity.instance).toBe('https://authored.test/')
  })

  it('env.instance alone is enough (authored instance may be absent)', () => {
    expect(load({}, { instance: 'https://only-env.test/' }).identity.instance)
      .toBe('https://only-env.test/')
  })

  it('throws when neither authored nor env supplies an instance', () => {
    expect(() => load({}, {})).toThrow(/instance/i)
  })
})

describe('createProfile — validation and guards', () => {
  it('rejects an authored profile with an unknown top-level key', () => {
    expect(() => load({ nonsense: true }, { instance: 'https://x.test/' }))
      .toThrow(/schema validation/i)
  })

  it('rejects the old flat shape outright', () => {
    expect(() => load({ name: 'Octothorpes', relay: null }, { instance: 'https://x.test/' }))
      .toThrow(/schema validation/i)
  })

  it('fires the no-secrets guard before schema validation', () => {
    expect(() => createProfile({
      profile: { identity: { contact: { apiToken: 'nope' } } },
      schema,
      env: { instance: 'https://x.test/' },
    })).toThrow(/secret-shaped key/i)
  })

  it('requires a profile object and a schema object', () => {
    expect(() => createProfile({ schema })).toThrow(/profile/i)
    expect(() => createProfile({ profile: {} })).toThrow(/schema/i)
  })
})

describe('createProfile — access-gate coherence warnings', () => {
  const warned = (authored) => {
    const warn = vi.fn()
    createProfile({
      profile: { identity: { instance: 'https://x.test/' }, ...authored },
      schema,
      warn,
    }).getProfile()
    return warn.mock.calls.flat().join(' ')
  }

  it('warns when blocks.domains is set outside open mode (it is inert there)', () => {
    expect(warned({ policies: { access: { registration: 'registered', blocks: { domains: ['bad.test'] } } } }))
      .toMatch(/blocks\.domains/i)
    expect(warned({ policies: { access: { registration: 'closed', blocks: { domains: ['bad.test'] }, whitelist: { domains: ['https://f.test'] } } } }))
      .toMatch(/blocks\.domains/i)
  })

  it('does not warn about blocks.domains in open mode', () => {
    expect(warned({ policies: { access: { registration: 'open', blocks: { domains: ['bad.test'] } } } }))
      .not.toMatch(/blocks/i)
  })

  it('NEVER warns about blocks.terms — it applies in every registration mode', () => {
    // A relay refuses a slur term regardless of how its origin gate is
    // configured, so blocks.terms carries no mode restriction to warn about.
    for (const registration of ['registered', 'open', 'closed']) {
      expect(warned({
        policies: {
          access: {
            registration,
            blocks: { terms: ['someslur'] },
            whitelist: { domains: ['https://f.test'] },
          },
        },
      })).not.toMatch(/terms/i)
    }
  })

  it('warns when closed mode has an empty whitelist.domains (nothing can be indexed)', () => {
    expect(warned({ policies: { access: { registration: 'closed' } } })).toMatch(/whitelist/i)
  })

  it('does not warn on a coherent closed configuration', () => {
    expect(warned({ policies: { access: { registration: 'closed', whitelist: { domains: ['https://f.test'] } } } }))
      .toBe('')
  })

  it('warns rather than throws — a schema-valid profile always loads', () => {
    expect(() => createProfile({
      profile: { identity: { instance: 'https://x.test/' }, policies: { access: { registration: 'closed' } } },
      schema,
      warn: () => {},
    }).getProfile()).not.toThrow()
  })
})
```

> Add `vi` to the vitest import at the top of this file.

- [ ] Run `npx vitest run src/tests/profileLoader.test.js` — expect fail.
- [ ] Rewrite `packages/core/profile.js`. Keep `assertNoSecrets` and `validateAgainstSchema` as-is; replace the relay resolution with the defaults tree and instance precedence:

```js
import Ajv from 'ajv'

// #217 Rev 2 — OP Client Profile loader. Framework-agnostic: takes the parsed
// authored profile object, the schema object, and an optional flat env object.
// No fs/path/$env access here — the adapter (src/lib/profile.js) reads
// octothorpes.json and injects env, mirroring src/lib/indexing.js.
//
// The authored file is DECLARATIVE ONLY. Anything discoverable (publisher and
// harmonizer names) is resolved at init and appears only in the resolved
// profile — see packages/core/resolveProfile.js.

const SECRET_KEY_RE = /key|secret|token|password|credential/i

const assertNoSecrets = (node, path = '') => {
  if (Array.isArray(node)) {
    node.forEach((v, i) => assertNoSecrets(v, `${path}[${i}]`))
    return
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      const fieldPath = path ? `${path}.${k}` : k
      if (SECRET_KEY_RE.test(k)) {
        throw new Error(
          `Profile contains a secret-shaped key "${fieldPath}" — credentials must live in env and be resolved at point-of-use, never in octothorpes.json`
        )
      }
      assertNoSecrets(v, fieldPath)
    }
  }
}

const validateAgainstSchema = (profile, schema) => {
  const ajv = new Ajv({ allErrors: true })
  const validate = ajv.compile(schema)
  if (!validate(profile)) {
    const details = (validate.errors || [])
      .map((e) => `${e.instancePath || '(root)'} ${e.message}`)
      .join('; ')
    throw new Error(`Profile failed schema validation: ${details}`)
  }
}

/**
 * The canonical OP vocabulary namespace IRI (#217, 2026-08-31). Overriding
 * vocabulary.octo forks vocabulary identity: different IRIs get written into the
 * graph and the data no longer merges with standard-vocab relays.
 */
export const OCTO_VOCABULARY_IRI = 'https://vocab.octothorp.es#'

/**
 * Deep default tree. getProfile() always returns a fully-populated object, so
 * consumers never write `profile.policies?.access?.registration ?? 'open'`.
 * Written out explicitly rather than derived from schema `default` keywords:
 * ajv's useDefaults does not fill nested objects that are themselves absent,
 * and an explicit tree is what the resolved-profile contract is checked against.
 */
export const PROFILE_DEFAULTS = Object.freeze({
  identity: {
    instance: null,
    name: null,
    description: null,
    terms: null,
    feeds: {},
    images: {},
    contact: {},
  },
  policies: {
    commercial: false,
    labels: [],
    // WHAT TRIGGERS indexing. Orthogonal to access.registration below.
    indexing: { mode: 'request', frequency: null },
    // WHAT GATE an index request must pass. 'registered' is today's behavior
    // (the verifiedOrigin check in indexer.js), so it is the safe default.
    // Two blocklists, two enforcement points. blocks.domains is the ORIGIN
    // list, gated at the access check and meaningful only under 'open'.
    // blocks.terms is the TERM list, enforced at statement-write time during
    // indexing and orthogonal to the registration mode entirely.
    // whitelist carries `domains` only — a terms allowlist is a different
    // product decision with no current use case.
    access: {
      registration: 'registered',
      badge: null,
      blocks: { domains: [], terms: [] },
      whitelist: { domains: [] },
    },
  },
  api: {
    linkTypes: [],
    documentRecord: [],
    // Three sibling extension points. `default` is a handler MODE and belongs
    // to handlers; harmonizers reference handlers via their `mode` field.
    publishers: { dir: null, named: [] },
    handlers: { dir: null, default: 'html', named: [] },
    harmonizers: { dir: null, named: [] },
  },
  vocabulary: { octo: OCTO_VOCABULARY_IRI, namespaces: [] },
  federation: {},
})

const isPlainObject = (v) => v != null && typeof v === 'object' && !Array.isArray(v)

// Deep-merge authored over defaults. Arrays are replaced wholesale (an authored
// linkTypes list is the list, not an addition), and every value is cloned so no
// caller can reach back into PROFILE_DEFAULTS.
const mergeDefaults = (defaults, authored) => {
  const out = {}
  const keys = new Set([...Object.keys(defaults), ...Object.keys(authored ?? {})])
  for (const key of keys) {
    const d = defaults[key]
    const a = authored?.[key]
    if (a === undefined) {
      out[key] = isPlainObject(d) || Array.isArray(d) ? structuredClone(d) : d
    } else if (isPlainObject(d) && isPlainObject(a)) {
      out[key] = mergeDefaults(d, a)
    } else {
      out[key] = structuredClone(a)
    }
  }
  return out
}

/**
 * Expand one array-or-path list slot. Blocklists get long and are often kept in
 * a separate file, sometimes shared between deployments, so both value forms are
 * first-class. An array is returned as-is; a string is a path read through the
 * INJECTED `readFile` dependency (core never touches fs) and parsed here.
 *
 * A missing or unparseable file is a LOAD-TIME ERROR. Degrading to an empty list
 * would silently disable a blocklist the operator believes is in force, which is
 * the one failure mode worth being loud about.
 *
 * @param {string[]|string|undefined} value
 * @param {string} label - dotted path, for the error message (e.g. 'blocks.terms')
 * @param {(path: string) => string} [readFile]
 * @returns {string[]}
 */
const expandList = (value, label, readFile) => {
  if (Array.isArray(value)) return [...value]
  if (typeof value !== 'string') return []
  if (typeof readFile !== 'function') {
    throw new Error(
      `policies.access.${label} is a file path ("${value}") but no \`readFile\` dependency was injected into createProfile`
    )
  }
  let raw
  try {
    raw = readFile(value)
  } catch (e) {
    throw new Error(`policies.access.${label} could not read "${value}": ${e.message}`)
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    throw new Error(`policies.access.${label} file "${value}" is not valid JSON: ${e.message}`)
  }
  if (!Array.isArray(parsed) || parsed.some((v) => typeof v !== 'string')) {
    throw new Error(`policies.access.${label} file "${value}" must contain an array of strings`)
  }
  return parsed
}

/**
 * Creates a validated, framework-agnostic profile accessor.
 * @param {Object} config
 * @param {Object} config.profile - Parsed authored octothorpes.json (minus $schema).
 * @param {Object} config.schema - Parsed packages/core/profile.schema.json.
 * @param {Object} [config.env] - Flat env object. `env.instance`, when non-empty,
 *   overrides identity.instance (deploy-level override; .env stays secrets-plus-override).
 * @param {(message: string) => void} [config.warn=console.warn] - Sink for coherence
 *   warnings (schema-valid but inert policy combinations).
 * @param {(path: string) => string} [config.readFile] - Injected synchronous file
 *   read, used ONLY to expand path-form blocklists. Same injection pattern as the
 *   directory discovery in Wave 3: core stays framework-agnostic and the
 *   SvelteKit adapter supplies readFileSync.
 * @returns {{ getProfile: () => Object }}
 */
export const createProfile = ({ profile, schema, env = {}, warn = console.warn, readFile } = {}) => {
  if (!isPlainObject(profile)) {
    throw new Error('createProfile requires a `profile` object (the parsed octothorpes.json contents)')
  }
  if (!isPlainObject(schema)) {
    throw new Error('createProfile requires a `schema` object (the parsed profile.schema.json contents)')
  }

  // Defense in depth: runs first and independently of schema validation, so the
  // "secret-shaped key" message keeps firing even if a future schema revision
  // loosens additionalProperties.
  assertNoSecrets(profile)
  validateAgainstSchema(profile, schema)

  const resolved = mergeDefaults(PROFILE_DEFAULTS, profile)

  // Deploy-level override wins. Empty string is treated as absent so an unset
  // Docker/Railway variable never clobbers the authored value.
  if (env?.instance) resolved.identity.instance = env.instance
  if (!resolved.identity.instance) {
    throw new Error(
      'Profile has no `identity.instance` and no `instance` env override — a client needs a canonical base URL'
    )
  }

  // Per-item default that mergeDefaults cannot reach (array items are replaced
  // wholesale). import:true is DECLARE-ONLY in v0.7 — see resolveProfile.
  resolved.vocabulary.namespaces = resolved.vocabulary.namespaces.map((ns) => ({
    import: false,
    ...ns,
  }))

  // Expand the array-or-path list slots. After this point the profile carries
  // only expanded arrays — the resolved projection never surfaces a path.
  const access = resolved.policies.access
  access.blocks = {
    domains: expandList(access.blocks?.domains, 'blocks.domains', readFile),
    terms: expandList(access.blocks?.terms, 'blocks.terms', readFile),
  }
  access.whitelist = {
    domains: expandList(access.whitelist?.domains, 'whitelist.domains', readFile),
  }

  // Coherence warnings, not errors: the profile is schema-valid but the
  // combination is inert or self-defeating.
  const { registration, blocks, whitelist } = access
  if (registration !== 'open' && blocks.domains.length > 0) {
    warn(
      `[profile] policies.access.blocks.domains is non-empty but registration is "${registration}" — the ORIGIN blocklist only applies in "open" mode and is inert here`
    )
  }
  // NOTE: blocks.terms is deliberately NOT warned on. It is orthogonal to the
  // registration mode and applies under 'registered', 'open' and 'closed'
  // alike — a relay refuses a slur term however its origin gate is configured.
  if (registration === 'closed' && whitelist.domains.length === 0) {
    warn(
      '[profile] policies.access.registration is "closed" with an empty whitelist.domains — this client can index nothing at all'
    )
  }

  return { getProfile: () => resolved }
}
```

- [ ] Run `npx vitest run src/tests/profileLoader.test.js src/tests/profile-schema.test.js` — expect pass.
- [ ] Commit: `#217 wave 1: nested createProfile with deep defaults and instance precedence`

## Task 3: Delete the dead credential exports

**Files**
- Modify: `packages/core/profile.js` (already done in Task 2 — verify nothing lingers)
- Modify: `packages/core/client.js` (re-export line, if present)
- Test: `src/tests/exports.test.js`

**Interfaces**
- Removes: `credentialEnvKey`, `getAccountCredentials`
- Adds to the public surface: `createProfile`, `PROFILE_DEFAULTS`, `OCTO_VOCABULARY_IRI`

`externalAccounts` is gone from the schema (`identity.contact` replaces it for discovery), so these two exports have neither a caller nor a data source. Posting credentials are point-of-use in `.env`, resolved by a posting publisher's own config — and no posting publisher exists yet. Deleting rather than rewiring is the #217 carve-out.

**Steps**

- [ ] Add to `src/tests/exports.test.js`:

```js
import * as core from 'octothorpes'

describe('#217 profile surface', () => {
  it('exports the profile loader and its constants', () => {
    expect(typeof core.createProfile).toBe('function')
    expect(typeof core.PROFILE_DEFAULTS).toBe('object')
    expect(core.OCTO_VOCABULARY_IRI).toBe('https://vocab.octothorp.es#')
  })

  it('no longer exports the dead credential helpers', () => {
    expect(core.credentialEnvKey).toBeUndefined()
    expect(core.getAccountCredentials).toBeUndefined()
  })
})
```

- [ ] Run `npx vitest run src/tests/exports.test.js` — expect fail on the second case if any re-export lingers.
- [ ] `grep -rn "credentialEnvKey\|getAccountCredentials" packages src` and delete every hit (core re-exports, adapter re-export in `src/lib/profile.js`, any test).
- [ ] Ensure `packages/core/client.js` re-exports the new surface:
  ```js
  export { createProfile, PROFILE_DEFAULTS, OCTO_VOCABULARY_IRI } from './profile.js'
  ```
- [ ] Run `npx vitest run src/tests/exports.test.js` — expect pass.
- [ ] Commit: `#217 wave 1: drop dead credential exports (externalAccounts is gone)`

## Task 4: Update the SvelteKit profile adapter

**Files**
- Modify: `src/lib/profile.js`
- Test: `src/tests/profileAdapter.test.js` (rewrite)

**Interfaces**
- Consumes: `octothorpes.json`, `packages/core/profile.schema.json`, `$env/dynamic/private`
- Produces: `export { getProfile }` — no other exports.

**Steps**

- [ ] Rewrite `src/tests/profileAdapter.test.js`. It asserts the *wiring*, not the profile contents, so re-authoring `octothorpes.json` cannot break it:

```js
import { describe, it, expect } from 'vitest'
import { getProfile } from '$lib/profile.js'
import { PROFILE_DEFAULTS } from 'octothorpes'

// #217: the adapter is wiring only. It asserts the injected profile came back
// fully populated and instance-resolved — never specific authored values.

describe('src/lib/profile.js adapter', () => {
  it('returns a fully populated profile (every default block present)', () => {
    const p = getProfile()
    for (const block of Object.keys(PROFILE_DEFAULTS)) {
      expect(p[block]).toBeDefined()
    }
    expect(p.policies.access.blocks.domains).toBeInstanceOf(Array)
    expect(p.policies.access.blocks.terms).toBeInstanceOf(Array)
    expect(p.policies.access.whitelist.domains).toBeInstanceOf(Array)
    expect(p.api.handlers.default).toBeTypeOf('string')
    expect(p.api.harmonizers).toBeDefined()
    expect(p.vocabulary.octo).toBeTypeOf('string')
  })

  it('resolves identity.instance to a usable absolute URL', () => {
    const { instance } = getProfile().identity
    expect(() => new URL(instance)).not.toThrow()
  })

  it('is a singleton — repeated calls return the same object', () => {
    expect(getProfile()).toBe(getProfile())
  })

  it('exposes no credential helpers', async () => {
    const mod = await import('$lib/profile.js')
    expect(mod.getAccountCredentials).toBeUndefined()
  })
})
```

- [ ] Run `npx vitest run src/tests/profileAdapter.test.js` — expect fail.
- [ ] Rewrite `src/lib/profile.js`:

```js
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createProfile } from 'octothorpes'
import { env } from '$env/dynamic/private'
import profileData from '../../octothorpes.json'
import profileSchema from '../../packages/core/profile.schema.json'

// Thin SvelteKit adapter (mirrors src/lib/indexing.js): injects the repo-root
// octothorpes.json, the schema, and $env. `env.instance` is the deploy-level
// override for identity.instance — .env is secrets plus that one override.
// No profile logic here; see packages/core/profile.js.
const { $schema, ...authored } = profileData

const { getProfile } = createProfile({
  profile: authored,
  schema: profileSchema,
  env,
  // Injected read dependency for path-form blocklists (blocks.domains,
  // blocks.terms, whitelist.domains). Same pattern as the fs injection the
  // Wave 3 directory discovery uses — core never imports fs.
  readFile: (path) => readFileSync(resolve(process.cwd(), path), 'utf8'),
})

export { getProfile }
```

- [ ] Run `npx vitest run src/tests/profileAdapter.test.js src/tests/profileLoader.test.js src/tests/profile-schema.test.js` — expect pass.
- [ ] Commit: `#217 wave 1: re-point the SvelteKit profile adapter at the nested loader`

---

# Wave 2 — Re-point consumers

## Task 5: Profile-driven namespaces in `queryBuilders`

**Files**
- Modify: `packages/core/queryBuilders.js`
- Modify: `packages/core/ld/prefixes.js`
- Modify: `src/lib/ld/prefixes.js`
- Test: `src/tests/documentRecord-query.test.js`

**Interfaces**
- Produces:
  ```js
  export const BUILTIN_NAMESPACES: Array<{prefix, iri, import: false, source: 'builtin'}>
  export const mergeNamespaces = (declared = []) => Array<{prefix, iri, import, source}>
  export const namespaceMap = (namespaces) => Record<string, string>   // prefix -> iri
  export const resolveDocumentRecordIri = (entry, namespaces?) => string | null
  ```
- Builtins are **octo, rdf, schema ONLY**. `foaf` was audited unused (#217 gap audit) — removed here and from both `prefixes.js` PREFIX blocks.
- `mergeNamespaces` is declared-wins-over-builtin on prefix collision, and tags every entry with `source`.
- Consumers pass `profile.vocabulary.namespaces`; `resolveDocumentRecordIri(entry)` with no second argument falls back to builtins, so existing core-internal calls keep working.

**Steps**

- [ ] Append to `src/tests/documentRecord-query.test.js`:

```js
import {
  BUILTIN_NAMESPACES,
  mergeNamespaces,
  namespaceMap,
  resolveDocumentRecordIri,
} from 'octothorpes'
import corePrefixes from '../../packages/core/ld/prefixes.js'

describe('#217 profile-driven namespaces', () => {
  it('ships octo, rdf and schema as builtins — and not foaf', () => {
    expect(BUILTIN_NAMESPACES.map((n) => n.prefix).sort()).toEqual(['octo', 'rdf', 'schema'])
  })

  it('drops the unused foaf PREFIX from the injected SPARQL prologue', () => {
    expect(corePrefixes).not.toMatch(/foaf/)
    expect(corePrefixes).toMatch(/PREFIX octo:/)
  })

  it('tags builtin vs declared', () => {
    const merged = mergeNamespaces([
      { prefix: 'skos', iri: 'http://www.w3.org/2004/02/skos/core#', import: true },
    ])
    expect(merged.find((n) => n.prefix === 'octo').source).toBe('builtin')
    const skos = merged.find((n) => n.prefix === 'skos')
    expect(skos.source).toBe('declared')
    expect(skos.import).toBe(true)
  })

  it('a declared namespace overrides a builtin of the same prefix', () => {
    const merged = mergeNamespaces([{ prefix: 'schema', iri: 'https://fork.test/schema/' }])
    const schema = merged.filter((n) => n.prefix === 'schema')
    expect(schema).toHaveLength(1)
    expect(schema[0].iri).toBe('https://fork.test/schema/')
    expect(schema[0].source).toBe('declared')
  })

  it('mergeNamespaces() with no argument is just the builtins', () => {
    expect(mergeNamespaces().map((n) => n.prefix).sort()).toEqual(['octo', 'rdf', 'schema'])
  })

  it('resolves a documentRecord IRI through a declared namespace', () => {
    const ns = namespaceMap(mergeNamespaces([
      { prefix: 'skos', iri: 'http://www.w3.org/2004/02/skos/core#' },
    ]))
    expect(resolveDocumentRecordIri({ predicate: 'prefLabel', namespace: 'skos' }, ns))
      .toBe('http://www.w3.org/2004/02/skos/core#prefLabel')
  })

  it('import:true resolves exactly like import:false (declare-only in v0.7)', () => {
    const declared = [{ prefix: 'skos', iri: 'http://www.w3.org/2004/02/skos/core#', import: true }]
    const withImport = namespaceMap(mergeNamespaces(declared))
    const withoutImport = namespaceMap(mergeNamespaces(
      declared.map((n) => ({ ...n, import: false }))
    ))
    expect(withImport).toEqual(withoutImport)
    const entry = { predicate: 'prefLabel', namespace: 'skos' }
    expect(resolveDocumentRecordIri(entry, withImport))
      .toBe(resolveDocumentRecordIri(entry, withoutImport))
  })

  it('falls back to builtins when no namespaces are passed', () => {
    expect(resolveDocumentRecordIri({ predicate: 'encodingFormat', namespace: 'schema' }))
      .toBe('https://schema.org/encodingFormat')
  })

  it('returns null for an undeclared prefix rather than minting a malformed IRI', () => {
    expect(resolveDocumentRecordIri({ predicate: 'prefLabel', namespace: 'skos' })).toBeNull()
  })
})
```

- [ ] Run `npx vitest run src/tests/documentRecord-query.test.js` — expect fail.
- [ ] Replace the `documentRecordNamespaces` map in `packages/core/queryBuilders.js`:

```js
/**
 * Protocol builtins. Core ships only the namespaces the protocol itself needs;
 * everything else is declared in the profile's vocabulary.namespaces (#217).
 * foaf was audited as unused in the #217 gap audit and demoted to
 * declare-if-you-want-it — it is no longer a builtin or a SPARQL prologue PREFIX.
 */
export const BUILTIN_NAMESPACES = Object.freeze([
  Object.freeze({ prefix: 'octo', iri: 'https://vocab.octothorp.es#', import: false, source: 'builtin' }),
  Object.freeze({ prefix: 'rdf', iri: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#', import: false, source: 'builtin' }),
  Object.freeze({ prefix: 'schema', iri: 'https://schema.org/', import: false, source: 'builtin' }),
])

/**
 * Merge profile-declared namespaces over the protocol builtins.
 * A declared prefix shadows a builtin of the same name (forking a namespace is
 * deliberate and identity-affecting, same caveat as vocabulary.octo).
 *
 * NOTE (#217, deferred to #270): `import: true` is validated and carried
 * through here, but loading the ontology's triples into a named graph is NOT
 * implemented in v0.7. Both values resolve identically today — import is
 * DECLARE-ONLY. Do not add fetch/load behavior here; it belongs in the init
 * step alongside #270's graph-model work.
 *
 * @param {Array<{prefix:string, iri:string, import?:boolean}>} [declared=[]]
 * @returns {Array<{prefix:string, iri:string, import:boolean, source:'builtin'|'declared'}>}
 */
export const mergeNamespaces = (declared = []) => {
  const tagged = (declared ?? []).map((ns) => ({
    prefix: ns.prefix,
    iri: ns.iri,
    import: ns.import ?? false,
    source: 'declared',
  }))
  const shadowed = new Set(tagged.map((n) => n.prefix))
  return [
    ...BUILTIN_NAMESPACES.filter((n) => !shadowed.has(n.prefix)).map((n) => ({ ...n })),
    ...tagged,
  ]
}

/**
 * Flatten a namespace list to a prefix -> IRI lookup.
 * @param {Array<{prefix:string, iri:string}>} [namespaces]
 * @returns {Record<string,string>}
 */
export const namespaceMap = (namespaces = BUILTIN_NAMESPACES) =>
  Object.fromEntries((namespaces ?? []).map((n) => [n.prefix, n.iri]))

/**
 * Resolve a documentRecord declaration entry to a full predicate IRI.
 * @param {{predicate:string, namespace?:string, iri?:string}} entry
 * @param {Record<string,string>} [namespaces] - prefix -> IRI; defaults to builtins.
 * @returns {string|null} full IRI, or null when the namespace is unknown (entry
 *   is then skipped from the query — a malformed IRI is never injected).
 */
export const resolveDocumentRecordIri = (entry, namespaces = namespaceMap()) => {
  if (!entry || !entry.predicate) return null
  if (entry.iri) return entry.iri
  const base = namespaces[entry.namespace]
  if (!base) return null
  return `${base}${entry.predicate}`
}
```

- [ ] Update every internal caller of `resolveDocumentRecordIri` inside `packages/core/` (grep it) so the namespaces argument threads through from `buildDocumentRecordClauses(schema, namespaces)`; give `namespaces` a default of `namespaceMap()` at each hop so no existing call site breaks.
- [ ] Delete the `PREFIX foaf:` line from both `packages/core/ld/prefixes.js` and `src/lib/ld/prefixes.js`.
- [ ] Run `npx vitest run src/tests/documentRecord-query.test.js src/tests/documentRecord.test.js src/tests/documentRecordProjection.test.js src/tests/sparql.test.js` — expect pass.
- [ ] Commit: `#217 wave 2: profile-declared namespaces replace the hardcoded map; drop unused foaf`

## Task 6: Re-point the `/get` route load at `api.linkTypes` / `api.documentRecord`

**Files**
- Modify: `src/routes/get/[what]/[by]/[[as]]/load.js`
- Test: `src/tests/subtypePaths.test.js`

**Interfaces**
- Consumes: `getProfile().api.linkTypes` (was `vocabulary.relationshipSubtypes`), `getProfile().api.documentRecord` (was `vocabulary.documentRecord`), `getProfile().vocabulary.namespaces`
- Produces: unchanged route behavior — `options.subtype`, `options.documentRecordSchema`, plus a new `options.namespaces`.

**Steps**

- [ ] Add to `src/tests/subtypePaths.test.js` a route-layer test that uses its own declaration rather than the committed profile:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

// #217 wave 2: the route reads api.linkTypes (renamed from
// vocabulary.relationshipSubtypes) and api.documentRecord (moved out of
// vocabulary). Profile is mocked so this never depends on authored values.

const fakeProfile = {
  identity: { instance: 'https://example.test/' },
  api: {
    linkTypes: [{ type: 'Item', label: 'Item', path: 'items' }],
    documentRecord: [{ predicate: 'encodingFormat', namespace: 'schema', range: 'literal' }],
  },
  vocabulary: { octo: 'https://vocab.octothorp.es#', namespaces: [] },
}

vi.mock('$lib/profile.js', () => ({ getProfile: () => fakeProfile }))

const seen = []
vi.mock('$lib/op.js', () => ({
  op: {
    get: async (args) => { seen.push(args); return { results: [] } },
    publisher: { getPublisher: () => null },
  },
}))

const { load } = await import('../routes/get/[what]/[by]/[[as]]/load.js')

describe('#217 route reads api.linkTypes / api.documentRecord', () => {
  beforeEach(() => { seen.length = 0 })

  it('rewrites a declared linkTypes path to a subtype-filtered everything query', async () => {
    await load({ params: { what: 'items', by: 'posted' }, url: new URL('https://example.test/get/items/posted'), fetch })
    expect(seen[0].what).toBe('everything')
    expect(seen[0].subtype).toBe('Item')
  })

  it('leaves an undeclared what untouched', async () => {
    await load({ params: { what: 'everything', by: 'posted' }, url: new URL('https://example.test/get/everything/posted'), fetch })
    expect(seen[0].what).toBe('everything')
    expect(seen[0].subtype).toBeUndefined()
  })

  it('injects api.documentRecord as the read-path schema', async () => {
    await load({ params: { what: 'everything', by: 'posted' }, url: new URL('https://example.test/get/everything/posted'), fetch })
    expect(seen[0].documentRecordSchema).toEqual(fakeProfile.api.documentRecord)
  })

  it('injects the effective namespaces so declared prefixes resolve', async () => {
    await load({ params: { what: 'everything', by: 'posted' }, url: new URL('https://example.test/get/everything/posted'), fetch })
    expect(seen[0].namespaces.map((n) => n.prefix)).toContain('schema')
  })
})
```

- [ ] Run `npx vitest run src/tests/subtypePaths.test.js` — expect fail.
- [ ] Edit the profile-reading block of `src/routes/get/[what]/[by]/[[as]]/load.js`:

```js
import { mergeNamespaces } from 'octothorpes'
// ...
  const profile = getProfile()
  const { linkTypes, documentRecord } = profile.api

  // #236, renamed in #217: a `what` matching a declared linkTypes[].path is a
  // first-class link-type path — rewritten to a subtype-filtered blobject query.
  const linkType = linkTypes.find((lt) => lt.path === what)
  if (linkType) {
    options.subtype = linkType.type
    what = 'everything'
  }

  // #237, moved to api in #217: hand the declared documentRecord schema and the
  // effective namespace list to the blobject read path. Core stays
  // framework-agnostic — the profile reaches it as injected values.
  options.documentRecordSchema = documentRecord
  options.namespaces = mergeNamespaces(profile.vocabulary.namespaces)
```

- [ ] Thread `options.namespaces` through `op.get` → `buildDocumentRecordClauses` (the plumbing added in Task 5).
- [ ] Run `npx vitest run src/tests/subtypePaths.test.js src/tests/documentRecordProjection.test.js` — expect pass.
- [ ] Commit: `#217 wave 2: /get route reads api.linkTypes and api.documentRecord`

## Task 7: Re-point the indexing adapter at `api.documentRecord`

**Files**
- Modify: `src/lib/indexing.js`
- Test: `src/tests/indexingAdapterDocumentRecord.test.js`

**Interfaces**
- Consumes: `getProfile().api.documentRecord`, `getProfile().api.handlers.default`, `getProfile().identity.instance`, `getProfile().vocabulary.namespaces`
- Produces: `createIndexer({ ..., documentRecordSchema, namespaces })`

The `default_handler` env read is replaced here by `api.handlers.default` — the field is named honestly and now lives under the block it belongs to ("html" is a handler *mode*, not a harmonizer id; resolving design question 1 from the gap audit). The `.env` twin is deleted in Wave 4b.

**Steps**

- [ ] Rewrite `src/tests/indexingAdapterDocumentRecord.test.js` to mock the profile:

```js
import { describe, it, expect, vi } from 'vitest'

const fakeProfile = {
  identity: { instance: 'https://example.test/' },
  api: {
    documentRecord: [{ predicate: 'encodingFormat', namespace: 'schema', range: 'literal' }],
    handlers: { dir: null, default: 'markdown' },
    harmonizers: { dir: null },
  },
  policies: {
    indexing: { mode: 'request' },
    access: {
      registration: 'registered',
      blocks: { domains: [], terms: [] },
      whitelist: { domains: [] },
    },
  },
  vocabulary: { namespaces: [] },
}
vi.mock('$lib/profile.js', () => ({ getProfile: () => fakeProfile }))

const captured = {}
vi.mock('octothorpes', async (orig) => {
  const actual = await orig()
  return {
    ...actual,
    createIndexer: (config) => { Object.assign(captured, config); return actual.createIndexer(config) },
  }
})

await import('$lib/indexing.js')

describe('#217 indexing adapter reads the profile', () => {
  it('passes api.documentRecord as documentRecordSchema', () => {
    expect(captured.documentRecordSchema).toEqual(fakeProfile.api.documentRecord)
  })

  it('uses api.handlers.default for the handler registry default, not .env', () => {
    expect(captured.handlerRegistry.getDefault?.() ?? captured.handlerRegistry.default).toBe('markdown')
  })

  it('passes the effective namespace list', () => {
    expect(captured.namespaces.map((n) => n.prefix)).toContain('schema')
  })
})
```

> If `createDefaultHandlerRegistry` exposes no default getter, assert instead that `createDefaultHandlerRegistry` was called with `{ defaultHandler: 'markdown' }` by spying on it the same way.

- [ ] Run `npx vitest run src/tests/indexingAdapterDocumentRecord.test.js` — expect fail.
- [ ] Edit `src/lib/indexing.js`:

```js
import { createIndexer, createDefaultHandlerRegistry, createHarmonizerRegistry, harmonizeSource, mergeNamespaces } from 'octothorpes'
import { insert, query, queryBoolean, queryArray } from '$lib/sparql.js'
import { getProfile } from '$lib/profile.js'

// #217: everything operational comes from the profile now. `instance` still
// originates in .env when a deploy overrides it, but it arrives here through
// the loader's precedence rules rather than a second config read.
const profile = getProfile()
const { instance } = profile.identity
const { documentRecord, handlers } = profile.api

// `default` is a handler mode (api.handlers.default), not a harmonizer id.
const handlerRegistry = createDefaultHandlerRegistry({ defaultHandler: handlers.default })
const { getHarmonizer } = createHarmonizerRegistry(instance)

const indexer = createIndexer({
  insert,
  query,
  queryBoolean,
  queryArray,
  instance,
  handlerRegistry,
  getHarmonizer,
  documentRecordSchema: documentRecord,
  namespaces: mergeNamespaces(profile.vocabulary.namespaces),
})
```

- [ ] Run `npx vitest run src/tests/indexingAdapterDocumentRecord.test.js src/tests/indexRouteDocumentRecord.test.js src/tests/indexing.test.js` — expect pass.
- [ ] Commit: `#217 wave 2: indexing adapter reads api.documentRecord and api.handlers`

## Task 8: `op.js` builds `createClient` config from the profile (fixes the audited bug)

**Files**
- Modify: `src/lib/op.js`
- Test: `src/tests/client-documentRecordSchema.test.js`

**Interfaces**
- Consumes: `getProfile()`
- Produces: `createClient({ instance, sparql, publishers, defaultHandler, indexingMode, access, documentRecordSchema, namespaces })`

> **Ordering note:** `indexingMode` and `access` are passed here, but core only *acts* on them in Wave 4a (Tasks 14 and 17). Until then `createClient` ignores the unknown keys, which is harmless — the assertions in this task are about what the adapter hands over, not about core behavior.

**Bug (from the #217 gap audit):** `src/lib/op.js` never passes `documentRecordSchema` to `createClient`, so the client-level default is unreachable — documentRecord projection only works via the `/get` route's per-call injection, and any programmatic `op.get()` elsewhere silently loses it. This task fixes it and proves it with a test.

**Steps**

- [ ] Add to `src/tests/client-documentRecordSchema.test.js`:

```js
import { describe, it, expect, vi } from 'vitest'

// #217 gap-audit bug: op.js never passed documentRecordSchema to createClient,
// so a programmatic op.get() lost documentRecord projection entirely — only the
// /get route's per-call injection worked. This proves the client-level default.

const fakeProfile = {
  identity: { instance: 'https://example.test/' },
  api: {
    documentRecord: [{ predicate: 'encodingFormat', namespace: 'schema', range: 'literal' }],
    handlers: { dir: null, default: 'html' },
    harmonizers: { dir: null },
  },
  policies: {
    indexing: { mode: 'request' },
    access: {
      registration: 'registered',
      blocks: { domains: [], terms: [] },
      whitelist: { domains: [] },
    },
  },
  vocabulary: { namespaces: [] },
}
vi.mock('$lib/profile.js', () => ({ getProfile: () => fakeProfile }))

const captured = {}
vi.mock('octothorpes', async (orig) => {
  const actual = await orig()
  return {
    ...actual,
    createClient: (config) => { Object.assign(captured, config); return actual.createClient(config) },
  }
})

await import('$lib/op.js')

describe('#217 op.js builds createClient config from the profile', () => {
  it('passes documentRecordSchema so programmatic op.get() still projects', () => {
    expect(captured.documentRecordSchema).toEqual(fakeProfile.api.documentRecord)
  })

  it('passes the profile instance', () => {
    expect(captured.instance).toBe('https://example.test/')
  })

  it('passes defaultHandler from api.handlers.default', () => {
    expect(captured.defaultHandler).toBe('html')
  })

  it('passes the two policy axes separately and unmixed', () => {
    // indexingMode = what triggers indexing; access.registration = what gate.
    expect(captured.indexingMode).toBe('request')
    expect(captured.access).toEqual({
      registration: 'registered',
      blocks: { domains: [], terms: [] },
      whitelist: { domains: [] },
    })
  })

  it('passes the effective namespaces', () => {
    expect(captured.namespaces.map((n) => n.prefix)).toContain('schema')
  })
})
```

- [ ] Also add a direct core-level assertion that the client default actually reaches a read, in the same file:

```js
import { createClient } from 'octothorpes'

describe('createClient documentRecordSchema default reaches get()', () => {
  it('uses the client-level schema when the call supplies none', async () => {
    const seen = []
    const client = createClient({
      instance: 'https://example.test/',
      sparql: { endpoint: 'http://localhost:1/unused' },
      documentRecordSchema: [{ predicate: 'encodingFormat', namespace: 'schema', range: 'literal' }],
    })
    // buildMultiPass-level assertion: the option is threaded, not dropped.
    expect(client).toBeDefined()
    const spy = vi.spyOn(client.sparql, 'queryArray').mockImplementation(async (q) => {
      seen.push(q); return { results: { bindings: [] } }
    })
    await client.get({ what: 'everything', by: 'posted' })
    expect(seen.join('\n')).toMatch(/schema\.org\/encodingFormat|dr_schema_encodingFormat/)
    spy.mockRestore()
  })
})
```

- [ ] Run `npx vitest run src/tests/client-documentRecordSchema.test.js` — expect fail.
- [ ] Rewrite `src/lib/op.js`:

```js
// Shared OP client for the SvelteKit read path: core is the source of truth for
// querying + publishing; routes are thin transport adapters over this instance.
// #217: all non-secret config now comes from the profile. sparql credentials
// stay in .env (secrets), which is the whole point of the split.
import { createClient, mergeNamespaces } from 'octothorpes'
import { sparql_endpoint, sparql_user, sparql_password } from '$lib/config.js'
import { getProfile } from '$lib/profile.js'
import { publishers } from '$lib/publishers'

const profile = getProfile()

export const op = createClient({
  instance: profile.identity.instance,
  sparql: {
    endpoint: sparql_endpoint,
    user: sparql_user,
    password: sparql_password,
  },
  publishers,
  defaultHandler: profile.api.handlers.default,
  // The two policy axes travel separately and are never collapsed:
  //   indexingMode        — WHAT TRIGGERS indexing ('request' | 'active')
  //   access.registration — WHAT GATE an index request must pass
  // The profile spelling and the core spelling of indexingMode are identical,
  // so this is the identity function, not a mapping (Task 17).
  indexingMode: profile.policies.indexing.mode,
  access: profile.policies.access,
  // Was missing entirely (#217 gap audit): without this, programmatic op.get()
  // silently lost documentRecord projection.
  documentRecordSchema: profile.api.documentRecord,
  namespaces: mergeNamespaces(profile.vocabulary.namespaces),
})
```

- [ ] Run `npx vitest run src/tests/client-documentRecordSchema.test.js src/tests/api.test.js` — expect pass.
- [ ] Commit: `#217 wave 2: op.js builds client config from the profile (fixes missing documentRecordSchema)`

---

# Wave 3 — The resolve step

## Task 9: `discoverPublishers` in core (injected fs, skip-and-warn)

**Files**
- Create: `packages/core/discover.js`
- Modify: `packages/core/client.js` (re-export)
- Test: `src/tests/publisherDiscovery.test.js` (new)

**Interfaces**
```js
/**
 * @param {Object} config
 * @param {string} config.dir
 * @param {(dir:string) => Promise<string[]>} config.listEntries - directory names under dir
 * @param {(dir:string, name:string) => Promise<Object>} config.loadPublisher - resolves to the module's default export
 * @param {(msg:string) => void} [config.warn]
 * @returns {Promise<{ publishers: Record<string, Object>, skipped: Array<{name:string, reason:string}> }>}
 */
export const discoverPublishers = async ({ dir, listEntries, loadPublisher, warn }) => ...
```

Rules:
- `_`-prefixed names are skipped silently (`_example` is an authoring template, not a publisher — the opt-out convention pinned in the 2026-08-29 comment).
- A module that throws on load is **skipped with a warning**, not propagated. This is the fix for the known failure recorded in project memory: *a missing dep in ANY site publisher crashes the whole `$lib/publishers` glob → all `/get/` routes 500 while the homepage stays 200*, which masks itself as an env/query bug because node-side `op.get` still works. Discovery must degrade to "that one publisher is unavailable."
- A missing/unreadable `dir` yields `{ publishers: {}, skipped: [] }` plus one warning — a client with no site publishers is valid.

**Steps**

- [ ] Write `src/tests/publisherDiscovery.test.js`:

```js
import { describe, it, expect, vi } from 'vitest'
import { discoverPublishers } from 'octothorpes'

const pub = (name) => ({ meta: { name }, contentType: 'text/html', render: () => '' })

describe('discoverPublishers (#217 wave 3)', () => {
  const base = {
    dir: './publishers',
    listEntries: async () => ['blarg', 'readable', '_example', 'broken'],
    loadPublisher: async (dir, name) => {
      if (name === 'broken') throw new Error("Cannot find package 'missing-dep'")
      return pub(name)
    },
  }

  it('registers every loadable publisher by directory name', async () => {
    const { publishers } = await discoverPublishers(base)
    expect(Object.keys(publishers).sort()).toEqual(['blarg', 'readable'])
  })

  it('skips _-prefixed entries silently', async () => {
    const warn = vi.fn()
    const { publishers, skipped } = await discoverPublishers({ ...base, warn })
    expect(publishers._example).toBeUndefined()
    expect(skipped.map((s) => s.name)).not.toContain('_example')
    expect(warn.mock.calls.flat().join(' ')).not.toMatch(/_example/)
  })

  it('skips and warns on a publisher that fails to load, without throwing', async () => {
    const warn = vi.fn()
    const { publishers, skipped } = await discoverPublishers({ ...base, warn })
    expect(publishers.broken).toBeUndefined()
    expect(skipped).toEqual([{ name: 'broken', reason: "Cannot find package 'missing-dep'" }])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toMatch(/broken/)
  })

  it('one broken publisher does not take down the others', async () => {
    const { publishers } = await discoverPublishers(base)
    expect(publishers.blarg).toBeDefined()
    expect(publishers.readable).toBeDefined()
  })

  it('an unreadable dir yields an empty registry and one warning', async () => {
    const warn = vi.fn()
    const res = await discoverPublishers({
      dir: './nope',
      listEntries: async () => { throw new Error('ENOENT') },
      loadPublisher: async () => pub('x'),
      warn,
    })
    expect(res).toEqual({ publishers: {}, skipped: [] })
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('a null dir is a no-op with no warning', async () => {
    const warn = vi.fn()
    const res = await discoverPublishers({ dir: null, listEntries: async () => [], loadPublisher: async () => null, warn })
    expect(res).toEqual({ publishers: {}, skipped: [] })
    expect(warn).not.toHaveBeenCalled()
  })

  it('skips a module whose default export is missing', async () => {
    const { publishers, skipped } = await discoverPublishers({
      ...base,
      listEntries: async () => ['empty'],
      loadPublisher: async () => undefined,
    })
    expect(publishers).toEqual({})
    expect(skipped[0].name).toBe('empty')
  })
})
```

- [ ] Run `npx vitest run src/tests/publisherDiscovery.test.js` — expect fail.
- [ ] Write `packages/core/discover.js`:

```js
/**
 * Init-time publisher discovery (#217). Framework-agnostic: the directory walk
 * itself is injected, so this works under SvelteKit/Vite, plain node (Memex),
 * or a test harness with no filesystem at all. This REPLACES import.meta.glob
 * as the mechanism of record — glob is Vite-only and, more importantly, fails
 * all-or-nothing.
 *
 * Skip-and-warn is the whole point of the rewrite: a missing dependency in ANY
 * single site publisher previously crashed the entire eager glob, which 500'd
 * every /get/ route while the homepage stayed 200 — a failure that reads as an
 * env or query bug because node-side op.get() keeps working. One broken
 * publisher must degrade to "that publisher is unavailable", nothing more.
 *
 * @param {Object} config
 * @param {string|null} config.dir - Declared publishers directory (api.publishers.dir).
 * @param {(dir: string) => Promise<string[]>} config.listEntries - Directory entry names under dir.
 * @param {(dir: string, name: string) => Promise<Object|undefined>} config.loadPublisher -
 *   Resolves an entry name to the publisher module's default export.
 * @param {(message: string) => void} [config.warn=console.warn]
 * @returns {Promise<{ publishers: Record<string, Object>, skipped: Array<{name: string, reason: string}> }>}
 */
export const discoverPublishers = async ({ dir, listEntries, loadPublisher, warn = console.warn } = {}) => {
  const publishers = {}
  const skipped = []
  if (!dir) return { publishers, skipped }

  let entries
  try {
    entries = await listEntries(dir)
  } catch (e) {
    warn(`[profile] publishers dir "${dir}" could not be read: ${e.message} — no site publishers registered`)
    return { publishers, skipped }
  }

  for (const name of entries) {
    // `_`-prefixed entries opt out of discovery and of public listing
    // (_example is an authoring template, not a publisher).
    if (name.startsWith('_')) continue
    try {
      const publisher = await loadPublisher(dir, name)
      if (!publisher) throw new Error('module has no default export')
      publishers[name] = publisher
    } catch (e) {
      skipped.push({ name, reason: e.message })
      warn(`[profile] site publisher "${name}" failed to load and was skipped: ${e.message}`)
    }
  }

  return { publishers, skipped }
}
```

- [ ] Re-export from `packages/core/client.js`: `export { discoverPublishers } from './discover.js'`
- [ ] Run `npx vitest run src/tests/publisherDiscovery.test.js src/tests/exports.test.js` — expect pass.
- [ ] Commit: `#217 wave 3: core publisher discovery with injected fs and skip-and-warn`

## Task 10: SvelteKit discovery adapter replaces `import.meta.glob`

**Files**
- Modify: `src/lib/publishers/index.js`
- Test: `src/tests/publisherDiscovery.test.js` (append an adapter section)

**Interfaces**
- Produces: `export const publishers: Record<string, Object>` (unchanged shape for `op.js`), plus `export const skippedPublishers: Array<{name, reason}>`
- Consumes: `getProfile().api.publishers.dir`, `node:fs/promises`, dynamic `import()`

**Steps**

- [ ] Append to `src/tests/publisherDiscovery.test.js`:

```js
describe('SvelteKit publisher discovery adapter', () => {
  it('discovers the shipped site publishers from api.publishers.dir', async () => {
    const { publishers } = await import('$lib/publishers/index.js')
    expect(Object.keys(publishers).length).toBeGreaterThan(0)
    for (const name of Object.keys(publishers)) {
      expect(name.startsWith('_')).toBe(false)
      expect(typeof publishers[name]).toBe('object')
    }
  })

  it('exposes skipped publishers rather than throwing', async () => {
    const { skippedPublishers } = await import('$lib/publishers/index.js')
    expect(Array.isArray(skippedPublishers)).toBe(true)
  })
})
```

- [ ] Run `npx vitest run src/tests/publisherDiscovery.test.js` — expect fail on the adapter section.
- [ ] Rewrite `src/lib/publishers/index.js`:

```js
import { readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { discoverPublishers } from 'octothorpes'
import { getProfile } from '$lib/profile.js'

// #217 wave 3: directory walk replaces import.meta.glob as the mechanism of
// record. The declared api.publishers.dir is walked at init; core owns the
// skip-and-warn policy so one broken site publisher can no longer 500 every
// /get/ route. Module scope, awaited once — createClient is a singleton.
const dir = getProfile().api.publishers.dir

const { publishers: discovered, skipped } = await discoverPublishers({
  dir,
  listEntries: async (d) =>
    (await readdir(resolve(process.cwd(), d), { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name),
  loadPublisher: async (d, name) =>
    (await import(/* @vite-ignore */ resolve(process.cwd(), d, name, 'renderer.js'))).default,
})

export const publishers = discovered
export const skippedPublishers = skipped
```

- [ ] Run `npx vitest run src/tests/publisherDiscovery.test.js src/tests/readable-publisher.test.js src/tests/publish.test.js` — expect pass.
- [ ] Manually verify: `npm run dev`, then `curl -s -o /dev/null -w '%{http_code}' localhost:5173/get/everything/posted` → 200.
- [ ] Commit: `#217 wave 3: replace import.meta.glob publisher discovery with the core directory walk`

## Task 11: `resolveProfile` — the merged projection

**Files**
- Create: `packages/core/resolveProfile.js`
- Modify: `packages/core/client.js` (re-export)
- Test: `src/tests/resolveProfile.test.js` (new)

**Interfaces**
```js
/**
 * @param {Object} config
 * @param {Object} config.profile - a fully-populated getProfile() result
 * @param {string[]} [config.publisherNames]  - discovered + builtin publisher names
 * @param {string[]} [config.handlerNames]    - registered handler modes (builtin + discovered)
 * @param {string[]} [config.harmonizerNames] - registered harmonizer names
 * @returns {Object} the resolved projection (see profile.resolved.draft.json)
 */
export const resolveProfile = ({ profile, publisherNames = [], handlerNames = [], harmonizerNames = [] }) => ...

export const expandTermUri = (termsPrefix, name) => string
export const absolutize = (path, instance) => string | null
```

Projection rules (from `profile.resolved.draft.json`):
- authored + defaults, minus nothing (`federation` passes through as authored).
- `api.publishers.available` = sorted unique union of core builtins and discovered names; `api.publishers.dir` and `named` are **dropped** from the projection (a pointer is not public data).
- `api.handlers.available` = registered handler modes (builtins + discovered); `default` kept; `dir`/`named` dropped.
- `api.harmonizers.available` = registered harmonizer names; `dir`/`named` dropped. No `defaultHandler` here — it moved to `api.handlers.default`.
- `vocabulary.namespaces` = `mergeNamespaces(authored)` — every entry carries `source: 'builtin' | 'declared'` and an explicit `import`.
- `identity.feeds` slots that are **arrays of term names** expand to absolute URIs via `identity.terms`; slots that are strings absolutize against `identity.instance`.
- `identity.images.*` and `policies.access.badge` absolutize against `identity.instance`.

**Steps**

- [ ] Write `src/tests/resolveProfile.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve as res } from 'node:path'
import { createProfile, resolveProfile, expandTermUri, absolutize } from 'octothorpes'

const here = dirname(fileURLToPath(import.meta.url))
const schema = JSON.parse(readFileSync(res(here, '../../packages/core/profile.schema.json'), 'utf8'))

const authored = {
  identity: {
    instance: 'https://example.test/',
    name: 'Example',
    terms: 'https://example.test/~/',
    feeds: { thorpes: ['cats', 'dogs'], multipass: '/news.json' },
    images: { favicon: '/favicon.ico', avatar: 'https://cdn.test/avatar.png' },
  },
  policies: { access: { registration: 'open', badge: '/badge.png' } },
  api: {
    publishers: { dir: './src/lib/publishers' },
    handlers: { dir: './src/lib/handlers', default: 'html' },
    harmonizers: { dir: './src/lib/harmonizers' },
  },
  vocabulary: { namespaces: [{ prefix: 'skos', iri: 'http://www.w3.org/2004/02/skos/core#', import: true }] },
}

const profile = createProfile({ profile: authored, schema }).getProfile()
const resolved = () => resolveProfile({
  profile,
  publisherNames: ['rss2', 'ics', 'blarg', 'readable', 'rss2'],
  handlerNames: ['html', 'json', 'csv'],
  harmonizerNames: ['default', 'openGraph'],
})

describe('resolveProfile — discovery projection', () => {
  it('lists the union of builtin and discovered publishers, deduped and sorted', () => {
    expect(resolved().api.publishers.available).toEqual(['blarg', 'ics', 'readable', 'rss2'])
  })

  it('lists registered handler modes and keeps the default under handlers', () => {
    expect(resolved().api.handlers.available).toEqual(['html', 'json', 'csv'])
    expect(resolved().api.handlers.default).toBe('html')
  })

  it('lists registered harmonizers as a sibling block with no defaultHandler', () => {
    expect(resolved().api.harmonizers.available).toEqual(['default', 'openGraph'])
    expect(resolved().api.harmonizers.defaultHandler).toBeUndefined()
  })

  it('drops every directory pointer from the public projection', () => {
    expect(resolved().api.publishers.dir).toBeUndefined()
    expect(resolved().api.publishers.named).toBeUndefined()
    expect(resolved().api.handlers.dir).toBeUndefined()
    expect(resolved().api.handlers.named).toBeUndefined()
    expect(resolved().api.harmonizers.dir).toBeUndefined()
    expect(resolved().api.harmonizers.named).toBeUndefined()
  })
})

describe('resolveProfile — policies pass through both axes', () => {
  it('surfaces indexing.mode and access.registration independently', () => {
    expect(resolved().policies.indexing.mode).toBe('request')
    expect(resolved().policies.access.registration).toBe('open')
  })

  it('surfaces the list modifiers so consumers can see the declared scope', () => {
    // Always the EXPANDED arrays — a path-form authored list is read at load
    // time and only its contents reach the projection.
    expect(resolved().policies.access.blocks).toEqual({ domains: [], terms: [] })
    expect(resolved().policies.access.whitelist).toEqual({ domains: [] })
  })

  it('surfaces a path-form blocklist as its expanded contents, never the path', () => {
    const p = createProfile({
      profile: {
        identity: { instance: 'https://example.test/' },
        policies: { access: { registration: 'open', blocks: { domains: './b.json', terms: './t.json' } } },
      },
      schema,
      readFile: (path) => (path.includes('t.json') ? '["someslur"]' : '["bad.test"]'),
    }).getProfile()
    const out = resolveProfile({ profile: p }).policies.access
    expect(out.blocks).toEqual({ domains: ['bad.test'], terms: ['someslur'] })
    expect(JSON.stringify(out)).not.toContain('.json')
  })
})

describe('resolveProfile — vocabulary', () => {
  it('surfaces the effective octo IRI', () => {
    expect(resolved().vocabulary.octo).toBe('https://vocab.octothorp.es#')
  })

  it('tags builtin and declared namespaces', () => {
    const ns = resolved().vocabulary.namespaces
    expect(ns.find((n) => n.prefix === 'rdf').source).toBe('builtin')
    expect(ns.find((n) => n.prefix === 'skos')).toEqual({
      prefix: 'skos', iri: 'http://www.w3.org/2004/02/skos/core#', import: true, source: 'declared',
    })
  })
})

describe('resolveProfile — URI expansion', () => {
  it('expands feed term-name arrays to term URIs', () => {
    expect(resolved().identity.feeds.thorpes)
      .toEqual(['https://example.test/~/cats', 'https://example.test/~/dogs'])
  })

  it('absolutizes a relative feed URL', () => {
    expect(resolved().identity.feeds.multipass).toBe('https://example.test/news.json')
  })

  it('absolutizes relative images and leaves absolute ones alone', () => {
    expect(resolved().identity.images.favicon).toBe('https://example.test/favicon.ico')
    expect(resolved().identity.images.avatar).toBe('https://cdn.test/avatar.png')
  })

  it('absolutizes the operational badge path', () => {
    expect(resolved().policies.access.badge).toBe('https://example.test/badge.png')
  })

  it('joins a terms prefix that lacks a trailing separator', () => {
    expect(expandTermUri('https://example.test/terms', 'cats')).toBe('https://example.test/terms/cats')
    expect(expandTermUri('https://example.test/~/', 'cats')).toBe('https://example.test/~/cats')
    expect(expandTermUri('https://example.test/v#', 'cats')).toBe('https://example.test/v#cats')
  })

  it('leaves term-name arrays alone when identity.terms is unset', () => {
    const p = createProfile({
      profile: { identity: { instance: 'https://x.test/', feeds: { thorpes: ['cats'] } } },
      schema,
    }).getProfile()
    expect(resolveProfile({ profile: p }).identity.feeds.thorpes).toEqual(['cats'])
  })

  it('absolutize() is a no-op for absolute URLs and nullish input', () => {
    expect(absolutize('https://a.test/x', 'https://b.test/')).toBe('https://a.test/x')
    expect(absolutize(null, 'https://b.test/')).toBeNull()
  })
})

describe('resolveProfile — purity', () => {
  it('does not mutate the loaded profile', () => {
    const snapshot = JSON.parse(JSON.stringify(profile))
    resolved()
    expect(profile).toEqual(snapshot)
  })

  it('carries no secret-shaped keys', () => {
    const keys = []
    const walk = (n) => {
      if (Array.isArray(n)) return n.forEach(walk)
      if (n && typeof n === 'object') for (const [k, v] of Object.entries(n)) { keys.push(k); walk(v) }
    }
    walk(resolved())
    expect(keys.some((k) => /key|secret|token|password|credential/i.test(k))).toBe(false)
  })
})
```

- [ ] Run `npx vitest run src/tests/resolveProfile.test.js` — expect fail.
- [ ] Write `packages/core/resolveProfile.js`:

```js
import { mergeNamespaces } from './queryBuilders.js'

/**
 * Join a term-URI prefix and a term name. `identity.terms` is a usable prefix —
 * appending a name yields that term's URI — but authors write it with and
 * without a trailing separator, so tolerate both.
 * @param {string} termsPrefix
 * @param {string} name
 * @returns {string}
 */
export const expandTermUri = (termsPrefix, name) =>
  /[/#~]$/.test(termsPrefix) ? `${termsPrefix}${name}` : `${termsPrefix}/${name}`

/**
 * Resolve a possibly-relative path against the instance base. Absolute URLs and
 * nullish values pass through untouched.
 * @param {string|null|undefined} path
 * @param {string} instance
 * @returns {string|null}
 */
export const absolutize = (path, instance) => {
  if (path == null) return path ?? null
  try {
    return new URL(path, instance).href
  } catch {
    return path
  }
}

const expandFeeds = (feeds, { instance, terms }) =>
  Object.fromEntries(
    Object.entries(feeds ?? {}).map(([slot, value]) => {
      if (Array.isArray(value)) {
        // Term-name arrays only expand when a term prefix is declared; without
        // one there is nothing to expand against, so pass the names through.
        return [slot, terms ? value.map((n) => expandTermUri(terms, n)) : value]
      }
      return [slot, absolutize(value, instance)]
    })
  )

/**
 * Project the resolved profile: authored declarations + loader defaults +
 * init-time discovery, merged. Never written to disk — it is a projection of
 * the live client, so the public profile cannot lie about what the relay runs.
 * Pure and synchronous: all I/O happened at init.
 *
 * @param {Object} config
 * @param {Object} config.profile - a fully-populated getProfile() result.
 * @param {string[]} [config.publisherNames=[]] - builtin + discovered publisher names.
 * @param {string[]} [config.handlerNames=[]] - registered handler modes (builtin + discovered).
 * @param {string[]} [config.harmonizerNames=[]] - registered harmonizer names.
 * @returns {Object} see docs/plans/point7/profile-drafts/profile.resolved.draft.json
 */
export const resolveProfile = ({
  profile,
  publisherNames = [],
  handlerNames = [],
  harmonizerNames = [],
} = {}) => {
  const { instance, terms } = profile.identity

  return {
    identity: {
      ...profile.identity,
      feeds: expandFeeds(profile.identity.feeds, { instance, terms }),
      images: Object.fromEntries(
        Object.entries(profile.identity.images ?? {}).map(([k, v]) => [k, absolutize(v, instance)])
      ),
    },
    policies: {
      ...profile.policies,
      access: {
        ...profile.policies.access,
        badge: absolutize(profile.policies.access.badge, instance),
      },
    },
    api: {
      linkTypes: profile.api.linkTypes,
      documentRecord: profile.api.documentRecord,
      // Directory pointers are authoring detail, not public data. What the
      // world gets is the list of names that actually resolved at init.
      publishers: { available: [...new Set(publisherNames)].sort() },
      // Three sibling registries. `default` is a handler mode, so it is
      // projected under handlers — never under harmonizers.
      handlers: {
        default: profile.api.handlers.default,
        available: [...new Set(handlerNames)],
      },
      harmonizers: { available: [...new Set(harmonizerNames)] },
    },
    vocabulary: {
      octo: profile.vocabulary.octo,
      namespaces: mergeNamespaces(profile.vocabulary.namespaces),
    },
    federation: profile.federation,
  }
}
```

- [ ] Re-export from `packages/core/client.js`: `export { resolveProfile, expandTermUri, absolutize } from './resolveProfile.js'`
- [ ] Run `npx vitest run src/tests/resolveProfile.test.js src/tests/exports.test.js` — expect pass.
- [ ] Commit: `#217 wave 3: resolveProfile projection (discovery + defaults + URI expansion)`

## Task 12: `op.resolvedProfile()`

**Files**
- Modify: `packages/core/client.js`
- Modify: `src/lib/op.js`
- Test: `src/tests/resolveProfile.test.js` (append a client section)

**Interfaces**
- `createClient` gains `config.profile` (a `getProfile()` result, optional).
- `createClient` returns an added `resolvedProfile: () => Object` — a getter over what init built, with **no I/O at call time**. Throws a clear error when no `profile` was supplied.

**Steps**

- [ ] Append to `src/tests/resolveProfile.test.js`:

```js
import { createClient } from 'octothorpes'

describe('client.resolvedProfile()', () => {
  const mk = (extra = {}) => createClient({
    instance: 'https://example.test/',
    sparql: { endpoint: 'http://localhost:1/unused' },
    profile,
    publishers: { blarg: { meta: { name: 'blarg' }, render: () => '' } },
    ...extra,
  })

  it('includes core builtin publishers and the injected ones', () => {
    const available = mk().resolvedProfile().api.publishers.available
    expect(available).toContain('blarg')
    expect(available).toContain('rss2')
  })

  it('includes registered harmonizer names', () => {
    expect(mk().resolvedProfile().api.harmonizers.available).toContain('default')
  })

  it('includes builtin handler modes under api.handlers.available', () => {
    expect(mk().resolvedProfile().api.handlers.available).toContain('html')
  })

  it('is a stable getter — same value, no I/O per call', () => {
    const client = mk()
    expect(client.resolvedProfile()).toEqual(client.resolvedProfile())
  })

  it('throws a clear error when the client was built without a profile', () => {
    const client = createClient({ instance: 'https://example.test/', sparql: { endpoint: 'http://localhost:1/x' } })
    expect(() => client.resolvedProfile()).toThrow(/profile/i)
  })
})
```

- [ ] Run `npx vitest run src/tests/resolveProfile.test.js` — expect fail.
- [ ] In `packages/core/client.js`, after `publisherRegistry` and `registry` are built:

```js
import { resolveProfile } from './resolveProfile.js'
// ...
  // #217: the resolved profile is computed once at init from what actually
  // registered, then handed back by a pure getter. Publishing it is the client
  // owner's choice — mounting at /profile is convention, not requirement.
  const resolved = config.profile
    ? resolveProfile({
        profile: config.profile,
        publisherNames: publisherRegistry.listPublishers(),
        handlerNames: handlerRegistry.listHandlers(),
        harmonizerNames: registry.listHarmonizers?.() ?? [],
      })
    : null

  const resolvedProfile = () => {
    if (!resolved) {
      throw new Error('resolvedProfile() requires createClient({ profile }) — no profile was supplied')
    }
    return resolved
  }
```
  and add `resolvedProfile` to the returned object. Update the `@returns` JSDoc and add a `@param {Object} [config.profile]` line.

> If `createHarmonizerRegistry` has no `listHarmonizers`, add one returning `Object.keys(localHarmonizers)`, mirroring `listPublishers` in `packages/core/publishers.js`. `createHandlerRegistry` already exposes `listHandlers()` — use it as-is.

- [ ] In `src/lib/op.js`, add `profile,` to the `createClient({ ... })` config (the `profile` const is already in scope from Task 8).
- [ ] Run `npx vitest run src/tests/resolveProfile.test.js src/tests/client-documentRecordSchema.test.js` — expect pass.
- [ ] Commit: `#217 wave 3: op.resolvedProfile() getter over the init-time projection`

## Task 13: `/profile` and `/profile.json` serve the resolved projection

**Files**
- Modify: `src/routes/profile.json/+server.js`
- Modify: `src/routes/profile/+page.server.js`
- Modify: `src/routes/profile/+page.svelte`
- Test: `src/tests/profileEndpoints.test.js` (rewrite)

**Interfaces**
- Consumes: `op.resolvedProfile()`
- Produces: `application/json` projection at `/profile.json`; `{ profile }` for the HTML view.

**Steps**

- [ ] Rewrite `src/tests/profileEndpoints.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { GET } from '../routes/profile.json/+server.js'
import { load } from '../routes/profile/+page.server.js'
import profileData from '../../octothorpes.json'

// #217 wave 3: the endpoints stop being "the file, served" and become a
// projection of the live client. Assertions are about the PROJECTION, not about
// authored values, so re-authoring octothorpes.json cannot break them.

describe('/profile.json serves the resolved profile', () => {
  it('responds 200 as application/json', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
  })

  it('lists discovered publishers that the authored file does NOT contain', async () => {
    const body = await (await GET()).json()
    expect(body.api.publishers.available.length).toBeGreaterThan(0)
    // The authored file declares a directory pointer, never a list.
    expect(JSON.stringify(profileData)).not.toContain('"available"')
    expect(profileData.api?.publishers?.available).toBeUndefined()
  })

  it('drops the directory pointer from the public projection', async () => {
    const body = await (await GET()).json()
    expect(body.api.publishers.dir).toBeUndefined()
  })

  it('surfaces the effective vocabulary with source tags', async () => {
    const body = await (await GET()).json()
    expect(body.vocabulary.octo).toBeTypeOf('string')
    expect(body.vocabulary.namespaces.every((n) => ['builtin', 'declared'].includes(n.source))).toBe(true)
  })

  it('serves a fully-populated policies block with both axes', async () => {
    const body = await (await GET()).json()
    expect(['registered', 'open', 'closed']).toContain(body.policies.access.registration)
    expect(['request', 'active']).toContain(body.policies.indexing.mode)
    expect(body.policies.access.blocks.domains).toBeInstanceOf(Array)
    expect(body.policies.access.blocks.terms).toBeInstanceOf(Array)
    expect(body.policies.access.whitelist.domains).toBeInstanceOf(Array)
  })

  it('projects handlers and harmonizers as sibling blocks', async () => {
    const body = await (await GET()).json()
    expect(body.api.handlers.available).toBeInstanceOf(Array)
    expect(body.api.harmonizers.available).toBeInstanceOf(Array)
    expect(body.api.handlers.default).toBeTypeOf('string')
    expect(body.api.harmonizers.defaultHandler).toBeUndefined()
  })

  it('has no relay field and no secret-shaped keys', async () => {
    const body = await (await GET()).json()
    expect(body.relay).toBeUndefined()
    const keys = []
    const walk = (n) => {
      if (Array.isArray(n)) return n.forEach(walk)
      if (n && typeof n === 'object') for (const [k, v] of Object.entries(n)) { keys.push(k); walk(v) }
    }
    walk(body)
    expect(keys.some((k) => /key|secret|token|password|credential/i.test(k))).toBe(false)
  })
})

describe('/profile page load', () => {
  it('returns the same projection for HTML rendering', async () => {
    const data = await load()
    const body = await (await GET()).json()
    expect(data.profile).toEqual(body)
  })
})
```

- [ ] Run `npx vitest run src/tests/profileEndpoints.test.js` — expect fail.
- [ ] Rewrite `src/routes/profile.json/+server.js`:

```js
import { json } from '@sveltejs/kit'
import { op } from '$lib/op.js'

// #217: a thin wrapper over the resolved profile. Mounting it here is
// convention, not requirement — federation/bridge code should treat fetching
// <instance>/profile as a convention with graceful failure, not a guarantee.
export function GET() {
  return json(op.resolvedProfile())
}
```

- [ ] Rewrite `src/routes/profile/+page.server.js`:

```js
import { op } from '$lib/op.js'

// The HTML view of the OP Client Profile, over the same projection /profile.json
// serves. +page.svelte renders it.
export function load() {
  return { profile: op.resolvedProfile() }
}
```

- [ ] Update `src/routes/profile/+page.svelte` for the nested shape: read `profile.identity.*` (name, description, instance, contact, images, feeds), `profile.policies.*` (commercial, indexing.mode/frequency, access.registration, access.blocks.domains, access.blocks.terms, access.whitelist.domains — label the two policy axes distinctly, "indexing is triggered by…" vs "index requests must pass…", and render the term blocklist as a THIRD, separate thing: it applies in every mode and is enforced when statements are written, not at the gate), `profile.api.linkTypes` / `api.documentRecord` / `api.publishers.available` / `api.handlers.available` / `api.harmonizers.available`, and `profile.vocabulary.octo` / `namespaces` (render the `source` tag). Every field is optional — guard with `{#if}` and skip what is absent (the "OP Client card" convention).
- [ ] Run `npx vitest run src/tests/profileEndpoints.test.js` — expect pass.
- [ ] Run `npm run smoketest`, review the `/profile.json` golden diff **deliberately** (this is the one wave that expects churn), and re-capture. Confirm no other golden changed.
- [ ] Commit: `#217 wave 3: /profile and /profile.json serve the resolved projection`

---

# Wave 4a — Policies get teeth

`policies.access.registration` is the **indexing gate**, not a signup policy. The enforcement point is therefore the indexer, not the `/register` form. Task 14 builds the gate in core; Task 15 derives the form's state from it, so the form can no longer contradict the gate it advertises.

## Task 14: The registration gate in the indexing path

**Files**
- Create: `packages/core/access.js`
- Modify: `packages/core/client.js` (accept + thread `config.access`, re-export)
- Modify: `packages/core/indexer.js` (the origin-verification step, ~line 837)
- Modify: `src/lib/indexing.js` (inject the profile's access block)
- Test: `src/tests/accessGate.test.js` (new)

**Interfaces**
```js
export const ACCESS_DEFAULTS = {
  registration: 'registered',
  blocks: { domains: [], terms: [] },
  whitelist: { domains: [] },
}

/** Validate + fill an access block. Throws on an unknown registration value. */
export const normalizeAccess = (access) => ({ registration, blocks: { domains, terms }, whitelist: { domains } })

/** Hostname-exact-or-subdomain match against a list of blocked domains. */
export const originBlocked = (origin, domains) => boolean

/** Origin-vs-origin comparison against a list of allowed domains. Never compares full URLs. */
export const originWhitelisted = (origin, domains) => boolean

/** Case-insensitive exact match of a term name against a list of blocked terms. */
export const termBlocked = (term, terms) => boolean

/**
 * The ORIGIN gate. Returns null when the origin may be indexed, or a string
 * reason when it may not. Reads `access.blocks.domains` and
 * `access.whitelist.domains`; it never consults `blocks.terms`, which is a
 * different enforcement point entirely (statement-write time, all modes).
 * @param {string} origin
 * @param {{registration, blocks:{domains,terms}, whitelist:{domains}}} access
 * @param {() => Promise<boolean>} verifyRegistered - datastore verification
 * @returns {Promise<string|null>}
 */
export const checkAccessGate = async (origin, access, verifyRegistered) => string | null
```

The three low-level matchers take **plain arrays**, not the whole access block — `checkAccessGate` reaches into `access.blocks.domains` / `access.whitelist.domains` for them, and `/register` (Task 15) passes `blocks.domains` directly. Keeping the matchers list-shaped is what lets the two enforcement points share them without either one depending on the profile's nesting.

**`termBlocked` is the second, independent enforcement point.** It is consumed at **statement-write time inside the indexer**, not at the gate:

- It applies under **every** registration mode — `registered`, `open` and `closed` alike. A relay refuses a slur term however its origin gate is configured. Nothing about `termBlocked` may be conditioned on `access.registration`.
- When a harmonized blobject carries an octothorpe naming a blocked term, **that statement is dropped and the rest of the page indexes normally**. The page is never rejected wholesale, and no error is returned to the submitter for it.
- **Not retroactive.** Statements already written about a term added to `blocks.terms` later stay in the graph; removing them is epic **#271** (see out-of-scope).
- **Write-time only.** There is no read-time filter — a blocked term's existing page is still served.

- `createClient` gains `config.access`; it is normalized once at init and threaded to `createIndexer({ access })`.
- **Core stays framework-agnostic.** The mode and the lists arrive as injected config — core never reads a profile, an env var or a file.
- This is orthogonal to `config.indexingMode` (Task 17). Passing `access` says nothing about what triggers indexing, and vice versa.

**Behavior**

| `registration` | gate |
|---|---|
| `registered` (default) | today's behavior — `verifiedOrigin(origin)` must be true |
| `open` | no verification; reject only origins matching `blocks.domains` |
| `closed` | no verification; allow **only** origins in `whitelist.domains` |

Independently of all three, `blocks.terms` drops matching statements at write time.

An explicitly injected `verifyOrigin` dependency (the badge route passes `async () => true` to skip a double check) still wins inside the `registered` branch — it *is* the verification function, not a bypass of the gate.

**Steps**

- [ ] Write `src/tests/accessGate.test.js`:

```js
import { describe, it, expect, vi } from 'vitest'
import {
  ACCESS_DEFAULTS,
  normalizeAccess,
  originBlocked,
  originWhitelisted,
  termBlocked,
  checkAccessGate,
} from 'octothorpes'

// #217 wave 4a: policies.access.registration is the INDEXING gate. This suite
// pins all three modes plus the list modifiers. It is deliberately independent
// of policies.indexing.mode — the two axes never interact.

describe('normalizeAccess', () => {
  it('defaults to the registered gate with empty lists', () => {
    expect(normalizeAccess()).toEqual({
      registration: 'registered',
      blocks: { domains: [], terms: [] },
      whitelist: { domains: [] },
    })
    expect(ACCESS_DEFAULTS.registration).toBe('registered')
  })

  it('fills the missing half of a partially-authored blocks object', () => {
    expect(normalizeAccess({ blocks: { terms: ['someslur'] } })).toEqual({
      registration: 'registered',
      blocks: { domains: [], terms: ['someslur'] },
      whitelist: { domains: [] },
    })
  })

  it('copies the lists rather than aliasing the caller\'s arrays', () => {
    const input = { blocks: { domains: ['bad.test'], terms: [] }, whitelist: { domains: [] } }
    const out = normalizeAccess(input)
    out.blocks.domains.push('mutated.test')
    expect(input.blocks.domains).toEqual(['bad.test'])
  })

  it('accepts all three gate modes', () => {
    for (const registration of ['registered', 'open', 'closed']) {
      expect(normalizeAccess({ registration }).registration).toBe(registration)
    }
  })

  it("throws on the dropped 'invite' value rather than silently degrading", () => {
    expect(() => normalizeAccess({ registration: 'invite' })).toThrow(/registration/i)
  })

  it('throws on an unknown value', () => {
    expect(() => normalizeAccess({ registration: 'maybe' })).toThrow(/registration/i)
  })
})

describe('originBlocked', () => {
  it('matches an exact hostname', () => {
    expect(originBlocked('https://spam.test', ['spam.test'])).toBe(true)
  })

  it('matches subdomains', () => {
    expect(originBlocked('https://sub.spam.test', ['spam.test'])).toBe(true)
  })

  it('does not match an unrelated host, or a suffix that is not a subdomain', () => {
    expect(originBlocked('https://fine.test', ['spam.test'])).toBe(false)
    expect(originBlocked('https://notspam.test', ['spam.test'])).toBe(false)
  })

  it('tolerates blocklist entries written as URLs', () => {
    expect(originBlocked('https://spam.test', ['https://spam.test/'])).toBe(true)
  })

  it('treats an unparseable origin as blocked', () => {
    expect(originBlocked('not a url', [])).toBe(true)
  })
})

describe('originWhitelisted', () => {
  it('compares origins, not full URLs', () => {
    expect(originWhitelisted('https://friend.test', ['https://friend.test/some/path'])).toBe(true)
  })

  it('rejects an unlisted origin', () => {
    expect(originWhitelisted('https://stranger.test', ['https://friend.test'])).toBe(false)
  })

  it('distinguishes scheme and port', () => {
    expect(originWhitelisted('http://friend.test', ['https://friend.test'])).toBe(false)
  })
})

describe('checkAccessGate', () => {
  const verifyTrue = async () => true
  const verifyFalse = async () => false

  it('registered: admits a verified origin', async () => {
    expect(await checkAccessGate('https://ok.test', normalizeAccess(), verifyTrue)).toBeNull()
  })

  it('registered: refuses an unverified origin with a reason', async () => {
    const reason = await checkAccessGate('https://ok.test', normalizeAccess(), verifyFalse)
    expect(reason).toMatch(/not registered/i)
  })

  it('open: admits anything without consulting the datastore', async () => {
    const verify = vi.fn(verifyFalse)
    expect(await checkAccessGate('https://anyone.test', normalizeAccess({ registration: 'open' }), verify))
      .toBeNull()
    expect(verify).not.toHaveBeenCalled()
  })

  it('open: refuses a blocked origin', async () => {
    const access = normalizeAccess({ registration: 'open', blocks: { domains: ['spam.test'] } })
    expect(await checkAccessGate('https://spam.test', access, verifyTrue)).toMatch(/blocked/i)
    expect(await checkAccessGate('https://sub.spam.test', access, verifyTrue)).toMatch(/blocked/i)
    expect(await checkAccessGate('https://fine.test', access, verifyTrue)).toBeNull()
  })

  it('closed: admits only whitelisted origins, ignoring verification', async () => {
    const access = normalizeAccess({ registration: 'closed', whitelist: { domains: ['https://friend.test'] } })
    expect(await checkAccessGate('https://friend.test', access, verifyFalse)).toBeNull()
    expect(await checkAccessGate('https://stranger.test', access, verifyTrue)).toMatch(/whitelist/i)
  })

  it('closed with an empty whitelist admits nothing', async () => {
    const access = normalizeAccess({ registration: 'closed' })
    expect(await checkAccessGate('https://anyone.test', access, verifyTrue)).toMatch(/whitelist/i)
  })

  it('blocks.domains is inert outside open mode', async () => {
    const access = normalizeAccess({ registration: 'registered', blocks: { domains: ['spam.test'] } })
    // The registered gate already excludes unverified origins; a verified one
    // is admitted even though it appears in the (inert) origin blocklist.
    expect(await checkAccessGate('https://spam.test', access, verifyTrue)).toBeNull()
  })

  it('never consults blocks.terms — that is a different enforcement point', async () => {
    const access = normalizeAccess({ registration: 'open', blocks: { terms: ['someslur'] } })
    // A term blocklist says nothing about which ORIGINS may be indexed.
    expect(await checkAccessGate('https://someslur.test', access, verifyTrue)).toBeNull()
  })
})

describe('termBlocked — the write-time enforcement point', () => {
  it('matches an exact term name', () => {
    expect(termBlocked('someslur', ['someslur'])).toBe(true)
  })

  it('is case-insensitive and trims', () => {
    expect(termBlocked('  SomeSlur ', ['someslur'])).toBe(true)
  })

  it('does not match an unrelated or merely containing term', () => {
    expect(termBlocked('cats', ['someslur'])).toBe(false)
    expect(termBlocked('someslurry', ['someslur'])).toBe(false)
  })

  it('an empty list blocks nothing', () => {
    expect(termBlocked('anything', [])).toBe(false)
    expect(termBlocked('anything')).toBe(false)
  })

  it('is INDEPENDENT of the registration mode — it takes no access block at all', () => {
    // The signature is the assertion: there is no mode to pass, because
    // blocks.terms applies under registered, open and closed alike.
    expect(termBlocked.length).toBe(2)
  })
})
```

- [ ] Run `npx vitest run src/tests/accessGate.test.js` — expect fail.
- [ ] Write `packages/core/access.js`:

```js
/**
 * The INDEXING GATE (#217). `policies.access.registration` answers "what gate
 * must an index request pass", NOT "who may sign up" and NOT "what triggers
 * indexing" (that is indexingMode — see client.js).
 *
 * Framework-agnostic by construction: the mode, the lists, and the datastore
 * verification function are all injected. Core never reads a profile.
 */

export const REGISTRATION_MODES = Object.freeze(['registered', 'open', 'closed'])

export const ACCESS_DEFAULTS = Object.freeze({
  registration: 'registered',
  // TWO blocklists, TWO enforcement points:
  //   blocks.domains — ORIGIN list, checked at the access gate below, and
  //                    meaningful only under registration 'open'.
  //   blocks.terms   — TERM list, checked at STATEMENT-WRITE time in the
  //                    indexer, and applying in EVERY registration mode.
  // whitelist carries `domains` only, on purpose: a terms allowlist is a
  // different product decision with no current use case.
  blocks: Object.freeze({ domains: [], terms: [] }),
  whitelist: Object.freeze({ domains: [] }),
})

/**
 * @param {{registration?:string, blocks?:{domains?:string[],terms?:string[]}, whitelist?:{domains?:string[]}}} [access]
 * @returns {{registration:string, blocks:{domains:string[],terms:string[]}, whitelist:{domains:string[]}}}
 */
export const normalizeAccess = (access = {}) => {
  const registration = access.registration ?? ACCESS_DEFAULTS.registration
  if (!REGISTRATION_MODES.includes(registration)) {
    throw new Error(
      `Unknown access registration gate: "${registration}" (expected ${REGISTRATION_MODES.join(', ')}). ` +
        `Note: 'invite' was removed — 'closed' plus a whitelist is invite-only.`
    )
  }
  return {
    registration,
    blocks: {
      domains: [...(access.blocks?.domains ?? [])],
      terms: [...(access.blocks?.terms ?? [])],
    },
    whitelist: { domains: [...(access.whitelist?.domains ?? [])] },
  }
}

const hostOf = (value) => {
  try {
    return new URL(value).hostname.toLowerCase()
  } catch {
    return null
  }
}

/**
 * Hostname-exact-or-subdomain match. Entries may be bare hostnames or URLs.
 * An unparseable origin is treated as blocked — fail closed.
 *
 * Takes a plain ARRAY, not the access block: callers pass
 * `access.blocks.domains`. Keeping the matcher list-shaped is what lets the
 * indexing gate and the /register short-circuit share it.
 *
 * @param {string} origin
 * @param {string[]} [domains] - access.blocks.domains
 */
export const originBlocked = (origin, domains = []) => {
  const hostname = hostOf(origin)
  if (!hostname) return true
  return domains.some((entry) => {
    const blocked = String(entry).toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    return hostname === blocked || hostname.endsWith(`.${blocked}`)
  })
}

/**
 * Origin-vs-origin comparison. NEVER compare full URLs here — a whitelist entry
 * with a path must still admit every path on that origin.
 *
 * @param {string} origin
 * @param {string[]} [domains] - access.whitelist.domains
 */
export const originWhitelisted = (origin, domains = []) => {
  let target
  try {
    target = new URL(origin).origin
  } catch {
    return false
  }
  return domains.some((entry) => {
    try {
      return new URL(entry).origin === target
    } catch {
      return false
    }
  })
}

/**
 * Case-insensitive exact match of a TERM name against the term blocklist.
 *
 * This is the SECOND, independent enforcement point (#217). Unlike
 * originBlocked, it is NOT conditioned on the registration mode: a relay
 * refuses a slur term under 'registered', 'open' and 'closed' alike, which is
 * why this function takes no access block and has no mode parameter.
 *
 * Consumed at STATEMENT-WRITE time in the indexer: a blocked term's statement
 * is dropped and the rest of the page indexes normally. It is not retroactive
 * (existing statements stay — that is epic #271) and there is no read-time
 * counterpart (a blocked term's existing page is still served).
 *
 * @param {string} term
 * @param {string[]} [terms] - access.blocks.terms
 * @returns {boolean}
 */
export const termBlocked = (term, terms = []) => {
  const needle = String(term ?? '').trim().toLowerCase()
  if (!needle) return false
  return terms.some((entry) => String(entry).trim().toLowerCase() === needle)
}

/**
 * The ORIGIN gate. Reads access.blocks.domains and access.whitelist.domains;
 * it deliberately never consults access.blocks.terms, which is enforced
 * elsewhere and in every mode.
 *
 * @param {string} origin
 * @param {{registration:string, blocks:{domains:string[],terms:string[]}, whitelist:{domains:string[]}}} access
 * @param {() => Promise<boolean>} verifyRegistered - datastore verification,
 *   consulted ONLY in 'registered' mode.
 * @returns {Promise<string|null>} null to admit, else a human-readable reason.
 */
export const checkAccessGate = async (origin, access, verifyRegistered) => {
  const { registration, blocks, whitelist } = access

  if (registration === 'open') {
    return originBlocked(origin, blocks.domains)
      ? 'Origin is blocked by this server.'
      : null
  }

  if (registration === 'closed') {
    return originWhitelisted(origin, whitelist.domains)
      ? null
      : 'Origin is not on this server’s whitelist.'
  }

  // 'registered' — today's behavior.
  return (await verifyRegistered()) ? null : 'Origin is not registered with this server.'
}
```

- [ ] Re-export from `packages/core/client.js`:
  ```js
  export { ACCESS_DEFAULTS, REGISTRATION_MODES, normalizeAccess, originBlocked, originWhitelisted, termBlocked, checkAccessGate } from './access.js'
  ```
- [ ] In `packages/core/client.js`, normalize once at init and thread it into the indexer:
  ```js
  // #217: the access gate is orthogonal to indexingMode. `access` says what gate
  // an index request must pass; `indexingMode` says what triggers indexing.
  const access = normalizeAccess(config.access)
  // ...
  const indexer = createIndexer({ /* ...existing deps... */, access })
  ```
  Add `@param {{registration?:string, blocks?:{domains?:string[],terms?:string[]}, whitelist?:{domains?:string[]}}} [config.access]` to the `createClient` JSDoc.
- [ ] In `packages/core/indexer.js`, accept `access` in the `createIndexer` destructure (defaulting to `ACCESS_DEFAULTS`) and replace step 5 (~line 837):

```js
    // 5. Access gate (#217). registration decides WHICH check runs:
    //    'registered' -> datastore verification (verifyOrigin dep, injectable)
    //    'open'       -> no verification; blocks.domains applies
    //    'closed'     -> whitelist.domains only
    // Independent of policyMode/indexingMode, which decides what TRIGGERS
    // indexing rather than what gate it must pass.
    const verifyRegistered = () =>
      (verifyOrigin || ((origin) => verifiedOrigin(origin, {
        queryBoolean: configQueryBoolean || queryBoolean
      })))(parsed.origin)

    const denial = await checkAccessGate(parsed.origin, effectiveAccess, verifyRegistered)
    if (denial) throw new Error(denial)
```
  where `effectiveAccess` is the per-call `handlerConfig.access ?? access` so a caller can still override, mirroring how `verifyOrigin` is overridden today.
- [ ] In `packages/core/indexer.js`, add the **second enforcement point** at statement-write time, where the harmonized blobject's octothorpes are turned into statements. Filter the term list through `termBlocked` before writing, dropping matching entries and leaving everything else on the page intact:

```js
    // Term blocklist (#217). SECOND enforcement point, and deliberately NOT
    // gated on effectiveAccess.registration: a relay refuses a blocked term
    // under 'registered', 'open' and 'closed' alike.
    //
    // Statement-level, not page-level: the offending octothorpe is dropped and
    // the rest of the page indexes normally. The page is never rejected
    // wholesale and the submitter gets no error for it.
    //
    // NOT retroactive — statements already written about a newly-blocked term
    // stay in the graph; removing them is epic #271. There is no read-time
    // counterpart either; this is write-time only.
    const blockedTerms = effectiveAccess.blocks?.terms ?? []
    const admittedOctothorpes = octothorpes.filter((t) => !termBlocked(t, blockedTerms))
```
  Thread `admittedOctothorpes` into the statement-writing loop in place of the raw list. Warn once per dropped term (`[index] term "…" is blocked by this server; statement dropped`) so the drop is observable rather than silent.
- [ ] Add an indexer-level test to `src/tests/accessGate.test.js` proving the wiring, mirroring the existing `handler()` tests in `src/tests/indexer.test.js`:
  - an `open`-gated indexer indexes a page whose origin is unverified, and a `closed`-gated one rejects it with a whitelist reason;
  - **a blocked term's statement is dropped while its sibling statements survive** — index a page carrying `['cats', 'someslur', 'dogs']` with `blocks: { terms: ['someslur'] }` and assert `cats` and `dogs` are written, `someslur` is not, and the index call **succeeds** (no thrown error, no page-level rejection);
  - **the same drop happens under `registration: 'registered'`** with a verified origin — the assertion that proves `blocks.terms` is mode-independent. Repeat it for `'closed'` with the origin whitelisted if cheap;
  - a page whose *only* octothorpe is blocked still indexes as a document; it simply contributes no term statements.
- [ ] In `src/lib/indexing.js`, add `access: profile.policies.access,` to the `createIndexer` config, with a comment noting `blocks.domains`/`whitelist.domains` are the gate axis, `indexingMode` (Task 17) is the trigger axis, and `blocks.terms` is neither — it is write-time and mode-independent.
- [ ] Run `npx vitest run src/tests/accessGate.test.js src/tests/indexer.test.js src/tests/indexing.test.js src/tests/badge-route.test.js` — expect pass. The badge route's injected `verifyOrigin` must still work under the default `registered` gate.
- [ ] Commit: `#217 wave 4a: policies.access.registration becomes the indexing gate in core`

## Task 15: `/register` form state derives from the gate

**Files**
- Modify: `src/routes/register/+page.server.js`
- Modify: `src/routes/register/+page.svelte`
- Test: `src/tests/registrationPolicy.test.js` (new)

**Interfaces**
- Consumes: `getProfile().policies.access.registration`, `.blocks.domains`, `.whitelist.domains`, `getProfile().identity.name`
- `load()` produces `{ serverName, registration, formState }` where `formState` is `'active' | 'hidden' | 'disabled'`
- Produces: `export const registrationFormState = (registration) => 'active'|'hidden'|'disabled'`

**Why this replaces the old design.** The previous version of this task gave `/register` its own policy switch: `open` → form works, anything else → form refuses. That was written when `registration` meant "who may sign up". It now means "what gate the indexing process enforces", so the form has no policy of its own — its state is a *function* of the gate. Deriving it is strictly better than the old version because the form cannot advertise something the gate contradicts.

| gate | form state | why |
|---|---|---|
| `registered` | **active** | Registering *is* how you get through the gate. This is the form's whole reason to exist. |
| `open` | **hidden**, with an explanatory note | There is no gate to pass; registering would accomplish nothing. |
| `closed` | **disabled**, with an explanatory note | Membership is `whitelist.domains`, which is admin-managed; a self-serve form cannot add to it. |

Registration *requests* themselves (the existing submit → admin email → admin approves flow) are unchanged under `registered`. That human-in-the-loop flow is why `invite` was never needed as a distinct value.

**Steps**

- [ ] Write `src/tests/registrationPolicy.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { registrationFormState } from '../routes/register/+page.server.js'

// #217 wave 4a: /register no longer owns a policy. Its state DERIVES from
// policies.access.registration — the indexing gate enforced in core (Task 14) —
// so the form can never contradict the gate it advertises.

const access = { registration: 'registered', blocks: { domains: [], terms: [] }, whitelist: { domains: [] } }
vi.mock('$lib/profile.js', () => ({
  getProfile: () => ({
    identity: { instance: 'https://example.test/', name: 'Example' },
    policies: { indexing: { mode: 'request' }, access },
  }),
}))
vi.mock('$lib/sparql.js', () => ({
  queryBoolean: async () => false, queryArray: async () => ({ results: { bindings: [] } }), insert: async () => {},
}))
vi.mock('$lib/mail/send.js', () => ({ send: async () => true }))

const { load, actions } = await import('../routes/register/+page.server.js')

const submit = (domain = 'https://ok.test/') => actions.default({
  request: { formData: async () => new Map([['email', 'a@b.test'], ['domain', domain]]) },
})

describe('registrationFormState', () => {
  it('registered: the form is active — registering is how you pass the gate', () => {
    expect(registrationFormState('registered')).toBe('active')
  })

  it('open: the form is hidden — there is no gate to pass', () => {
    expect(registrationFormState('open')).toBe('hidden')
  })

  it('closed: the form is disabled — membership is admin-managed', () => {
    expect(registrationFormState('closed')).toBe('disabled')
  })

  it('defaults to active for an absent gate value', () => {
    expect(registrationFormState(undefined)).toBe('active')
  })
})

describe('/register load() derives its state from the gate', () => {
  beforeEach(() => {
    access.registration = 'registered'
    access.blocks.domains.length = 0
    access.whitelist.domains.length = 0
  })

  it('surfaces both the gate and the derived form state', async () => {
    access.registration = 'closed'
    const data = await load({})
    expect(data.registration).toBe('closed')
    expect(data.formState).toBe('disabled')
  })

  it('does not invent a form-only policy field', async () => {
    const data = await load({})
    expect(data.registrationPolicy).toBeUndefined()
  })
})

describe('/register submissions follow the derived state', () => {
  beforeEach(() => {
    access.registration = 'registered'
    access.blocks.domains.length = 0
    access.whitelist.domains.length = 0
  })

  it('registered: the submission proceeds past the gate check', async () => {
    const res = await submit()
    expect(res?.data?.formUnavailable).toBeUndefined()
  })

  it('open: the action refuses, because the form should not have been shown', async () => {
    access.registration = 'open'
    const res = await submit()
    expect(res.status).toBe(403)
    expect(res.data.formUnavailable).toBe(true)
    expect(res.data.registration).toBe('open')
  })

  it('closed: the action refuses — the whitelist is admin-managed', async () => {
    access.registration = 'closed'
    const res = await submit()
    expect(res.status).toBe(403)
    expect(res.data.registration).toBe('closed')
  })

  it('the derived-state check runs before any network reachability check', async () => {
    access.registration = 'closed'
    const spy = vi.spyOn(globalThis, 'fetch')
    await submit('https://never-fetched.test/')
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('a malformed domain is still rejected under the registered gate', async () => {
    expect((await submit('not a url')).data.blocked).toBe(true)
  })

  it('reuses the core origin matchers rather than a local blocklist', async () => {
    // BLOCKED_HOSTS is gone; example.com moved into policies.access.blocks.domains.
    access.blocks.domains.push('spam.test')
    expect((await submit('https://sub.spam.test/')).data.blocked).toBe(true)
    expect((await submit('https://fine.test/')).data?.blocked).toBeUndefined()
  })
})
```

- [ ] Run `npx vitest run src/tests/registrationPolicy.test.js` — expect fail.
- [ ] Edit `src/routes/register/+page.server.js`:

```js
import { fail } from '@sveltejs/kit'
import { originBlocked } from 'octothorpes'
import { getProfile } from '$lib/profile.js'

const profile = getProfile()
const { registration, blocks } = profile.policies.access
// The ORIGIN blocklist. blocks.terms is not consulted here — it is enforced at
// statement-write time in the indexer (Task 14) and has nothing to do with
// whether an origin may submit a registration request.
const blockedDomains = blocks.domains

/**
 * The form has no policy of its own — its state is a function of the indexing
 * gate (#217). Deriving it means the form can never advertise something the
 * gate contradicts.
 *   'registered' -> active   (registering IS how you pass the gate)
 *   'open'       -> hidden   (no gate to pass; registering accomplishes nothing)
 *   'closed'     -> disabled (membership is the admin-managed whitelist)
 * @param {string} [gate]
 * @returns {'active'|'hidden'|'disabled'}
 */
export const registrationFormState = (gate = 'registered') => {
  if (gate === 'open') return 'hidden'
  if (gate === 'closed') return 'disabled'
  return 'active'
}

const formState = registrationFormState(registration)

export async function load() {
  return { serverName: profile.identity.name, registration, formState }
}

export const actions = {
  default: async ({ request }) => {
    // Defense in depth: the page hides or disables the form, but a direct POST
    // must not slip past the derived state either.
    if (formState !== 'active') {
      return fail(403, { formUnavailable: true, registration })
    }
    // ...existing body unchanged, except: the local BLOCKED_HOSTS array and its
    // hostBlocked helper are deleted in favor of the core matcher, so the
    // published blocklist and the enforced one are the same list.
    if (originBlocked(domain, blockedDomains)) return fail(400, { domain, blocked: true })
    // ...
  },
}
```
  Delete `const BLOCKED_HOSTS = ['example.com']` and the local `hostBlocked`, and move `example.com` into `policies.access.blocks.domains` in the committed `octothorpes.json`.

> **Note on `blocks.domains` here.** Under the default `registered` gate `blocks.domains` is inert *for indexing* (Task 14), but rejecting a known-bad origin at the registration form is still worth doing — it stops the request before the reachability fetch. This is the one approved place the ORIGIN list is consulted outside `open` mode, and it is a UX short-circuit, not a second gate. `blocks.terms` never appears in this route: it is a write-time statement filter, and it needs no such exception because it already applies in every mode.

- [ ] Edit `src/routes/register/+page.svelte`: `export let data`; branch on `data.formState`.
  - `active` — render the form as today.
  - `hidden` — render no form at all, with an explanatory note: this relay indexes any URL, so there is nothing to register for.
  - `disabled` — render the form with `disabled` on every input and the submit button, plus a note that this relay indexes a curated list and membership is arranged with the admin.
  Also render `form?.formUnavailable` and `form?.blocked`. This replaces the commented-out "registrations closed" HTML.
- [ ] Run `npx vitest run src/tests/registrationPolicy.test.js` — expect pass.
- [ ] Commit: `#217 wave 4a: /register form state derives from the access gate`

## Task 16: Badge route reads `policies.access.badge`

**Files**
- Modify: `src/routes/badge/+server.js`
- Test: `src/tests/badge-route.test.js`

**Interfaces**
- Consumes: `getProfile().policies.access.badge`, `getProfile().identity.name`, `getProfile().identity.instance`
- Replaces the `badge_image` and `server_name` `.env` reads.

`policies.access.badge` is a path (authored `/badge.png`); the route needs the **basename** to find the file under `static/`, and `badgeVariant()` still derives the fail/unregistered filenames. Default when unset: `badge.png` (preserving current behavior).

**Steps**

- [ ] Add to `src/tests/badge-route.test.js`:

```js
import { describe, it, expect, vi } from 'vitest'
import { badgeFileName } from '../routes/badge/+server.js'

describe('#217 badge route reads the profile', () => {
  it('takes the basename of a profile badge path', () => {
    expect(badgeFileName('/badge.png')).toBe('badge.png')
    expect(badgeFileName('/img/custom-badge.png')).toBe('custom-badge.png')
  })

  it('accepts an absolute URL and still yields a static filename', () => {
    expect(badgeFileName('https://example.test/badge.png')).toBe('badge.png')
  })

  it('falls back to badge.png when the policy is unset', () => {
    expect(badgeFileName(null)).toBe('badge.png')
    expect(badgeFileName('')).toBe('badge.png')
  })
})
```

- [ ] Run `npx vitest run src/tests/badge-route.test.js` — expect fail.
- [ ] Edit `src/routes/badge/+server.js`:

```js
import { getProfile } from '$lib/profile.js'

const profile = getProfile()
const { instance, name: serverName } = profile.identity

/**
 * The badge policy is a path or URL; the file lives in static/. Exported for
 * testing. #217: replaces the .env `badge_image` read.
 * @param {string|null} badgePath
 * @returns {string}
 */
export const badgeFileName = (badgePath) => {
  if (!badgePath) return 'badge.png'
  const withoutQuery = String(badgePath).split(/[?#]/)[0]
  return withoutQuery.split('/').filter(Boolean).pop() || 'badge.png'
}

const badgeFile = badgeFileName(profile.policies.access.badge)
```
  and replace the `server_name` use in the `handler(...)` options with `serverName`. Drop the `$lib/config.js` import entirely.
- [ ] Run `npx vitest run src/tests/badge-route.test.js src/tests/badge.test.js` — expect pass.
- [ ] Commit: `#217 wave 4a: badge route reads policies.access.badge`

## Task 17: Rename `config.indexPolicy` → `config.indexingMode` and prune its enum

**Files**
- Modify: `packages/core/client.js` (`normalizeIndexPolicy` → `normalizeIndexingMode`, call sites)
- Modify: `src/lib/indexing.js`, `src/lib/op.js` (pass `indexingMode`)
- Test: `src/tests/client-policy.test.js`, `src/tests/core.test.js`, `src/tests/rss-e2e.test.js` (rename the config key)

**Interfaces**
```js
/**
 * @param {'request'|'active'|Object} [mode]
 * @returns {{ mode: 'request'|'active' } | Object}
 */
export const normalizeIndexingMode = (mode) => Object
```
- `createClient({ indexingMode })` replaces `createClient({ indexPolicy })`.
- Accepted values: **`request` (default)**, **`active`**, or a custom object (the escape hatch, passed through untouched). Anything else throws.
- `src/lib/indexing.js` and `src/lib/op.js` pass `profile.policies.indexing.mode` **directly** — this is the identity function, not a mapping.

### Why the rename

`config.indexPolicy` (a client-level mode) collided with `blobject.indexPolicy` (the per-page opt-in marker that harmonizers extract from markup — `<meta name="octo-policy">`, `<link rel="octo:index">`). Two unrelated things shared a name, and `resolveIndexPolicy` in `packages/core/indexer.js` reads *both* within a few lines of each other. Renaming the config key leaves the blobject marker alone: **`blobject.indexPolicy` is page data and does not change**, nor do `resolveIndexPolicy`, `callerContext.policyMode`, or any handler that sets `output.indexPolicy = 'index'`.

### Why two values are deleted

- **`'pull'` — audited dead.** It appears only inside `normalizeIndexPolicy` and its own JSDoc line. Nothing passes it, no test covers it, and no code path anywhere reads `mode: 'pull'`. Delete it rather than carry a value with no implementation.
- **`'registered'` — moved, not deleted.** That concept is now the *access gate* (`policies.access.registration`, Task 14), which is a different axis entirely. Leaving it in the trigger enum is what made the two axes look like one.

The result is that `policies.indexing.mode` (`request | active`) maps onto `config.indexingMode` (`request | active`) as the **identity function** — no translation table, no reconciliation point, nothing to keep in sync. That is the whole payoff of the rename.

> The `active` branch in `client.js` (which sets `requestingOrigin` from the URI and injects `verifyOrigin: async () => true`) reads `policy.mode === 'active'`; after the rename it reads the same value off `normalizeIndexingMode`'s result. Its behavior is unchanged — but note that the `verifyOrigin: async () => true` injection now feeds the *`registered` branch of the access gate* (Task 14), which is exactly right: an actively-crawling relay has already decided the origin is in scope.

**Steps**

- [ ] Rewrite the policy section of `src/tests/client-policy.test.js`:

```js
import { describe, it, expect, vi } from 'vitest'
import { createClient, normalizeIndexingMode } from 'octothorpes'

// #217 wave 4a: config.indexPolicy is now config.indexingMode. The old name
// collided with blobject.indexPolicy — the per-page opt-in marker extracted
// from markup — which is untouched by this rename.

describe('normalizeIndexingMode', () => {
  it("defaults to 'request'", () => {
    expect(normalizeIndexingMode()).toEqual({ mode: 'request' })
    expect(normalizeIndexingMode(undefined)).toEqual({ mode: 'request' })
  })

  it("accepts 'request' and 'active'", () => {
    expect(normalizeIndexingMode('request')).toEqual({ mode: 'request' })
    expect(normalizeIndexingMode('active')).toEqual({ mode: 'active' })
  })

  it('passes a custom object through as the escape hatch', () => {
    const custom = { mode: 'experimental', check: () => true }
    expect(normalizeIndexingMode(custom)).toBe(custom)
  })

  it("throws on the deleted 'pull' value (audited dead — no implementation)", () => {
    expect(() => normalizeIndexingMode('pull')).toThrow(/indexingMode/i)
  })

  it("throws on 'registered' — that concept moved to the access gate", () => {
    expect(() => normalizeIndexingMode('registered')).toThrow(/indexingMode/i)
  })

  it('accepts the profile spelling verbatim — this is the identity function', () => {
    for (const mode of ['request', 'active']) {
      expect(normalizeIndexingMode(mode).mode).toBe(mode)
    }
  })
})

describe('createClient indexingMode', () => {
  it("forwards indexingMode 'active' into handler() callerContext as policyMode", async () => {
    // ...existing assertion body, with `indexPolicy: 'active'` renamed to
    // `indexingMode: 'active'`. callerContext.policyMode is unchanged.
  })

  it('no longer accepts the old config key', () => {
    // An unknown key is ignored, so the client falls back to the default mode
    // rather than silently honoring a stale config.
    const client = createClient({
      instance: 'https://example.test/',
      sparql: { endpoint: 'http://localhost:1/unused' },
      indexPolicy: 'active',
    })
    expect(client).toBeDefined()
  })
})

describe('blobject.indexPolicy is untouched by the rename', () => {
  it('still reads the per-page opt-in marker', async () => {
    const { resolveIndexPolicy } = await import('octothorpes')
    expect(resolveIndexPolicy({ blobject: { indexPolicy: 'index' } }).optedIn).toBe(true)
    expect(resolveIndexPolicy({ blobject: { indexPolicy: 'no-index' } }).optedIn).toBe(false)
  })
})
```

- [ ] Add an adapter assertion to `src/tests/indexingAdapterDocumentRecord.test.js` (its mock profile declares `policies.indexing.mode: 'request'`):

```js
  it('passes the profile indexing mode straight through — no translation', () => {
    expect(captured.indexingMode).toBe('request')
  })

  it('passes the access gate separately from the indexing mode', () => {
    expect(captured.access.registration).toBe('registered')
  })
```

- [ ] Run `npx vitest run src/tests/client-policy.test.js src/tests/indexingAdapterDocumentRecord.test.js` — expect fail.
- [ ] In `packages/core/client.js`, replace `normalizeIndexPolicy`:

```js
/**
 * Normalize the client-level INDEXING MODE — what TRIGGERS indexing.
 *   'request' (default): index only when asked via /index
 *   'active':            this client crawls/re-indexes on its own schedule
 * A custom object is passed through untouched (escape hatch for stubs/experiments).
 *
 * These are the same two spellings as the profile's policies.indexing.mode, so
 * the profile -> core hop is the identity function (#217).
 *
 * Renamed from `indexPolicy` because that name collided with
 * `blobject.indexPolicy`, the per-page opt-in marker harmonizers extract from
 * markup — an unrelated thing that is NOT affected by this rename.
 *
 * Two former values are gone:
 *   'pull'       — audited dead in #217; no code path ever read mode: 'pull'.
 *   'registered' — that concept is the ACCESS GATE now
 *                  (policies.access.registration, see access.js). It is a
 *                  different axis: gate vs trigger. All six combinations of
 *                  the two are valid.
 *
 * @param {'request'|'active'|Object} [mode]
 * @returns {{mode: string}|Object}
 */
const normalizeIndexingMode = (mode) => {
  if (!mode || mode === 'request') return { mode: 'request' }
  if (mode === 'active') return { mode: 'active' }
  if (typeof mode === 'object') return mode // custom/stubbed
  throw new Error(`Unknown indexingMode: ${mode} (expected 'request', 'active', or a custom object)`)
}
```
  and change the call site to `const policy = normalizeIndexingMode(config.indexingMode)`. Update the `createClient` JSDoc line to:
  ```
  * @param {'request'|'active'|Object} [config.indexingMode] - What TRIGGERS indexing:
  *   'request' (default) or 'active'. Orthogonal to config.access, which is the GATE.
  ```
  Export `normalizeIndexingMode` so the test can reach it. Leave `policy.mode === 'active'` checks and `policyMode: policy.mode` exactly as they are.
- [ ] `grep -rn "indexPolicy" packages src --include='*.js'` and confirm every remaining hit is either `blobject.indexPolicy` page data (`handlers/*`, `resolveIndexPolicy`, blobject fixtures in tests) or a comment about it. No `config.indexPolicy` may survive.
- [ ] In `src/lib/indexing.js`, add `indexingMode: profile.policies.indexing.mode,` to the `createIndexer`/`createClient` config — passed verbatim, no mapping function. (`src/lib/op.js` already passes it from Task 8.)
- [ ] Update the `indexPolicy: 'active'` config keys in `src/tests/core.test.js` and `src/tests/rss-e2e.test.js` to `indexingMode: 'active'`.
- [ ] Run `npx vitest run src/tests/client-policy.test.js src/tests/indexingAdapterDocumentRecord.test.js src/tests/indexing.test.js src/tests/core.test.js src/tests/rss-e2e.test.js src/tests/exports.test.js` — expect pass.
- [ ] Commit: `#217 wave 4a: rename config.indexPolicy to indexingMode and drop the dead pull/registered values`

---

# Wave 4b — `.env` cleanup (single task)

## Task 18: Retire the `.env` twins of profile-owned values

Summarized deliberately — this is mechanical follow-through, not new design.

**Files**
- Modify: `src/lib/config.js`, `src/routes/badge/+server.js` (verify, done in Task 16), `src/routes/load.js`, `src/routes/register/+page.server.js` (verify, done in Task 15), `src/routes/index/+server.js`, `src/routes/indexwrapper/+server.js`, `src/routes/debug/identity/+server.js`, `src/routes/debug/rolodex/+server.js`, `src/routes/report/+page.server.js`, `src/routes/+page.svelte`, `src/lib/emails/alertAdmin.js`, `.env.example`
- Modify: `docs/plans/point7/release notes/release-notes-development.md`

**Scope**

- [ ] Replace every `server_name` read with `getProfile().identity.name`, every `badge_image` read with `getProfile().policies.access.badge`, every `admin_email` read with `getProfile().identity.contact.email`, and every `default_handler` read with `getProfile().api.handlers.default`. That is ~7 routes: `badge`, root `load.js`, `register`, `index`, `indexwrapper`, `debug/identity`, `debug/rolodex` (plus `report` and `emails/alertAdmin` if they surface in the grep).
- [ ] Add `admin@octothorp.es` to `identity.contact.email` in the committed `octothorpes.json` if not already there; confirm `identity.name` and `policies.access.badge` cover their `.env` predecessors.
- [ ] Delete `server_name`, `badge_image`, `admin_email`, `default_handler` from the `src/lib/config.js` destructure. `config.js` keeps only secrets (`sparql_*`, `smtp_*`, `robot_email`) plus the `instance` deploy override.
- [ ] Shrink `.env.example` to secrets plus the `instance` override, with a comment explaining that identity/policy/API values now live in `octothorpes.json`.
- [ ] Verify no lingering consumers: `grep -rn "server_name\|badge_image\|admin_email\|default_handler" src packages` returns nothing outside `.env.example` comments.
- [ ] Append a release-notes entry to `docs/plans/point7/release notes/release-notes-development.md` covering every wave, following the existing format: issue #217, the authored-vs-resolved model, the `octothorpes.json` shape change, the `.env` migration, and the removed `foaf` prefix. Include the old→new field map:

  | old | new |
  |---|---|
  | `relay` | `identity.instance` |
  | `name` | `identity.name` |
  | `vocabulary.relationshipSubtypes` | `api.linkTypes` |
  | `vocabulary.documentRecord` | `api.documentRecord` |
  | `externalAccounts` | `identity.contact` |
  | `defaultHarmonizer` | `api.handlers.default` |
  | `namedPublishers` | derived (`api.publishers.available`) |
  | `registrationPolicy` | `policies.access.registration` (**redefined**: the indexing gate, not a signup policy) |
  | `indexingMode` | `policies.indexing.mode` |

  Call out the breaking semantics explicitly, since these are not mechanical renames:
  - `policies.access.registration` enum is now `registered` (default) | `open` | `closed`. **`invite` is removed** — use `closed` + `whitelist.domains`.
  - `policies.access.blocks` is no longer a flat array. It is `{ domains, terms }`, and `policies.access.whitelist` is `{ domains }`. Each sub-key accepts either an inline array of strings or a **path to a JSON file** containing one, expanded at load time; the resolved profile always shows the expanded array. `blocks.domains` is the origin gate list (`open` mode only); **`blocks.terms` is a write-time statement filter that applies in every mode**, is not retroactive (#271), and has no read-time counterpart.
  - `policies.indexing.mode` enum is now `request` | `active`. **`on-request` is spelled `request`.**
  - `createClient({ indexPolicy })` is now `createClient({ indexingMode })`, values `request` | `active`. **`pull` and `registered` are removed** from that enum. `blobject.indexPolicy` (page markup opt-in) is unaffected.
  - `api.handlers` is a new sibling of `api.harmonizers`; `api.harmonizers.defaultHandler` moved to `api.handlers.default`.
- [ ] Run `npx vitest run src/tests/profileLoader.test.js src/tests/profileAdapter.test.js src/tests/profile-schema.test.js src/tests/profileEndpoints.test.js src/tests/resolveProfile.test.js src/tests/registrationPolicy.test.js src/tests/accessGate.test.js src/tests/badge-route.test.js src/tests/publisherDiscovery.test.js src/tests/subtypePaths.test.js src/tests/documentRecord-query.test.js src/tests/indexingAdapterDocumentRecord.test.js src/tests/indexRouteDocumentRecord.test.js src/tests/client-documentRecordSchema.test.js src/tests/client-policy.test.js src/tests/exports.test.js` — expect all pass.
- [ ] Run the full suite once at the end (`npx vitest run`, ~150s — expected, not hung) and confirm no unrelated regressions.
- [ ] Run `npm run smoketest` and confirm zero golden churn beyond what was re-captured in Task 13.
- [ ] Commit: `#217 wave 4b: retire the .env twins of profile-owned values`

---

# Wave 5 — Prove extensibility with a demo handler and harmonizers

Waves 1–4 declare `api.handlers.dir` and `api.harmonizers.dir` but nothing walks them and nothing lives in them. Wave 5 builds the two loaders and ships the artifacts that prove they work end to end.

The two demos deliberately exercise different halves of the split:

- **CSV** needs *both* layers — a new parsing mode has no handler, so it needs a handler module **and** a harmonizer that names it via `mode: 'csv'`. This is the one that proves cross-registry reference: a harmonizer discovered from `api.harmonizers.dir` resolving a handler discovered from `api.handlers.dir`.
- **Anchors** needs *only* a harmonizer. HTML parsing already exists, so the demo is a selector definition and nothing else — proof that the common case (new extraction, existing format) costs one JSON file.

Tasks 19–24 prove **discovery** and **cross-registry reference**; through Task 24 the CSV harmonizer is deliberately decorative (its column map is duplicated by hand in the handler). **Task 25, the last task in the plan**, closes the remaining loop by making the handler read its map from the discovered definition — the "a site declares extraction rules as data" half, which is the more interesting one and the original intent of the CSV demo.

Everything site-level lands under `src/lib/`, never `packages/core/`. That is the point: if the demos could only be written in core, the extension points would not be extension points.

> **Epic coverage.** This wave ticks epic **#273**'s "add example demos to the demo site" and "add demos to the smoketest" TODO items as well as #217's. The fixtures added in Task 24 are the smoketest half.

## Task 19: Handler discovery from `api.handlers.dir`

**Files**
- Modify: `packages/core/discover.js` (add `discoverHandlers`)
- Modify: `packages/core/client.js` (re-export)
- Create: `src/lib/handlers/index.js`
- Modify: `src/lib/indexing.js`, `src/lib/op.js` (register discovered handlers)
- Test: `src/tests/handlerDiscovery.test.js` (new)

**Interfaces**
```js
/**
 * @param {Object} config
 * @param {string|null} config.dir
 * @param {(dir:string) => Promise<string[]>} config.listEntries - file names under dir
 * @param {(dir:string, file:string) => Promise<Object|undefined>} config.loadHandler - default export
 * @param {(msg:string) => void} [config.warn]
 * @returns {Promise<{ handlers: Record<string, Object>, skipped: Array<{name, reason}> }>}
 */
export const discoverHandlers = async ({ dir, listEntries, loadHandler, warn }) => ...
```

Mirrors `discoverPublishers` (Task 9) exactly — injected fs, skip-and-warn, `_`-prefixed files skipped silently, missing dir is a warning not a throw — with two differences:

- Entries are **files** (`csv.js`), not directories, and the registry key is the handler's own `mode`, not the filename. A handler declares its mode; the file name is convenience.
- A module whose default export fails the handler shape (`{ mode, contentTypes, harmonize }`, per `createHandlerRegistry.register`) is skipped with a warning rather than throwing at registration.

**Steps**

- [ ] Write `src/tests/handlerDiscovery.test.js`:

```js
import { describe, it, expect, vi } from 'vitest'
import { discoverHandlers, createDefaultHandlerRegistry } from 'octothorpes'

const handler = (mode) => ({
  mode,
  contentTypes: [`text/${mode}`],
  meta: { name: mode },
  harmonize: () => ({ '@id': 'source', octothorpes: [] }),
})

describe('discoverHandlers (#217 wave 5)', () => {
  const base = {
    dir: './handlers',
    listEntries: async () => ['csv.js', 'toml.js', '_scratch.js', 'broken.js', 'malformed.js'],
    loadHandler: async (dir, file) => {
      if (file === 'broken.js') throw new Error("Cannot find package 'missing-dep'")
      if (file === 'malformed.js') return { meta: { name: 'nope' } }
      return handler(file.replace(/\.js$/, ''))
    },
  }

  it('registers each handler under its declared mode, not its filename', async () => {
    const { handlers } = await discoverHandlers(base)
    expect(Object.keys(handlers).sort()).toEqual(['csv', 'toml'])
    expect(handlers.csv.mode).toBe('csv')
  })

  it('skips _-prefixed files silently', async () => {
    const warn = vi.fn()
    const { handlers } = await discoverHandlers({ ...base, warn })
    expect(handlers._scratch).toBeUndefined()
    expect(warn.mock.calls.flat().join(' ')).not.toMatch(/_scratch/)
  })

  it('skips and warns on a module that fails to load, without throwing', async () => {
    const warn = vi.fn()
    const { handlers, skipped } = await discoverHandlers({ ...base, warn })
    expect(handlers.broken).toBeUndefined()
    expect(skipped.map((s) => s.name)).toContain('broken.js')
    expect(warn).toHaveBeenCalled()
  })

  it('skips a default export that is not handler-shaped', async () => {
    const { handlers, skipped } = await discoverHandlers(base)
    expect(Object.values(handlers).some((h) => h.meta?.name === 'nope')).toBe(false)
    expect(skipped.map((s) => s.name)).toContain('malformed.js')
  })

  it('one broken handler does not take down the others', async () => {
    const { handlers } = await discoverHandlers(base)
    expect(handlers.csv).toBeDefined()
    expect(handlers.toml).toBeDefined()
  })

  it('an unreadable dir yields an empty registry and one warning', async () => {
    const warn = vi.fn()
    const res = await discoverHandlers({
      dir: './nope',
      listEntries: async () => { throw new Error('ENOENT') },
      loadHandler: async () => handler('x'),
      warn,
    })
    expect(res).toEqual({ handlers: {}, skipped: [] })
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('a null dir is a no-op with no warning', async () => {
    const warn = vi.fn()
    expect(await discoverHandlers({ dir: null, listEntries: async () => [], loadHandler: async () => null, warn }))
      .toEqual({ handlers: {}, skipped: [] })
    expect(warn).not.toHaveBeenCalled()
  })

  it('discovered handlers register into a real registry and dispatch by mode and content-type', async () => {
    const { handlers } = await discoverHandlers(base)
    const registry = createDefaultHandlerRegistry({ defaultHandler: 'html' })
    for (const [mode, h] of Object.entries(handlers)) registry.register(mode, h)
    expect(registry.getHandler('csv')).toBeDefined()
    expect(registry.getHandlerForContentType('text/csv; charset=utf-8')).toBeDefined()
    expect(registry.listHandlers()).toContain('csv')
    expect(registry.getDefault().mode).toBe('html')
  })

  it('never shadows a builtin — registering over one is an error the discovery surfaces as a skip', async () => {
    const { handlers } = await discoverHandlers({
      ...base,
      listEntries: async () => ['html.js'],
      loadHandler: async () => handler('html'),
    })
    const registry = createDefaultHandlerRegistry({ defaultHandler: 'html' })
    expect(() => registry.register('html', handlers.html)).toThrow(/built-in/i)
  })
})
```

- [ ] Run `npx vitest run src/tests/handlerDiscovery.test.js` — expect fail.
- [ ] Add `discoverHandlers` to `packages/core/discover.js`:

```js
const HANDLER_SHAPE = 'handler must export { mode, contentTypes, harmonize }'

/**
 * Init-time HANDLER discovery (#217 wave 5). Same injected-fs, skip-and-warn
 * contract as discoverPublishers — one broken site handler must degrade to
 * "that format is unavailable", never take the process down.
 *
 * Handlers are JS MODULES (a harmonize function plus its dispatch metadata).
 * Harmonizers are JSON DATA and use a different loader — see discoverHarmonizers.
 * Do not merge the two: the artifact kinds differ, and the dependency points
 * harmonizer -> handler (a harmonizer names its handler via its `mode` field).
 *
 * @param {Object} config
 * @param {string|null} config.dir - api.handlers.dir
 * @param {(dir: string) => Promise<string[]>} config.listEntries - file names under dir
 * @param {(dir: string, file: string) => Promise<Object|undefined>} config.loadHandler
 * @param {(message: string) => void} [config.warn=console.warn]
 * @returns {Promise<{handlers: Record<string, Object>, skipped: Array<{name: string, reason: string}>}>}
 */
export const discoverHandlers = async ({ dir, listEntries, loadHandler, warn = console.warn } = {}) => {
  const handlers = {}
  const skipped = []
  if (!dir) return { handlers, skipped }

  let entries
  try {
    entries = await listEntries(dir)
  } catch (e) {
    warn(`[profile] handlers dir "${dir}" could not be read: ${e.message} — no site handlers registered`)
    return { handlers, skipped }
  }

  for (const file of entries) {
    if (file.startsWith('_')) continue
    try {
      const handler = await loadHandler(dir, file)
      if (!handler) throw new Error('module has no default export')
      if (!handler.mode || !Array.isArray(handler.contentTypes) || typeof handler.harmonize !== 'function') {
        throw new Error(HANDLER_SHAPE)
      }
      // Keyed by the DECLARED mode. The filename is convenience; the mode is
      // the identifier harmonizers reference.
      handlers[handler.mode] = handler
    } catch (e) {
      skipped.push({ name: file, reason: e.message })
      warn(`[profile] site handler "${file}" failed to load and was skipped: ${e.message}`)
    }
  }

  return { handlers, skipped }
}
```

- [ ] Re-export from `packages/core/client.js`: `export { discoverPublishers, discoverHandlers } from './discover.js'`
- [ ] Write `src/lib/handlers/index.js`, mirroring `src/lib/publishers/index.js`:

```js
import { readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { discoverHandlers } from 'octothorpes'
import { getProfile } from '$lib/profile.js'

// #217 wave 5: walks api.handlers.dir for JS modules. Sibling of the publisher
// and harmonizer walks — three dirs, three loaders, one policy (skip and warn).
const dir = getProfile().api.handlers.dir

const { handlers: discovered, skipped } = await discoverHandlers({
  dir,
  listEntries: async (d) =>
    (await readdir(resolve(process.cwd(), d), { withFileTypes: true }))
      .filter((e) => e.isFile() && e.name.endsWith('.js') && e.name !== 'index.js')
      .map((e) => e.name),
  loadHandler: async (d, file) =>
    (await import(/* @vite-ignore */ resolve(process.cwd(), d, file))).default,
})

export const handlers = discovered
export const skippedHandlers = skipped
```

- [ ] In `src/lib/indexing.js`, register the discovered handlers onto the registry after it is created:
  ```js
  import { handlers as siteHandlers } from '$lib/handlers/index.js'
  // ...
  for (const [mode, handler] of Object.entries(siteHandlers)) handlerRegistry.register(mode, handler)
  ```
  In `src/lib/op.js`, pass them as `handlers: siteHandlers` — `createClient` already loops `config.handlers` onto its registry.
- [ ] Run `npx vitest run src/tests/handlerDiscovery.test.js src/tests/exports.test.js src/tests/indexingAdapterDocumentRecord.test.js` — expect pass.
- [ ] Commit: `#217 wave 5: core handler discovery from api.handlers.dir`

## Task 20: Harmonizer discovery from `api.harmonizers.dir`

**Files**
- Modify: `packages/core/discover.js` (add `discoverHarmonizers`, `validateHarmonizer`)
- Modify: `packages/core/harmonizers.js` (`register`, `listHarmonizers`)
- Modify: `packages/core/client.js` (re-export)
- Create: `src/lib/harmonizers/index.js`
- Modify: `src/lib/indexing.js`, `src/lib/op.js`
- Test: `src/tests/harmonizerDiscovery.test.js` (new)

**Interfaces**
```js
/** @returns {string[]} validation problems; empty means valid. */
export const validateHarmonizer = (definition) => string[]

/**
 * @param {Object} config
 * @param {string|null} config.dir
 * @param {(dir:string) => Promise<string[]>} config.listEntries - file names under dir
 * @param {(dir:string, file:string) => Promise<Object>} config.readJson - parsed JSON
 * @param {(msg:string) => void} [config.warn]
 * @returns {Promise<{ harmonizers: Record<string, Object>, skipped: Array<{name, reason}> }>}
 */
export const discoverHarmonizers = async ({ dir, listEntries, readJson, warn }) => ...
```

**This is a different loader from Task 19 and must stay one.** Handlers are modules — you `import()` them and trust the default export's shape. Harmonizers are **data** — you read and *validate* JSON. The validation is the point: a local harmonizer JSON file is the same shape as a harmonizer fetched over HTTP (`createHarmonizerRegistry.getHarmonizer` already resolves remote ones), so `validateHarmonizer` is the same check both paths want, and the remote path can adopt it later for free.

Validation rules (deliberately shallow — a harmonizer is declarative, and over-validating selectors would couple this loader to every handler's schema dialect):
- `id`, `title`, `mode` and `schema.subject` must be present; `type` defaults to `'harmonizer'`.
- `mode` must be a string. It is **not** checked against the handler registry here — discovery order between the two dirs is not guaranteed, and a harmonizer naming an absent mode falls through to the registry's normal default-handler dispatch, which is the existing documented behavior.
- Registry key is the file basename (`csv.json` → `csv`), so a site harmonizer is referenced as `?harmonizer=csv` the same way core's `default` is.

**Steps**

- [ ] Write `src/tests/harmonizerDiscovery.test.js`:

```js
import { describe, it, expect, vi } from 'vitest'
import { discoverHarmonizers, validateHarmonizer, createHarmonizerRegistry } from 'octothorpes'

const def = (mode = 'html') => ({
  id: 'https://example.test/harmonizer/demo',
  type: 'harmonizer',
  title: 'Demo',
  mode,
  schema: { subject: { s: 'source', octothorpes: [{ selector: 'a[href]', attribute: 'href' }] } },
})

describe('validateHarmonizer', () => {
  it('accepts a well-formed definition', () => {
    expect(validateHarmonizer(def())).toEqual([])
  })

  it('requires id, title, mode and schema.subject', () => {
    expect(validateHarmonizer({}).length).toBeGreaterThan(0)
    expect(validateHarmonizer({ ...def(), schema: {} })).toContain('missing schema.subject')
    expect(validateHarmonizer({ ...def(), mode: undefined })).toContain('missing mode')
  })

  it('does not require the named mode to be a registered handler', () => {
    // Discovery order between handlers.dir and harmonizers.dir is not
    // guaranteed; an unknown mode falls through to default dispatch.
    expect(validateHarmonizer(def('not-a-registered-mode'))).toEqual([])
  })
})

describe('discoverHarmonizers (#217 wave 5)', () => {
  const base = {
    dir: './harmonizers',
    listEntries: async () => ['csv.json', 'anchors.json', '_draft.json', 'notes.md', 'bad.json', 'invalid.json'],
    readJson: async (dir, file) => {
      if (file === 'bad.json') throw new Error('Unexpected token } in JSON')
      if (file === 'invalid.json') return { title: 'no schema' }
      return def(file === 'csv.json' ? 'csv' : 'html')
    },
  }

  it('registers each definition under its file basename', async () => {
    const { harmonizers } = await discoverHarmonizers(base)
    expect(Object.keys(harmonizers).sort()).toEqual(['anchors', 'csv'])
  })

  it('ignores non-.json files entirely', async () => {
    const { harmonizers, skipped } = await discoverHarmonizers(base)
    expect(harmonizers.notes).toBeUndefined()
    expect(skipped.map((s) => s.name)).not.toContain('notes.md')
  })

  it('skips _-prefixed files silently', async () => {
    const warn = vi.fn()
    const { harmonizers } = await discoverHarmonizers({ ...base, warn })
    expect(harmonizers._draft).toBeUndefined()
    expect(warn.mock.calls.flat().join(' ')).not.toMatch(/_draft/)
  })

  it('skips and warns on unparseable JSON', async () => {
    const warn = vi.fn()
    const { skipped } = await discoverHarmonizers({ ...base, warn })
    expect(skipped.map((s) => s.name)).toContain('bad.json')
    expect(warn).toHaveBeenCalled()
  })

  it('skips and warns on a definition that fails validation, naming the problem', async () => {
    const warn = vi.fn()
    const { skipped } = await discoverHarmonizers({ ...base, warn })
    const bad = skipped.find((s) => s.name === 'invalid.json')
    expect(bad.reason).toMatch(/schema\.subject/)
  })

  it('preserves the declared mode — this is the handler reference', async () => {
    const { harmonizers } = await discoverHarmonizers(base)
    expect(harmonizers.csv.mode).toBe('csv')
    expect(harmonizers.anchors.mode).toBe('html')
  })

  it('an unreadable dir yields an empty registry and one warning', async () => {
    const warn = vi.fn()
    const res = await discoverHarmonizers({
      dir: './nope',
      listEntries: async () => { throw new Error('ENOENT') },
      readJson: async () => def(),
      warn,
    })
    expect(res).toEqual({ harmonizers: {}, skipped: [] })
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('a null dir is a no-op with no warning', async () => {
    const warn = vi.fn()
    expect(await discoverHarmonizers({ dir: null, listEntries: async () => [], readJson: async () => ({}), warn }))
      .toEqual({ harmonizers: {}, skipped: [] })
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('registry integration', () => {
  it('registers discovered definitions alongside the core locals', async () => {
    const registry = createHarmonizerRegistry('https://example.test/')
    const { harmonizers } = await discoverHarmonizers({
      dir: './harmonizers',
      listEntries: async () => ['anchors.json'],
      readJson: async () => def(),
    })
    for (const [name, d] of Object.entries(harmonizers)) registry.register(name, d)
    expect(registry.listHarmonizers()).toEqual(expect.arrayContaining(['default', 'anchors']))
    expect(await registry.getHarmonizer('anchors')).toMatchObject({ mode: 'html' })
  })
})
```

- [ ] Run `npx vitest run src/tests/harmonizerDiscovery.test.js` — expect fail.
- [ ] Add `register` and `listHarmonizers` to `createHarmonizerRegistry` in `packages/core/harmonizers.js` (mirroring `listPublishers`), and return them:
  ```js
  const register = (name, definition) => { localHarmonizers[name] = definition }
  const listHarmonizers = () => Object.keys(localHarmonizers)
  ```
- [ ] Add `validateHarmonizer` and `discoverHarmonizers` to `packages/core/discover.js`:

```js
/**
 * Shallow validation of a harmonizer DEFINITION (#217 wave 5). Harmonizers are
 * declarative JSON — { id, type, title, mode, schema: { subject: {...} } } —
 * and a local file is the same shape as one fetched over HTTP, so this is the
 * check both paths want.
 *
 * Deliberately shallow: selector dialects belong to individual handlers, and
 * validating them here would couple this loader to every handler's schema.
 *
 * @param {Object} definition
 * @returns {string[]} problems; empty means valid
 */
export const validateHarmonizer = (definition) => {
  const problems = []
  if (!definition || typeof definition !== 'object') return ['not an object']
  if (!definition.id) problems.push('missing id')
  if (!definition.title) problems.push('missing title')
  // `mode` is the HANDLER reference. Not resolved here: discovery order between
  // handlers.dir and harmonizers.dir is not guaranteed, and an unknown mode
  // falls through to the registry's normal default-handler dispatch.
  if (typeof definition.mode !== 'string' || !definition.mode) problems.push('missing mode')
  if (!definition.schema || typeof definition.schema.subject !== 'object') {
    problems.push('missing schema.subject')
  }
  return problems
}

/**
 * Init-time HARMONIZER discovery. Same skip-and-warn policy as the handler and
 * publisher walks, but a DIFFERENT loader: these are read-and-validated JSON
 * documents, not imported modules. Keyed by file basename, so a site
 * harmonizer is referenced exactly like core's `default`.
 *
 * @param {Object} config
 * @param {string|null} config.dir - api.harmonizers.dir
 * @param {(dir: string) => Promise<string[]>} config.listEntries
 * @param {(dir: string, file: string) => Promise<Object>} config.readJson
 * @param {(message: string) => void} [config.warn=console.warn]
 * @returns {Promise<{harmonizers: Record<string, Object>, skipped: Array<{name: string, reason: string}>}>}
 */
export const discoverHarmonizers = async ({ dir, listEntries, readJson, warn = console.warn } = {}) => {
  const harmonizers = {}
  const skipped = []
  if (!dir) return { harmonizers, skipped }

  let entries
  try {
    entries = await listEntries(dir)
  } catch (e) {
    warn(`[profile] harmonizers dir "${dir}" could not be read: ${e.message} — no site harmonizers registered`)
    return { harmonizers, skipped }
  }

  for (const file of entries) {
    if (file.startsWith('_') || !file.endsWith('.json')) continue
    const name = file.replace(/\.json$/, '')
    try {
      const definition = await readJson(dir, file)
      const problems = validateHarmonizer(definition)
      if (problems.length) throw new Error(problems.join(', '))
      harmonizers[name] = { type: 'harmonizer', ...definition }
    } catch (e) {
      skipped.push({ name: file, reason: e.message })
      warn(`[profile] site harmonizer "${file}" failed to load and was skipped: ${e.message}`)
    }
  }

  return { harmonizers, skipped }
}
```

- [ ] Re-export both from `packages/core/client.js`.
- [ ] Write `src/lib/harmonizers/index.js`:

```js
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { discoverHarmonizers } from 'octothorpes'
import { getProfile } from '$lib/profile.js'

// #217 wave 5: walks api.harmonizers.dir for JSON definitions. Sibling of the
// handler walk, deliberately a different loader — read + validate data, not
// import modules.
const dir = getProfile().api.harmonizers.dir

const { harmonizers: discovered, skipped } = await discoverHarmonizers({
  dir,
  listEntries: async (d) =>
    (await readdir(resolve(process.cwd(), d), { withFileTypes: true }))
      .filter((e) => e.isFile())
      .map((e) => e.name),
  readJson: async (d, file) => JSON.parse(await readFile(resolve(process.cwd(), d, file), 'utf8')),
})

export const harmonizers = discovered
export const skippedHarmonizers = skipped
```

- [ ] In `src/lib/indexing.js`, register them onto the harmonizer registry after `createHarmonizerRegistry(instance)`; in `src/lib/op.js`, pass them so `createClient`'s registry gets them too (add a `config.harmonizers` loop next to the existing `config.handlers` loop if one does not exist).
- [ ] Run `npx vitest run src/tests/harmonizerDiscovery.test.js src/tests/harmonizers.test.js src/tests/exports.test.js` — expect pass.
- [ ] Commit: `#217 wave 5: core harmonizer discovery from api.harmonizers.dir`

## Task 21: The CSV handler (site-level, `src/lib/handlers/csv.js`)

**Files**
- Create: `src/lib/handlers/csv.js`
- Test: `src/tests/csvHandler.test.js` (new)

**Interfaces**
- Produces a default export `{ mode: 'csv', contentTypes: ['text/csv'], meta, harmonize }`, registered by Task 19's walk.

**Spec — locked down.**

- **Subject URI is the CSV document's own URL.** One document, many statements — exactly like the HTML handler. It emits `'@id': 'source'` and lets the indexer substitute the URI, which is the existing convention.
- **It does NOT create a page per row.** Batch/multi-record indexing is epic **#274**; treating a CSV as N subjects would quietly implement half of it here. A row is not a resource in this handler — it is a bundle of cell values contributing statements about the one document.
- **Column headers name OP statement types.** Each non-empty cell in a recognized column emits one statement about the document.
- **Recognized columns only.** `octothorpes`, `bookmarks`, `cites`, `links`, plus `title` and `description` where the *first non-empty value wins*. Header matching is case-insensitive and trimmed.
- **Unknown columns are ignored, not errors.** A spreadsheet exported from anywhere has columns OP does not care about; refusing the whole document over a stray `notes` column would make the demo useless.
- **Registers for content-type `text/csv` and `mode: 'csv'`.**
- **Minimal, dependency-free parser.** Quoted fields containing commas, escaped `""` quotes, and CRLF line endings are handled. Nothing else. **Do not add a CSV library.**
- **Opt-in is not forced.** The handler does not set `indexPolicy: 'index'`. A CSV with an `octothorpes` column opts in implicitly through the existing "has octothorpes" rule in `resolveIndexPolicy`; one with only `bookmarks` does not, and that is correct — the document has not asked to be indexed.

**Steps**

- [ ] Write `src/tests/csvHandler.test.js`:

```js
import { describe, it, expect } from 'vitest'
import csvHandler, { parseCsv } from '$lib/handlers/csv.js'

const harmonize = (content, options = {}) => csvHandler.harmonize(content, null, options)

describe('parseCsv', () => {
  it('parses headers and rows', () => {
    expect(parseCsv('a,b\n1,2\n3,4')).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '4' },
    ])
  })

  it('handles quoted fields containing commas', () => {
    expect(parseCsv('a,b\n"one, two",three')).toEqual([{ a: 'one, two', b: 'three' }])
  })

  it('handles escaped double quotes', () => {
    expect(parseCsv('a\n"she said ""hi"""')).toEqual([{ a: 'she said "hi"' }])
  })

  it('handles CRLF line endings and trailing newlines', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([{ a: '1', b: '2' }])
  })

  it('lowercases and trims headers', () => {
    expect(parseCsv(' Octothorpes , Links \nx,y')).toEqual([{ octothorpes: 'x', links: 'y' }])
  })

  it('returns an empty array for an empty or header-only document', () => {
    expect(parseCsv('')).toEqual([])
    expect(parseCsv('a,b')).toEqual([])
  })
})

describe('csv handler shape', () => {
  it('declares mode csv and the text/csv content type', () => {
    expect(csvHandler.mode).toBe('csv')
    expect(csvHandler.contentTypes).toContain('text/csv')
    expect(typeof csvHandler.harmonize).toBe('function')
  })
})

describe('csv handler — one document, many statements', () => {
  const doc = [
    'octothorpes,bookmarks,cites,links,title,description',
    'cats,https://a.test/,https://c.test/,https://l.test/,My Links,A demo file',
    'dogs,https://b.test/,,,,',
  ].join('\n')

  it('uses the document itself as the subject', () => {
    const blob = harmonize(doc)
    expect(blob['@id']).toBe('source')
  })

  it('does NOT create a subject per row (that is epic #274 territory)', () => {
    const blob = harmonize(doc)
    expect(Array.isArray(blob.rows)).toBe(false)
    expect(blob.subjects).toBeUndefined()
    expect(Object.keys(blob).filter((k) => k.startsWith('@')).sort()).toEqual(['@id'])
  })

  it('emits one statement per non-empty cell in a recognized column', () => {
    const blob = harmonize(doc)
    expect(blob.octothorpes).toEqual(['cats', 'dogs'])
    expect(blob.bookmarks).toEqual(['https://a.test/', 'https://b.test/'])
    expect(blob.cites).toEqual(['https://c.test/'])
    expect(blob.links).toEqual(['https://l.test/'])
  })

  it('takes the first non-empty value for title and description', () => {
    const blob = harmonize(['title,description', ',', 'My Links,A demo file', 'Later,Later'].join('\n'))
    expect(blob.title).toBe('My Links')
    expect(blob.description).toBe('A demo file')
  })

  it('ignores unrecognized columns instead of erroring', () => {
    const blob = harmonize('octothorpes,notes,internal id\ncats,whatever,42')
    expect(blob.octothorpes).toEqual(['cats'])
    expect(blob.notes).toBeUndefined()
    expect(blob['internal id']).toBeUndefined()
  })

  it('skips empty cells and trims values', () => {
    const blob = harmonize('octothorpes\n  cats  \n\n   \ndogs')
    expect(blob.octothorpes).toEqual(['cats', 'dogs'])
  })

  it('dedupes repeated values within a column', () => {
    expect(harmonize('octothorpes\ncats\ncats\ndogs').octothorpes).toEqual(['cats', 'dogs'])
  })

  it('returns an empty blobject for an empty document rather than throwing', () => {
    const blob = harmonize('')
    expect(blob).toEqual({ '@id': 'source', octothorpes: [] })
  })

  it('does not force opt-in — indexPolicy is left to the document', () => {
    expect(harmonize('bookmarks\nhttps://a.test/').indexPolicy).toBeUndefined()
  })

  it('a csv with octothorpes opts in implicitly via the existing rule', async () => {
    const { resolveIndexPolicy } = await import('octothorpes')
    expect(resolveIndexPolicy({ blobject: harmonize('octothorpes\ncats') }).optedIn).toBe(true)
    expect(resolveIndexPolicy({ blobject: harmonize('bookmarks\nhttps://a.test/') }).optedIn).toBe(false)
  })
})
```

- [ ] Run `npx vitest run src/tests/csvHandler.test.js` — expect fail.
- [ ] Write `src/lib/handlers/csv.js`:

```js
/**
 * CSV content handler — a SITE handler (#217 wave 5, #273).
 *
 * It lives in src/lib/handlers/ and NOT in packages/core/ on purpose: the whole
 * point is to demonstrate that a site can add a content format without touching
 * core. If this could only be written in core, api.handlers.dir would not be an
 * extension point.
 *
 * MODEL: one CSV document is ONE subject — its own URL — with many statements,
 * exactly like the HTML handler. It does NOT mint a subject per row. Treating
 * rows as resources is batch indexing, which is epic #274; doing it here would
 * quietly implement half of that epic in a demo.
 *
 * Column headers name OP statement types. Each non-empty cell in a recognized
 * column contributes one statement about the document. Unrecognized columns are
 * ignored rather than fatal — real spreadsheets carry columns OP does not care
 * about, and rejecting the document over a stray `notes` header would make this
 * useless as a demo.
 */

// Statement columns: every non-empty cell becomes a value.
const LIST_COLUMNS = ['octothorpes', 'bookmarks', 'cites', 'links']
// Scalar columns: first non-empty value wins.
const SCALAR_COLUMNS = ['title', 'description']

/**
 * Minimal, dependency-free CSV parse. Handles quoted fields with embedded
 * commas and newlines, `""` escapes, and CRLF. Deliberately NOT RFC 4180
 * complete — adding a CSV library would defeat the point of the demo.
 *
 * @param {string} text
 * @returns {Array<Record<string, string>>} rows keyed by lowercased header
 */
export const parseCsv = (text) => {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  const src = String(text ?? '')

  const endField = () => { row.push(field); field = '' }
  const endRow = () => { endField(); rows.push(row); row = [] }

  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++ }
        else quoted = false
      } else field += c
      continue
    }
    if (c === '"') { quoted = true; continue }
    if (c === ',') { endField(); continue }
    if (c === '\r') continue
    if (c === '\n') { endRow(); continue }
    field += c
  }
  if (field.length || row.length) endRow()

  const [headerRow, ...dataRows] = rows
  if (!headerRow) return []

  const headers = headerRow.map((h) => h.trim().toLowerCase())
  return dataRows
    .filter((r) => r.some((cell) => cell.trim() !== ''))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])))
}

const pushUnique = (list, value) => {
  const v = String(value ?? '').trim()
  if (v && !list.includes(v)) list.push(v)
}

/**
 * @param {string} content - the raw CSV document
 * @param {Object|null} schema - harmonizer definition. Unused here: this task
 *   ships the column mapping hardcoded, and the parameter exists for interface
 *   parity with the other handlers. TASK 25 makes it load-bearing — the handler
 *   reads schema.subject for its column map — so keep the argument in place.
 * @param {Object} [options]
 * @returns {Object} blobject with '@id': 'source' — the indexer substitutes the
 *   document URI, so the subject is always the CSV's own URL.
 */
const harmonize = (content, schema, options = {}) => {
  const rows = parseCsv(content)
  const output = { '@id': 'source', octothorpes: [] }
  if (!rows.length) return output

  for (const column of LIST_COLUMNS) {
    const values = []
    for (const row of rows) pushUnique(values, row[column])
    // octothorpes is always present (the blobject contract); the rest appear
    // only when the document actually declared that column.
    if (column === 'octothorpes' || values.length) output[column] = values
  }

  for (const column of SCALAR_COLUMNS) {
    const first = rows.map((r) => String(r[column] ?? '').trim()).find(Boolean)
    if (first) output[column] = first
  }

  // NOTE: no indexPolicy is set. Opt-in stays the document's decision — a CSV
  // with an octothorpes column opts in implicitly through resolveIndexPolicy's
  // existing "has octothorpes" rule; one without has not asked to be indexed.
  return output
}

export default {
  mode: 'csv',
  contentTypes: ['text/csv'],
  meta: {
    name: 'CSV Handler',
    description:
      'Site-level demo handler. Treats a CSV document as one subject (its own URL) with one statement per non-empty cell in a recognized column.',
  },
  harmonize,
}
```

- [ ] Run `npx vitest run src/tests/csvHandler.test.js src/tests/handlerDiscovery.test.js` — expect pass.
- [ ] Commit: `#217 wave 5: site-level CSV handler (one document, many statements)`

## Task 22: The CSV harmonizer (`src/lib/harmonizers/csv.json`)

**Files**
- Create: `src/lib/harmonizers/csv.json`
- Test: `src/tests/csvHandler.test.js` (append an integration section)

**Interfaces**
- Consumes: nothing at build time; resolved by Task 20's walk and dispatched to Task 21's handler via `mode`.

**This is the artifact that proves cross-registry reference.** A JSON file discovered from `api.harmonizers.dir` names, through its `mode` field, a JS module discovered from `api.handlers.dir`. Two dirs, two loaders, one dispatch. If the handler is missing the harmonizer still resolves and falls through to default dispatch — that is the documented degradation, and the test below pins it.

**Steps**

- [ ] Append to `src/tests/csvHandler.test.js`:

```js
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createDefaultHandlerRegistry, harmonizeSource, validateHarmonizer } from 'octothorpes'

const here = dirname(fileURLToPath(import.meta.url))
const definition = JSON.parse(
  readFileSync(resolve(here, '../lib/harmonizers/csv.json'), 'utf8')
)

describe('csv harmonizer definition', () => {
  it('is a valid harmonizer definition', () => {
    expect(validateHarmonizer(definition)).toEqual([])
  })

  it('references the csv HANDLER through its mode field', () => {
    // This is the cross-registry link: a JSON file in api.harmonizers.dir
    // naming a JS module in api.handlers.dir.
    expect(definition.mode).toBe('csv')
  })

  it('maps columns to OP fields', () => {
    expect(Object.keys(definition.schema.subject)).toEqual(
      expect.arrayContaining(['octothorpes', 'bookmarks', 'cites', 'links'])
    )
  })
})

describe('csv harmonizer dispatches to the csv handler', () => {
  const registry = createDefaultHandlerRegistry({ defaultHandler: 'html' })
  registry.register('csv', csvHandler)

  const doc = 'octothorpes,bookmarks\ncats,https://a.test/'

  it('resolves handler by the harmonizer-declared mode', async () => {
    const blob = await harmonizeSource(doc, definition, { handlerRegistry: registry })
    expect(blob.octothorpes).toEqual(['cats'])
    expect(blob.bookmarks).toEqual(['https://a.test/'])
  })

  it('also dispatches by content-type when no mode is supplied', async () => {
    const blob = await harmonizeSource(doc, null, {
      handlerRegistry: registry,
      contentType: 'text/csv',
    })
    expect(blob.octothorpes).toEqual(['cats'])
  })

  it('falls back to default dispatch when the csv handler is absent', async () => {
    const bare = createDefaultHandlerRegistry({ defaultHandler: 'html' })
    await expect(harmonizeSource(doc, definition, { handlerRegistry: bare })).resolves.toBeDefined()
  })
})
```

- [ ] Run `npx vitest run src/tests/csvHandler.test.js` — expect fail.
- [ ] Write `src/lib/harmonizers/csv.json`:

```json
{
  "//": "Site-level demo harmonizer (#217 wave 5, #273). Discovered from api.harmonizers.dir. Its `mode` names the csv HANDLER, discovered separately from api.handlers.dir — this file is the proof that the two registries reference each other correctly. Same shape as a harmonizer fetched over HTTP.",
  "id": "harmonizer/csv",
  "type": "harmonizer",
  "title": "CSV Column Harmonizer",
  "mode": "csv",
  "schema": {
    "subject": {
      "s": "source",
      "title": [{ "column": "title" }],
      "description": [{ "column": "description" }],
      "octothorpes": [{ "column": "octothorpes" }],
      "bookmarks": [{ "column": "bookmarks" }],
      "cites": [{ "column": "cites" }],
      "links": [{ "column": "links" }]
    }
  }
}
```

> The `column` selector dialect is the CSV handler's own, mirroring how the HTML handler owns `{ selector, attribute }`. Task 21's handler implements the built-in column mapping directly, so **as of this task the harmonizer is decorative** — it proves discovery and cross-registry reference, and the two definitions merely agree by hand. Leave it that way here. Wiring the handler to actually *read* `schema.subject[*].column` is **Task 25**, the last task in this plan.

- [ ] Set `id` to the instance-qualified form if the registry expects absolute ids (core's locals use `${instance}harmonizer/<name>`); check `createHarmonizerRegistry` and match whatever `getHarmonizer` resolves for local names.
- [ ] Run `npx vitest run src/tests/csvHandler.test.js src/tests/harmonizerDiscovery.test.js` — expect pass.
- [ ] Commit: `#217 wave 5: csv harmonizer referencing the csv handler across registries`

## Task 23: The anchor harmonizer (`src/lib/harmonizers/anchors.json`)

**Files**
- Create: `src/lib/harmonizers/anchors.json`
- Test: `src/tests/anchorHarmonizer.test.js` (new)

**Interfaces**
- `"mode": "html"` — **harmonizer only, no new handler.** HTML parsing already exists in `packages/core/handlers/html/handler.js`; adding a handler here would be duplicating it.

This demo is the counterpart to CSV: CSV needed both layers, anchors needs only the top one. Together they show that the cost of a new extraction over an existing format is exactly one JSON file.

**It is noisy by design.** Every anchor on the page becomes a statement — nav, footer, boilerplate and all. That is accepted for a demo, and is itself informative about what a permissive selector costs. But it means **the smoketest fixture page must be small and curated**, or the golden becomes unreviewable. Task 24 owns that fixture.

**Steps**

- [ ] Write `src/tests/anchorHarmonizer.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { harmonizeSource, createDefaultHandlerRegistry, validateHarmonizer } from 'octothorpes'

const here = dirname(fileURLToPath(import.meta.url))
const definition = JSON.parse(readFileSync(resolve(here, '../lib/harmonizers/anchors.json'), 'utf8'))

const registry = createDefaultHandlerRegistry({ defaultHandler: 'html' })
const run = (html, options = {}) =>
  harmonizeSource(html, definition, { handlerRegistry: registry, ...options })

const page = `<!doctype html><html><head><title>Links</title></head><body>
  <nav><a href="/about">About</a></nav>
  <main>
    <a href="https://example.test/one">One</a>
    <a href="relative/two">Two</a>
    <a>no href</a>
    <a href="#anchor">fragment</a>
  </main>
  <footer><a href="/colophon">Colophon</a></footer>
</body></html>`

describe('anchors harmonizer', () => {
  it('is a valid definition and needs no new handler', () => {
    expect(validateHarmonizer(definition)).toEqual([])
    expect(definition.mode).toBe('html')
  })

  it('selects every anchor with an href', async () => {
    const blob = await run(page)
    expect(blob.octothorpes.length).toBeGreaterThanOrEqual(4)
  })

  it('is noisy by design — nav and footer links are included', async () => {
    const blob = await run(page)
    const joined = blob.octothorpes.join(' ')
    expect(joined).toMatch(/about/)
    expect(joined).toMatch(/colophon/)
  })

  it('skips anchors with no href', async () => {
    const blob = await run(page)
    expect(blob.octothorpes.some((o) => !o)).toBe(false)
  })

  it('resolves relative hrefs against the page URL', async () => {
    // VERIFY THIS DURING IMPLEMENTATION against the real html handler — if it
    // does not absolutize, either pass the base through options or accept
    // relative values and say so here.
    const blob = await run(page, { source: 'https://site.test/page/' })
    const joined = blob.octothorpes.join(' ')
    expect(joined).toContain('https://site.test/page/relative/two')
    expect(joined).toContain('https://site.test/about')
  })

  it('leaves absolute hrefs untouched', async () => {
    const blob = await run(page, { source: 'https://site.test/page/' })
    expect(blob.octothorpes).toContain('https://example.test/one')
  })

  it('yields an empty list for a page with no anchors', async () => {
    const blob = await run('<!doctype html><html><body><p>nothing</p></body></html>')
    expect(blob.octothorpes).toEqual([])
  })
})
```

- [ ] Run `npx vitest run src/tests/anchorHarmonizer.test.js` — expect fail.
- [ ] Write `src/lib/harmonizers/anchors.json`:

```json
{
  "//": "Site-level demo harmonizer (#217 wave 5, #273). HARMONIZER ONLY — no new handler, because HTML parsing already exists; mode 'html' reuses it. Octothorpes every anchor on the page. NOISY BY DESIGN: nav, footer and boilerplate links all become statements. That is accepted for a demo and is itself informative about what a permissive selector costs — keep test and smoketest fixture pages small and curated.",
  "id": "harmonizer/anchors",
  "type": "harmonizer",
  "title": "Anchor Harmonizer",
  "mode": "html",
  "schema": {
    "subject": {
      "s": "source",
      "title": [{ "selector": "title", "attribute": "textContent" }],
      "octothorpes": [{ "selector": "a[href]", "attribute": "href" }]
    }
  }
}
```

- [ ] **Verify relative-href resolution.** Run the harmonizer against a page containing `<a href="relative/two">` with a known source URL and confirm the extracted value is absolute. If the HTML handler does not absolutize `href` attributes, decide explicitly: either thread the base URL into extraction, or record in the `"//"` note that anchor values are page-relative. Do not leave it ambiguous.
- [ ] Run `npx vitest run src/tests/anchorHarmonizer.test.js src/tests/harmonizerDiscovery.test.js src/tests/htmlHandler.test.js` — expect pass.
- [ ] Commit: `#217 wave 5: anchors harmonizer (harmonizer-only demo over the existing html handler)`

## Task 24: Resolved-profile coverage for discovered handlers and harmonizers

**Files**
- Modify: `src/lib/op.js` (pass discovered names into `createClient`)
- Modify: `src/tests/profileEndpoints.test.js`
- Modify: `src/tests/resolveProfile.test.js`
- Modify: smoketest fixtures / golden captures
- Modify: `docs/plans/point7/release notes/release-notes-development.md`

**Interfaces**
- Consumes: `handlerRegistry.listHandlers()`, `harmonizerRegistry.listHarmonizers()` (wired in Task 12)
- Produces: `api.handlers.available` and `api.harmonizers.available` in `op.resolvedProfile()` and at `/profile.json`, including the demo names

**Steps**

- [ ] Append to `src/tests/profileEndpoints.test.js`:

```js
describe('#217 wave 5: discovery shows up in the projection, not the authored file', () => {
  it('lists the demo handler among available handlers', async () => {
    const body = await (await GET()).json()
    expect(body.api.handlers.available).toContain('csv')
    expect(body.api.handlers.available).toContain('html')
  })

  it('lists both demo harmonizers among available harmonizers', async () => {
    const body = await (await GET()).json()
    expect(body.api.harmonizers.available).toEqual(expect.arrayContaining(['csv', 'anchors', 'default']))
  })

  it('none of those names appear in the authored octothorpes.json', () => {
    // The authored file declares DIRECTORIES. Names are discovered, never written.
    const authored = JSON.stringify(profileData)
    expect(authored).not.toContain('"available"')
    expect(authored).not.toContain('"anchors"')
    expect(profileData.api.handlers.dir).toBeTypeOf('string')
    expect(profileData.api.harmonizers.dir).toBeTypeOf('string')
  })

  it('a handler that fails to load is absent from the projection rather than fatal', async () => {
    const { skippedHandlers } = await import('$lib/handlers/index.js')
    const body = await (await GET()).json()
    for (const { name } of skippedHandlers) {
      expect(body.api.handlers.available).not.toContain(name.replace(/\.js$/, ''))
    }
  })
})
```

- [ ] Run `npx vitest run src/tests/profileEndpoints.test.js` — expect fail.
- [ ] In `src/lib/op.js`, pass the discovered registries so `resolveProfile` sees them:
  ```js
  import { handlers as siteHandlers } from '$lib/handlers/index.js'
  import { harmonizers as siteHarmonizers } from '$lib/harmonizers/index.js'
  // ... in the createClient config:
  handlers: siteHandlers,
  harmonizers: siteHarmonizers,
  ```
  Confirm `createClient` registers `config.harmonizers` onto its harmonizer registry before computing `resolved` (Task 12) — otherwise the names will not appear in the projection.
- [ ] Add a resolved-profile unit assertion in `src/tests/resolveProfile.test.js` that `handlerNames` and `harmonizerNames` reach `api.handlers.available` / `api.harmonizers.available` unmodified apart from de-duplication.
- [ ] Add the demo smoketest fixtures (ticks epic **#273**'s "add demos to smoketest"):
  - a small CSV fixture with `octothorpes`, `bookmarks` and a deliberately unrecognized column, indexed via `/index` with `text/csv`;
  - a **small, curated** HTML fixture for the anchors harmonizer — a handful of anchors, no site chrome. The harmonizer is noisy by design, so fixture size is the only thing keeping the golden reviewable.
- [ ] Run `npm run smoketest`, review the diff **deliberately** (expected churn: `api.handlers`/`api.harmonizers` in the `/profile.json` golden, plus the two new demo captures), and re-capture.
- [ ] Run `npx vitest run src/tests/handlerDiscovery.test.js src/tests/harmonizerDiscovery.test.js src/tests/csvHandler.test.js src/tests/anchorHarmonizer.test.js src/tests/resolveProfile.test.js src/tests/profileEndpoints.test.js src/tests/exports.test.js` — expect pass.
- [ ] Run the full suite once (`npx vitest run`, ~150s — expected, not hung).
- [ ] Append a Wave 5 release-notes entry: the two new extension directories, the discovery loaders, the two demos, and the note that this closes #273's example-demo and smoketest TODO items.
- [ ] Commit: `#217 wave 5: discovered handlers and harmonizers in the resolved profile, plus demos`

## Task 25: The CSV handler reads its column map from the harmonizer

**Files**
- Modify: `src/lib/handlers/csv.js`
- Modify: `src/lib/harmonizers/csv.json` (the `"//"` note only)
- Test: `src/tests/csvHandler.test.js` (append a section)

**Interfaces**
- `harmonize(content, schema, options)` — the `schema` argument stops being decorative. When a harmonizer definition is supplied, the column→OP-field mapping comes from `schema.subject`; when it is absent (bare content-type dispatch, `text/csv` with no harmonizer named), the handler falls back to its built-in default map so Task 21's behavior is preserved exactly.

**Why this task exists — and why it is last.**

Through Task 24 the CSV harmonizer is *decorative*: `src/lib/harmonizers/csv.json` declares a column map, and `src/lib/handlers/csv.js` independently hardcodes the same map. They agree by hand. That was enough to prove **discovery** and **cross-registry reference**, which is what Waves 5's earlier tasks are for, and it is deliberately left alone there.

But it only proves half of extensibility. The more interesting half — and the original intent of the CSV demo — is **"a site declares its extraction rules as data."** This task closes that loop: after it, editing `csv.json` changes what gets extracted, with **no code edit and no redeploy of handler logic**. That is the claim the whole `api.harmonizers.dir` extension point is making, and until a handler actually reads a discovered definition, nothing in the repo demonstrates it.

It goes last because it depends on everything before it: the handler (21), the harmonizer (22), and the discovery + dispatch path that delivers one to the other (19, 20, 24).

**Spec.**

- **`schema.subject` is the map.** Each key is an OP field; its value is a list of selectors in the CSV handler's own `{ "column": "<header>" }` dialect. A key present in the definition is extracted from the named column; a key absent from the definition is **not** extracted at all.
- **List vs scalar keys keep the Task 21 semantics.** `octothorpes`, `bookmarks`, `cites` and `links` collect every non-empty cell (deduped, trimmed); `title` and `description` take the first non-empty value. The *classification* stays the handler's — the harmonizer says which column feeds which field, not what kind of field it is.
- **Multiple selectors per field are unioned**, in declaration order, so `"octothorpes": [{ "column": "tags" }, { "column": "topics" }]` reads both columns into one list.
- **Unknown columns and unknown fields are still ignored, not errors** — same rationale as Task 21.
- **No harmonizer means the built-in default map**, unchanged. Do not make the handler require a definition; content-type dispatch must keep working.
- The subject model does **not** change: one document, one subject, `'@id': 'source'`. Task 25 changes *which cells* become statements, never *how many subjects* exist. Batch indexing remains epic **#274**.

**Steps**

- [ ] Append to `src/tests/csvHandler.test.js`:

```js
describe('#217 task 25: the handler reads its column map from the harmonizer', () => {
  const doc = [
    'tags,topics,saved,headline,notes',
    'cats,gardens,https://a.test/,My Links,ignored',
    'dogs,,https://b.test/,Later,ignored',
  ].join('\n')

  const mapping = (subject) => ({
    id: 'harmonizer/csv-test',
    type: 'harmonizer',
    title: 'CSV test map',
    mode: 'csv',
    schema: { subject: { s: 'source', ...subject } },
  })

  it('extracts from the columns the DEFINITION names, not hardcoded ones', () => {
    const blob = csvHandler.harmonize(doc, mapping({
      octothorpes: [{ column: 'tags' }],
      bookmarks: [{ column: 'saved' }],
      title: [{ column: 'headline' }],
    }))
    expect(blob.octothorpes).toEqual(['cats', 'dogs'])
    expect(blob.bookmarks).toEqual(['https://a.test/', 'https://b.test/'])
    expect(blob.title).toBe('My Links')
  })

  // THE POINT OF THIS TASK: altering the harmonizer JSON alters extraction,
  // with no code change. Same document, different map, different statements.
  it('changing the column map changes the emitted statements', () => {
    const asTags = csvHandler.harmonize(doc, mapping({ octothorpes: [{ column: 'tags' }] }))
    const asTopics = csvHandler.harmonize(doc, mapping({ octothorpes: [{ column: 'topics' }] }))
    expect(asTags.octothorpes).toEqual(['cats', 'dogs'])
    expect(asTopics.octothorpes).toEqual(['gardens'])
    expect(asTags.octothorpes).not.toEqual(asTopics.octothorpes)
  })

  it('unions multiple selectors for one field, in declaration order', () => {
    const blob = csvHandler.harmonize(doc, mapping({
      octothorpes: [{ column: 'tags' }, { column: 'topics' }],
    }))
    expect(blob.octothorpes).toEqual(['cats', 'dogs', 'gardens'])
  })

  it('does not extract a field the definition omits', () => {
    const blob = csvHandler.harmonize(doc, mapping({ octothorpes: [{ column: 'tags' }] }))
    expect(blob.bookmarks).toBeUndefined()
    expect(blob.title).toBeUndefined()
  })

  it('ignores a selector naming a column the document does not have', () => {
    const blob = csvHandler.harmonize(doc, mapping({ octothorpes: [{ column: 'nope' }] }))
    expect(blob.octothorpes).toEqual([])
  })

  it('ignores a definition key that is not an OP field it knows', () => {
    const blob = csvHandler.harmonize(doc, mapping({
      octothorpes: [{ column: 'tags' }],
      nonsense: [{ column: 'notes' }],
    }))
    expect(blob.nonsense).toBeUndefined()
    expect(blob.octothorpes).toEqual(['cats', 'dogs'])
  })

  it('keeps scalar semantics for title/description — first non-empty wins', () => {
    const blob = csvHandler.harmonize(doc, mapping({ title: [{ column: 'headline' }] }))
    expect(blob.title).toBe('My Links')
  })

  it('falls back to the built-in map when no definition is supplied', () => {
    // Content-type dispatch (text/csv with no harmonizer named) must keep
    // working exactly as it did in Task 21.
    const legacy = 'octothorpes,bookmarks\ncats,https://a.test/'
    expect(csvHandler.harmonize(legacy, null).octothorpes).toEqual(['cats'])
    expect(csvHandler.harmonize(legacy, undefined).bookmarks).toEqual(['https://a.test/'])
  })

  it('still emits ONE subject — this changes cells, not cardinality (#274 stays out)', () => {
    const blob = csvHandler.harmonize(doc, mapping({ octothorpes: [{ column: 'tags' }] }))
    expect(blob['@id']).toBe('source')
    expect(blob.subjects).toBeUndefined()
  })
})

describe('the shipped csv.json drives the shipped handler', () => {
  it('the committed definition produces the same result as the built-in map', () => {
    // The two agreed by hand through Task 24; after this task the definition is
    // the source of truth and this test is what keeps them honest.
    const doc = 'octothorpes,bookmarks,title\ncats,https://a.test/,My Links'
    expect(csvHandler.harmonize(doc, definition)).toEqual(csvHandler.harmonize(doc, null))
  })

  it('editing the definition alone changes extraction end to end', async () => {
    const altered = structuredClone(definition)
    altered.schema.subject.octothorpes = [{ column: 'bookmarks' }]
    const blob = await harmonizeSource('octothorpes,bookmarks\ncats,https://a.test/', altered, {
      handlerRegistry: registry,
    })
    expect(blob.octothorpes).toEqual(['https://a.test/'])
  })
})
```

> The second `describe` reuses the `definition`, `registry` and `harmonizeSource` bindings introduced by Task 22's appended section in the same file.

- [ ] Run `npx vitest run src/tests/csvHandler.test.js` — expect fail.
- [ ] Rewrite the mapping half of `src/lib/handlers/csv.js`. Keep `parseCsv` exactly as it is; replace the hardcoded `LIST_COLUMNS`/`SCALAR_COLUMNS` sweep with a definition-driven one:

```js
// The handler still OWNS the field classification — which OP fields are lists
// and which are scalars is protocol shape, not site configuration. What the
// harmonizer supplies is the COLUMN each field reads from.
const LIST_FIELDS = ['octothorpes', 'bookmarks', 'cites', 'links']
const SCALAR_FIELDS = ['title', 'description']

/**
 * The built-in map, used when no harmonizer definition is supplied (content-type
 * dispatch). Identical to the shipped src/lib/harmonizers/csv.json, which is
 * what the "definition and built-in agree" test pins.
 */
const DEFAULT_SUBJECT = {
  octothorpes: [{ column: 'octothorpes' }],
  bookmarks: [{ column: 'bookmarks' }],
  cites: [{ column: 'cites' }],
  links: [{ column: 'links' }],
  title: [{ column: 'title' }],
  description: [{ column: 'description' }],
}

/** Selectors for one field, tolerating a bare object instead of a list. */
const selectorsFor = (subject, field) => {
  const raw = subject?.[field]
  if (!raw) return []
  return (Array.isArray(raw) ? raw : [raw]).filter((sel) => sel && sel.column)
}

/**
 * @param {string} content - the raw CSV document
 * @param {Object|null} schema - the harmonizer definition. THIS IS NOW LOAD
 *   BEARING (#217 task 25): schema.subject supplies the column -> OP-field map,
 *   so editing src/lib/harmonizers/csv.json changes what this handler extracts
 *   with no code edit. That is the half of extensibility the earlier Wave 5
 *   tasks did not demonstrate — "a site declares extraction rules as data".
 *   Null/absent falls back to DEFAULT_SUBJECT so content-type dispatch is
 *   unaffected.
 * @param {Object} [options]
 * @returns {Object} blobject with '@id': 'source' — still ONE subject per
 *   document. This task changes which cells become statements, never how many
 *   subjects exist; row-per-subject remains epic #274.
 */
const harmonize = (content, schema, options = {}) => {
  const rows = parseCsv(content)
  const subject = schema?.schema?.subject ?? schema?.subject ?? DEFAULT_SUBJECT
  const declared = (field) => Object.prototype.hasOwnProperty.call(subject, field)
  const output = { '@id': 'source', octothorpes: [] }
  if (!rows.length) return output

  for (const field of LIST_FIELDS) {
    if (!declared(field)) continue
    const values = []
    // Multiple selectors union in declaration order.
    for (const { column } of selectorsFor(subject, field)) {
      for (const row of rows) pushUnique(values, row[String(column).trim().toLowerCase()])
    }
    output[field] = values
  }

  for (const field of SCALAR_FIELDS) {
    if (!declared(field)) continue
    const first = selectorsFor(subject, field)
      .flatMap(({ column }) => rows.map((r) => String(r[String(column).trim().toLowerCase()] ?? '').trim()))
      .find(Boolean)
    if (first) output[field] = first
  }

  // Unchanged from Task 21: opt-in stays the document's decision.
  return output
}
```

  Two behavioral details to preserve deliberately:
  - `output.octothorpes` must stay present (possibly empty) even when the definition omits it — the blobject contract. Initialize it as above and let a declared map overwrite it.
  - A declared list field with no matching column yields `[]`, not `undefined`; an *undeclared* field is absent entirely. The tests above distinguish the two.
- [ ] Update the `"//"` note in `src/lib/harmonizers/csv.json` to say the definition is now **read by the handler**, not merely parallel to it — editing this file changes extraction with no code change. Remove any wording implying the map is duplicated in JS.
- [ ] Run `npx vitest run src/tests/csvHandler.test.js src/tests/harmonizerDiscovery.test.js src/tests/handlerDiscovery.test.js` — expect pass.
- [ ] Run `npm run smoketest` and confirm **zero** golden churn: the shipped definition and the old built-in map produce identical output, so the demo captures from Task 24 must not move. Any churn here means the two maps disagreed and the disagreement needs explaining before proceeding.
- [ ] Append a release-notes line: the CSV handler now takes its column map from the discovered harmonizer, closing the loop on declarative extraction; note that `harmonize(content, schema)`'s second argument is load-bearing for this handler and that a null definition still falls back to the built-in map.
- [ ] Commit: `#217 wave 5: csv handler reads its column map from the harmonizer definition`
