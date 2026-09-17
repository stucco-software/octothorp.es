---
title: Profile reference
description: Every field in the OP Client Profile schema, with types, defaults and enums
layout: octo_page.html
permalink: profile/reference/index.html
eleventyNavigation:
  key: Profile reference
  parent: Profile
  order:
date: git Last Modified
tags:
---

> ## ⚠ UNREVIEWED CLAUDE DRAFT
> Written by Claude, not yet edited by a human. Delete this block before publishing.

Every field in `octothorpes.json`. Defaults are what the loader fills when the key is absent, so a fully-populated profile object always comes back -- you never write `profile.policies?.access?.registration ?? 'open'`.

No field is required, with one operational exception: a client with no `identity.instance` and no `instance` env override throws at load. Every object in the schema is `additionalProperties: false`, so an unrecognised key anywhere is a validation error.

## identity

Who this client is. Nothing here is operational; consumers render what is present.

| Path | Type | Default | Meaning |
|---|---|---|---|
| `identity.instance` | string (uri) | `null` | Canonical base URL. The `instance` env override wins when non-empty. |
| `identity.name` | string | `null` | Display name. |
| `identity.description` | string | `null` | One-line description. |
| `identity.terms` | string (uri-reference) | `null` | URI prefix for octothorpe Terms -- append a name to get that term's URI. Undeclared derives `instance + '~/'`. Never terms-of-service. |
| `identity.rules` | string (uri-reference) | `null` | URL of the human-readable rules / ToS document. No derived default. |
| `identity.feeds` | object | `{}` | Feed pointers. Known slots `thorpes` and `multipass`; any other key is allowed. Each value is a URL string or an array of term names. |
| `identity.images` | object | `{}` | `favicon`, `avatar`, `blinkie`, `stamp`, `preview`, `button`. All strings, all optional, no other keys. |
| `identity.contact` | object | `{}` | Freeform string map -- `email`, `bluesky`, `fediverse`, whatever. Discovery only; posting credentials live in `.env`. |

## policies

| Path | Type | Default | Meaning |
|---|---|---|---|
| `policies.commercial` | boolean | `false` | Whether this relay indexes commercial activity. |
| `policies.labels` | array of objects | `[]` | Content labels this client applies and advertises, readable by other clients. Passed through to the resolved profile unchanged. |
| `policies.labels[].id` | string | -- | Required. Bare local name, pattern `^[A-Za-z][A-Za-z0-9_]*$` -- the same pattern documentRecord predicates use. |
| `policies.labels[].name` | string | -- | Required. Human-readable label name. |
| `policies.labels[].description` | string | -- | Optional. |
| `policies.indexing.mode` | string enum | `"request"` | What triggers indexing. `request` = only when asked via `/index`. `active` = this client crawls on its own schedule. |
| `policies.indexing.cooldown` | integer | `300` | Re-index cooldown in seconds. Applies under *every* mode: the minimum wait before the same URL is re-indexed, and under `active` the crawler's re-check interval. `0` disables the wait. |

### policies.access

What gate an index request must pass. Orthogonal to `indexing.mode`.

| Path | Type | Default | Meaning |
|---|---|---|---|
| `policies.access.registration` | string enum | `"registered"` | `registered` \| `open` \| `closed`. See below. |
| `policies.access.badge` | string | `null` | Path to the badge image used operationally -- a badge load can trigger a registration request. Absolutized in the resolved profile. |
| `policies.access.blocks.domains` | array of strings, or string path | `[]` | Origin blocklist. Meaningful at the indexing gate only under `open`; the `/register` short-circuit consults it in every mode. |
| `policies.access.blocks.terms` | array of strings, or string path | `[]` | Term blocklist. Applies in every registration mode, enforced at statement-write time. Not retroactive, no read-side filtering. |
| `policies.access.whitelist.domains` | array of strings, or string path | `[]` | Origin allowlist. Meaningful only under `closed`. There is no `whitelist.terms`. |
| `policies.access.endorsement.sources` | array of strings | `[]` | Ordered endorser names, matched against `createClient({ endorsers })`. Order is significant. `graph` is reserved for a future built-in web-of-trust source. |

The path form on the three list fields is the string itself, not an array containing a string. The loader reads and parses it, requires an array of strings, and treats a missing or unparseable file as a load-time error. The resolved profile always carries the expanded array, never the path.

**`registration` enum**

| Value | What runs |
|---|---|
| `registered` | Datastore verification of the source origin. The default, and today's behaviour. |
| `open` | No verification. `blocks.domains` applies -- an origin that does not parse is treated as blocked. |
| `closed` | `whitelist.domains` only, compared origin-to-origin. No registration check, no fallback. |

`invite` was removed from this enum: `closed` plus a whitelist is invite-only.

The endorsement stage is declared and validated but is not consulted by the gate, which runs exactly the three branches above.

## api

| Path | Type | Default | Meaning |
|---|---|---|---|
| `api.linkTypes` | array of objects | `[]` | Declared link types, which EXTEND core's builtin `by` table. Each one adds a query word: `/get/everything/<by>`. Builtins cannot be redeclared -- a collision is a load-time error. |
| `api.linkTypes[].by` | string | -- | Required. The query word occupying the `[by]` route slot. Pattern `^[a-z][a-z0-9-]*$`. |
| `api.linkTypes[].subtype` | string | -- | Required. Bare octo local name, pattern `^[A-Za-z][A-Za-z0-9_]*$`, written on the relationship as `rdf:type octo:<subtype>`. This is the name a harmonizer must emit. Replaces the old `type` key. |
| `api.linkTypes[].objects` | string enum | `"notTerms"` | `terms` \| `notTerms` \| `pages` \| `none`. What may sit on the object side. |
| `api.linkTypes[].label` | string | `null` | Human-readable name for this link type, for rendering. |
| `api.documentRecord` | array of objects | `[]` | Admission + typing contract for document-record predicates. Octo-only. |
| `api.documentRecord[].predicate` | string | -- | Required. Bare local name, pattern `^[A-Za-z][A-Za-z0-9_]*$`. The IRI is always the octo namespace plus this name; there is no `namespace` or `iri` key. |
| `api.documentRecord[].range` | string enum | -- | Required. `literal` \| `uri` \| `number` \| `timestamp`. `type` is an accepted alias, normalised to `range` before validation; declare exactly one of the two -- both, or neither, is a load-time error. |
| `api.publishers.dir` | string | `null` | Directory of site publishers, walked at init. |
| `api.handlers.dir` | string | `null` | Directory of handler modules, walked at init. |
| `api.handlers.default` | string | `"html"` | Handler mode dispatch falls back to. A mode, not a harmonizer id. |
| `api.harmonizers.dir` | string | `null` | Directory of harmonizer JSON definitions, read and validated at init. |

The resolved profile's `api.linkTypes` is the MERGED list -- the builtins (`thorped`, `octothorped`, `tagged`, `termed`, `linked`, `backlinked`, `cited`, `bookmarked`, `mentioned`, `posted`, `all`, `in-webring`, `members`, `member-of`) tagged `source: "builtin"`, then your declarations tagged `source: "declared"`. Same convention as `vocabulary.namespaces`.

`range` note: the read-side coercion also understands `boolean`, but the schema enum does not include it, so a `boolean` entry fails validation.

## vocabulary

| Path | Type | Default | Meaning |
|---|---|---|---|
| `vocabulary.octo` | string (uri) | `"https://vocab.octothorp.es#"` | The OP vocabulary IRI. Overriding forks vocabulary identity. |
| `vocabulary.namespaces` | array of objects | `[]` | External namespaces this client operates with. |
| `vocabulary.namespaces[].prefix` | string | -- | Required. |
| `vocabulary.namespaces[].iri` | string (uri) | -- | Required. |
| `vocabulary.namespaces[].import` | boolean | `false` | `false` = declare-only, the prefix resolves in queries. `true` asks init to fetch the ontology into a named graph; not wired today. |

## federation

| Path | Type | Default | Meaning |
|---|---|---|---|
| `federation` | object | `{}` | Reserved. Validated and passed through to the resolved profile untouched; nothing reads it. |

## What the resolved profile changes

`/profile.json` serves a projection, not your file. It differs in these ways and no others.

| Resolved field | How it differs |
|---|---|
| `identity.instance` | Canonicalized to a trailing slash. |
| `identity.terms` | Absolutized against `instance`, or derived as `instance + '~/'` when undeclared. An absolute value passes through even if its origin differs from `instance`. |
| `identity.rules` | Absolutized against `instance`, or `null`. |
| `identity.feeds.*` | URL values absolutized. Array values expanded to full term URIs against the terms prefix. A slot whose array is empty is dropped. |
| `identity.images.*` | Absolutized against `instance`. |
| `policies.access.badge` | Absolutized against `instance`. |
| `policies.access.blocks.*`, `whitelist.domains` | Always the expanded array. A path never appears. |
| `api.publishers` | Replaced by `{ available }` -- deduplicated, sorted names of what registered. `dir` does not appear. |
| `api.handlers` | Replaced by `{ default, available }` -- registered modes, deduplicated, in registration order. `dir` does not appear. |
| `api.harmonizers` | Replaced by `{ available }` -- registered harmonizer names, deduplicated. `dir` does not appear. |
| `api.coherence` | Resolved-only, and a validation error if authored (`api` is closed). The #293 coherence report the client computed at init: `{ uncapturedLinkTypes, uncapturedDocumentRecord, unqueriedSubtypes, undeclaredDocumentRecord }` -- declared link types no registered harmonizer writes, declared `documentRecord` predicates none extracts, and the two reverse directions for site harmonizers. Absent when `resolveProfile()` is called without a client. |
| `api.routes` | Resolved-only, and a validation error if authored. A map of mount name -> `{ template }`, where `template` is a URL with `{...}` placeholders for its variable segments. The adapter supplies the mount table in code (`createClient({ routes })`); it is never written in `octothorpes.json`, because core cannot see an HTTP framework's route tree. Defaults to the SvelteKit relay's shape when an adapter passes nothing. |
| `api.routes.get` | The one mount core has something to say about, so it also carries the query grammar: `what` (the result words, in grammar order), `by` (every entry of the merged link-type table, builtins then declared), `as` (the publishers that actually registered, sorted), `params` (accepted query params, wire spelling, sorted) and `match` (accepted `?match=` values). |
| `vocabulary.namespaces` | Merged with the builtins (`octo`, `rdf`, `rdfs`), each entry carrying `source: "builtin"` or `source: "declared"`. |

Everything else -- `policies.commercial`, `labels`, `indexing`, `registration`, `endorsement.sources`, `documentRecord`, `vocabulary.octo`, `federation` -- is passed through as the loader resolved it, defaults included.
