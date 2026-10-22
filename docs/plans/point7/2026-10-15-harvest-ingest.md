# Harvest / Ingest Split

- Date: 2026-10-15
- Status: design, agreed in session 2026-10-14/15, not started
- Relates to: #274 (Batch Indexing); TLO spike (PR #317, design doc `docs/plans/2026-10-14-tinylittleoffice-publishers.md`); #318 (TLO handler)

## Conclusions

- Fetching and harmonizing a URL becomes a core API, `harvest`, that never writes to the store. Storing becomes a separate call, `ingest`.
- Orchestra-pit (`src/routes/debug/orchestra-pit/`) already does harvest. It stays as the debug wrapper and gets reimplemented over the core functions.
- A public harvest endpoint follows "capability in core, policy at the edge" (same layering as #313). The SSRF guard is the one hardcoded exception.
- Web components consuming harvest output render with per-publisher `template.html` files, plus one builtin fallback template for raw blobjects.

## 1. The harvest/ingest split

- `harvest(urls, opts) → blobjects`: fetch, dispatch through the handler registry, harmonize. Never writes to the store. Built over `harmonizeSource` (`packages/core/client.js`).
- `ingest(blobjects)`: writes to the store. This is `ingestBlobject` (`packages/core/indexer.js`) surfaced as public API.
- The seams already exist internally; this change exposes them.
- Principle: acquisition and storage are always separate acts. This is the same rule as prepare() composes, never acquires.
  - On-demand harmonization is harvest with no ingest.
  - Batch indexing (#274) is harvest, then inspect/filter, then ingest all at once. After harvest it is ordinary data work and needs no OP.
- Orchestra-pit takes harmonizer and publisher params, so its output is either blobjects or a publisher's rendering of them. The core API keeps that dual output: `opts` accepts a harmonizer and an optional publisher.

## 2. Public endpoint policy

Capability lives in core; policy is applied at the edge.

1. The profile indexing rate (`policies.indexing.cooldown`) applies to harvest.
2. Profile blocking applies: banned origins and `policies.access.blocks`.
3. Indexing opt-in is not required. Opt-out is respected: a site with an OP ignore/block signal or a banned origin cannot be harvested.
4. A per-target-origin fetch budget, shared across all clients, applies in addition to per-client limits. The relay must not become a scraper for hire.
5. The User-Agent names the relay URL, so targets can block or limit it.
6. Responses are cached with a short TTL, keyed by URL + harmonizer.
7. Hard per-request budgets: fetch timeout, response byte cap (precedent: the sanitizer's 100 KB richContent cap), batch URL-count cap, bounded concurrency.
8. No recursion. Harvested content never queues its own discovered URLs; harvest is one hop.
9. The SSRF guard is hardcoded core behavior and is never profile-configurable:
   - refuse private/internal addresses (localhost, RFC-1918, link-local, cloud metadata IPs);
   - http(s) only;
   - re-validate after redirects and after DNS resolution (rebinding).
10. Rates, budgets, and cache TTL can live in the profile next to the indexing rate. The SSRF block cannot.

## 3. Template contract for consuming web components

1. A publisher may ship `template.html` in its folder under `static/publishers/<name>/`, found by the same discovery walk. Publishers without one get the fallback.
2. Each publisher owns its display template. Formats are unbounded, so there is no universal template.
3. The blobject-only case (re-harmonize, no publisher) gets one builtin default template with a fixed schema that renders documentRecord keys generically. It is the component's fallback, not a second template system.
4. Templates stay simple and are explicitly not a CMS:
   - native HTML `<template>` with named slots; slot name = field name;
   - no expression language, no conditionals;
   - the component owns iteration and clones the item template once per array element; the template renders one item;
   - computed display values are the renderer's job, never the template's.
5. Non-HTML outputs (ics, rss) either ship a trivial template, such as a subscribe/download/open link (what tlo-cal wants), or opt out.
6. Trust: templates are relay-served markup injected into the consuming page, at the same trust level as the component script. This needs attention for third-party relays.
7. The component (working name `<octo-harvest>`, possibly merged with the demo site's post-list stub) is post-0.7 and comes after the endpoint.

## 4. Sequencing

1. The core split is designed and built as part of #274 (in-milestone).
2. The endpoint and its policy belong to the same design. Whether it is exposed is decided at implementation.
3. The component and templates are post-0.7.
4. TLO: harvest output piped through the tlo-doc/tlo-cal publishers is the output half of #318's round-trip.

## Open questions

- Naming: harvest/ingest, or something else.
- Whether the public endpoint ships in v0.7 or waits.
- Where the response cache lives: memory or store. Operational state stays out of the triplestore per the triplestore philosophy, which points to memory or another non-triplestore cache.
