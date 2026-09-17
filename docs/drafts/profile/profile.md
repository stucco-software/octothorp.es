---
title: The OP Client Profile
description: How a relay declares who it is, what it will index, and what it can extract
layout: octo_page.html
permalink: profile/index.html
eleventyNavigation:
  key: Profile
  order:
date: git Last Modified
tags:
---

> ## ⚠ UNREVIEWED CLAUDE DRAFT
> Written by Claude, not yet edited by a human. Delete this block before publishing.

An OP Client is two files. `octothorpes.json` -- the profile -- says who the relay is, who may send it data, and what it knows how to read. `.env` holds secrets, plus one override. Nothing else is configuration.

The profile is _declarative only_. You never write a list of your publishers into it; you write the directory they live in, and the names of the ones that actually loaded show up in the resolved profile at [/profile.json](https://octothorp.es/profile.json). That split is the whole design: the authored file is intent, the resolved profile is fact, and the public one is the second.

## Start with a stub

```
npx octothorpes new --instance=https://octothorp.es/
```

That is the only command core ships. It writes `octothorpes.json` in the current directory, validates it before writing, and stops. The flags:

| Flag | What it sets |
|---|---|
| `--instance=<url>` | `identity.instance`. Required -- the command fails without it. |
| `--name=<text>` | `identity.name` |
| `--description=<text>` | `identity.description` |
| `--terms=<url>` | `identity.terms`; defaults to `<instance>~/` |
| `--registration=<mode>` | `registered`, `open` or `closed` |
| `--indexing=<mode>` | `request` or `active` |
| `--dirs=<path>` | base path for the three extension dirs |
| `--schema=<path>` | the `$schema` value written into the file |
| `--force` | overwrite an existing `octothorpes.json` |
| `--stdout` | print the JSON instead of writing it |

The scaffold emits only what you asked for. It does not bake in defaults -- if `policies.commercial` is absent from your file, that is because the loader fills it, not because the command forgot.

Keep the `$schema` pointer the scaffold writes. Every object in the schema is `additionalProperties: false`, so a typo is an error rather than a key that quietly does nothing, and an editor that follows `$schema` will catch it before the relay does.

## Who may send you data

Two different questions live under `policies`, and collapsing them is the most common mistake. `indexing.mode` is _what triggers_ indexing: `request` means you index when asked, `active` means you crawl on your own schedule. `access.registration` is _what gate_ an index request has to pass. All six combinations are valid.

`indexing.cooldown` cuts across both: it is the minimum wait, in seconds, before the same URL will be re-indexed (default `300`). It applies under every mode -- under `request` it throttles repeat `/index` calls, under `active` it is also the crawler's re-check interval. Set it to `0` and every request re-indexes.

The gate has three modes:

- `registered` (the default) -- the source origin must be verified in your datastore. This is what octothorp.es does: submit the form, an admin reads it, an admin approves you.
- `open` -- no verification. Anything may be indexed except origins on `blocks.domains`.
- `closed` -- strictly whitelist-only. Nothing is indexed unless its origin is in `whitelist.domains`.

`blocks.domains` only does anything at the indexing gate under `open` -- the other two modes already exclude everyone unlisted. (The `/register` form consults it under every mode, to short-circuit a signup from a domain you have already refused.)

`blocks.terms` is a different list with a different enforcement point, and it applies in _every_ mode. A relay wants to refuse a slur whatever its origin gate looks like. It is checked when statements are written: the offending statement is dropped and the rest of the page indexes normally. It is not retroactive -- terms already in the graph when you add them to the list stay there -- and there is no read-side counterpart.

Both blocklists and the whitelist take either an inline array or a string path to a JSON file containing an array of strings. Lists get long and often get shared between deployments. A path that is missing or unparseable is a load-time error, not a silently empty list.

Note that everything under `access` is published at `/profile.json`, expanded. Your blocklists are advertised on purpose; a list you do not want to advertise is private moderation and belongs outside the profile.

### Endorsement

`access.endorsement.sources` is an ordered list of endorser names, and the endorsers themselves are injected in code, never in the profile:

```js
createClient({ profile, endorsers: [{ name: 'neighbours', endorse }] })
```

The name in `sources` is the address. An injected endorser not named there is filtered out; a name with no matching endorser is unresolvable and the loader warns about it. Names must be unique -- `createClient` throws on a duplicate, because the ordered list would otherwise be unreadable. `graph` is reserved for a built-in web-of-trust source, so do not use it for your own endorser.

The stage is declared, validated and ordered today; the indexing gate itself runs the three registration modes above and nothing else. Injecting an endorser does not currently admit an origin the registration check refused.

## Coherence warnings

The loader warns and never throws when your profile is schema-valid but the combination does nothing. There are three from the loader:

- `blocks.domains` is non-empty under a registration mode other than `open` -- the origin blocklist is inert at the indexing gate there.
- `registration` is `closed` with an empty `whitelist.domains` -- this client can index nothing at all.
- `endorsement.sources` is non-empty under a mode other than `registered`, or names an endorser that was never injected.

There is deliberately no warning for `blocks.terms`. It is never inert.

The client adds four more at init, once it knows which harmonizers actually registered. A declared link type and a declared `documentRecord` predicate are only half of a working feature -- the harmonizer that writes the subtype or extracts the key is the other half, and nothing in the schema can see it. So the client crosses the two and says so in one line per kind, in both directions: a declared link type no harmonizer writes ("custom link types found (reviewed -> octo:Review); these must be captured by a custom harmonizer before OP will record them"), a declared predicate no harmonizer extracts, a site harmonizer writing a subtype no link type queries, and a site harmonizer extracting `documentRecord` keys you never declared (which are dropped at write time). Builtins are exempt in every direction -- core's own `by` words and harmonizers are not your misconfiguration. These are advisory: a blobject POSTed straight to `/index` can carry a `documentRecord` no harmonizer ever touched, so an unmatched predicate is a smell, not an error. The four lists also appear on the resolved profile under `api.coherence`, for a `/profile` page that wants to show them.

Two things _are_ hard errors, at load: a profile with no `identity.instance` and no `instance` env override, and any key whose name looks like a credential (`key`, `secret`, `token`, `password`, `credential`). That second check runs before schema validation, so the message stays useful however the schema changes. Secrets live in `.env` and get resolved where they are used.

## Extension directories

`api.publishers.dir`, `api.handlers.dir` and `api.harmonizers.dir` are three siblings, not a hierarchy. Handlers are JS modules that parse a content type; harmonizers are JSON definitions that select fields out of a source and name the handler they run under via their `mode` field. The dependency points harmonizer to handler, so nesting them the other way would invert it.

```json
"api": {
  "publishers": { "dir": "./static/publishers" },
  "handlers": { "dir": "./static/handlers", "default": "html" },
  "harmonizers": { "dir": "./static/harmonizers" }
}
```

These pointers are operative, not decorative -- the directory is walked at runtime, so repointing one at another directory on disk is honoured. What loaded shows up in the resolved profile as `api.publishers.available`, `api.handlers.available` and `api.harmonizers.available`. A single broken extension is skipped with a warning rather than taking the process down with it, which means `available` is the honest answer to "what does this relay actually run."

`handlers.default` is the mode dispatch falls back to when an explicit mode and the content type both fail to decide. It is `html` unless you say otherwise, and it lives under handlers because it is a handler mode -- not a harmonizer id.

## linkTypes

The `by` half of a query -- `/get/everything/cited` -- is a table, and `api.linkTypes` extends it.

```json
"linkTypes": [
  { "by": "reviewed", "subtype": "Review", "objects": "notTerms", "label": "Reviews" }
]
```

That one line makes `/get/everything/reviewed` a real query on your client, returning only relationships typed `octo:Review`.

Three keys do the work:

- **`by`** is the query word. It occupies the `[by]` route slot, so it is a bare lowercase word. Core's builtins -- `thorped`, `linked`, `backlinked`, `cited`, `bookmarked`, `posted`, `in-webring` and their aliases -- are already in the table and cannot be redeclared; a collision is a load-time error rather than a silent override.
- **`subtype`** is the octo class written on the relationship as `rdf:type octo:<subtype>`. Bare local name, same rule as `documentRecord[].predicate`.
- **`objects`** says what may sit on the object side: `notTerms` (the default, any non-term resource), `terms`, `pages`, or `none`. `?rt=` always works on a declared type, because a typed relationship is exactly the node per-relationship terms hang off.

The profile declares the query word; a harmonizer declares the markup that writes the subtype. **The two meet on the subtype name** -- nothing else connects them. Declare `Review` here and emit `Review` there and the query finds rows; emit `Reviews` and it silently finds nothing. This is the same shape as `documentRecord`, one layer up: the profile is the admission contract, the harmonizer is the extractor.

There is nothing special about the builtins. `cited` is `{ by: "cited", subtype: "Cite", objects: "notTerms" }` hardwired into core, and a declared type takes the identical code path.

`/get/<what>/<by>` is the only route form. There is no `[what]`-slot alias -- an earlier `path` key offered one and was removed 2026-09-16, unused.

## documentRecord

A harmonizer can extract anything. `api.documentRecord` decides what you keep.

```json
"documentRecord": [
  { "predicate": "textContent", "range": "literal" },
  { "predicate": "canonical", "range": "uri" },
  { "predicate": "wordCount", "range": "number" },
  { "predicate": "dateModified", "range": "timestamp" }
]
```

`predicate` is a bare local name matching `^[A-Za-z][A-Za-z0-9_]*$` -- no colon, slash or dot, so a prefixed name or a full IRI cannot be smuggled through. Every entry is written as `octo:<predicate>`. There is no `namespace` or `iri` key and supplying one is a schema error: declaring a documentRecord entry _is_ adding a field to the OP vocabulary, and it is not a route into someone else's.

The harmonizer side is where extraction happens. A harmonizer with a `documentRecord` block in its schema puts the values on the blobject:

```json
"schema": {
  "documentRecord": {
    "canonical": [{ "selector": "link[rel='canonical']", "attribute": "href" }]
  }
}
```

The two halves meet at write time. Only predicates present in `api.documentRecord` are stored -- an undeclared key on the blobject is dropped, not saved-and-ignored -- and the read side projects back the same declared set, typed by `range`. So a harmonizer extracting a field you have not declared writes nothing, and the fix is a line in the profile rather than a change to the harmonizer.

`range` is `literal`, `uri`, `number` or `timestamp`. `type` is an accepted alias for `range`: the loader normalises it before validation, so declare exactly one of the two -- an entry with both, or with neither, is a load-time error, and the resolved profile always carries `range`. `uri` values are stored as IRIs and skipped with a warning if they do not parse; everything else is stored as a string literal and coerced on read.

## Foreign vocabularies

`vocabulary.namespaces` is where other people's ontologies go:

```json
"vocabulary": {
  "namespaces": [
    { "prefix": "skos", "iri": "http://www.w3.org/2004/02/skos/core#" }
  ]
}
```

A declared prefix resolves in queries. `import: true` asks init to fetch the ontology into a named graph -- declare-only is the default and the only thing wired today. Core ships `octo`, `rdf` and `rdfs` as builtins -- `schema` and `foaf` were audited as unused by the protocol and demoted to declare-if-you-want-it -- and the resolved profile marks each namespace `builtin` or `declared` so a consumer can tell which are yours.

`vocabulary.octo` is the OP vocabulary's own IRI. Overriding it forks vocabulary identity: different IRIs get written into the graph and your data stops merging with standard-vocab relays. Leave it alone unless that is what you want.

## Identity

Everything under `identity` is optional and none of it is operational -- consumers render what is there and skip what is not. Two fields get confused, so: `identity.terms` is the URI prefix for octothorpe Terms, and appending a term name to it yields that term's URI. `identity.rules` is the link to your human-readable rules document, the social contract a submitter agrees to. They used to share a key.

An undeclared `terms` defaults to `instance + '~/'`, because that is the prefix core actually mints into the graph. `rules` gets no derived default -- there is no convention a wrong guess could follow safely, so an undeclared one stays null and consumers show nothing.

Relative identity URLs are absolutized against `identity.instance` when the profile is resolved, so `"rules": "/rules"` follows a deploy-level instance override. `identity.feeds.thorpes` takes either a URL or an array of bare term names, which expand against the terms prefix.

## The one env override

`.env` is secrets, plus `instance`. A non-empty `instance` in the environment overrides `identity.instance` -- empty string counts as absent, so an unset variable on a staging host never clobbers the authored value. The resolved value is canonicalized to a trailing slash before anything interpolates it, because core builds `${instance}~/` in several places and a bare origin would mint URIs that are syntactically fine and match nothing.

`OP_PROFILE` names a different profile file, relative to the project root, and is the override to use for tests and alternate deploys.

## Reading someone else's profile

`/profile.json` is public and unauthenticated. `GET https://octothorp.es/profile.json` returns the resolved profile -- the projection, computed at init from what actually registered, never written to disk -- and [/profile](https://octothorp.es/profile) is the same thing rendered for humans.

That is enough to build a client card for a relay you have never talked to: name, description, images, feed pointers, contact points, the rules link, the registration mode, and the `available` lists telling you which publishers and harmonizers it can actually give you. Mounting it at that path is convention rather than protocol, so treat a fetch as something that can fail and degrade when it does.

`api.routes` tells you how to form every query that relay answers. Each entry pairs a mount name with a URL template, and the `get` entry adds the grammar that fills it: which `what` and `by` words it accepts, which `as` formats it can publish, and which query params are read. Two relays running the same core can mount `/get` differently -- path segments here, query params there -- so read the template rather than assuming octothorp.es's shape. It is projection-only: a client passes its mount table to `createClient` in code, and writing `api.routes` into `octothorpes.json` is a validation error.

## A profile that validates

Every field below is authored; everything else in [the reference](/profile/reference/) is filled by the loader.

```json
{
  "$schema": "./node_modules/octothorpes/profile.schema.json",

  "identity": {
    "instance": "https://octothorp.es/",
    "name": "Octothorpes",
    "description": "The Octothorpes Protocol relay and reference client.",
    "terms": "/~/",
    "rules": "/rules",
    "feeds": {
      "thorpes": ["octothorpe-news", "cats"],
      "multipass": "/news-and-favs.json"
    },
    "images": {
      "favicon": "/favicon.ico",
      "avatar": "/avatar.png",
      "button": "/badge.png"
    },
    "contact": {
      "email": "admin@octothorp.es",
      "bluesky": "@octothorp.es"
    }
  },

  "policies": {
    "commercial": false,
    "indexing": { "mode": "request" },
    "access": {
      "registration": "registered",
      "badge": "/badge.png",
      "blocks": {
        "domains": [],
        "terms": "./blocklists/terms.json"
      },
      "whitelist": { "domains": [] },
      "endorsement": { "sources": ["neighbours"] }
    }
  },

  "api": {
    "linkTypes": [
      { "by": "reviewed", "subtype": "Review", "label": "Reviews" }
    ],
    "documentRecord": [
      { "predicate": "textContent", "range": "literal" },
      { "predicate": "canonical", "range": "uri" },
      { "predicate": "wordCount", "range": "number" },
      { "predicate": "dateModified", "range": "timestamp" }
    ],
    "publishers": { "dir": "./static/publishers" },
    "handlers": { "dir": "./static/handlers", "default": "html" },
    "harmonizers": { "dir": "./static/harmonizers" }
  },

  "vocabulary": {
    "namespaces": [
      { "prefix": "skos", "iri": "http://www.w3.org/2004/02/skos/core#" }
    ]
  }
}
```

Note `blocks.terms` is a bare string, not an array containing one -- the path form is the string itself. That profile loads with no warnings, given an endorser named `neighbours` injected into `createClient` and a `./blocklists/terms.json` containing an array of strings.
