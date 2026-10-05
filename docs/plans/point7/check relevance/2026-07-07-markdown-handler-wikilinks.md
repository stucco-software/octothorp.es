# Plan: Markdown handler + wikilink resolution

> **Actionable OP-core plan.** A new core handler that parses Markdown (`.md`) source — YAML frontmatter + body `[[wikilinks]]` → OP links — with an Obsidian-style, deferred, whole-instance link-resolution pass. This is **Memex-2 core dependency #2** (`~/dev/memex2/docs/memex2-op-core-dependencies.md`) but a general OP feature (any Markdown-authored corpus benefits).
>
> **Substrate:** `docs/plans/point7/handlers/2026-03-19-handler-harmonizer-design.md` (the handler pipeline, now implemented), `~/dev/memex2/docs/specs/2026-07-07-memex2-client-design.md` §5 (the resolution model in detail).
>
> **Related issues:** none for Markdown/wikilinks (confirmed — the `[[as]]` grep hits are SvelteKit optional-route syntax, not wikilinks). Neighbors: #101 (schema.org harmonizer), #177 (sitemap harmonizer) — unrelated formats. **Issue: #238.**

## Problem

Core handlers today are `blobject, calendar, html, json, xml` (`packages/core/handlers/`). There is **no Markdown handler**. Markdown-authored content (e.g. an Obsidian vault, the Memex Record `.md` files) can only reach OP by first building to HTML and harvesting anchors — which loses the ability to author links as `[[wikilinks]]` and forces a dependency on the SSG build for link harvesting.

## Goal

A `packages/core/handlers/markdown/handler.js` that, given raw Markdown + a subject URL, produces a blobject:
1. **Frontmatter (YAML)** → canonical fields (`title`, `description`, …) + declared `documentRecord` leaves (via the documentRecord projection plan — its sibling dependency).
2. **Body `[[wikilinks]]`** → plain OP links (`octo:octothorpes` edges) in the `octothorpes` array.

Plus a **resolution pass** that turns `[[basename]]` references into real URL targets, reimplementing Obsidian's semantics (we do **not** read Obsidian's private cache — it's an undocumented IndexedDB/LevelDB store).

## Resolution model (Obsidian, reimplemented)

- **Key on basename** (filename without `.md`), matching Obsidian — not frontmatter `title`.
- **Deferred, whole-instance:** index all documents first (build `basename → URL`), *then* resolve links. Handles mutual links (`A ↔ B`) that file-order resolution cannot.
- **`resolvedLinks` / `unresolvedLinks` split:** an unresolved `[[…]]` (no matching doc) is recorded as pending, **not dropped or fatal** — matches OP's tolerance for links to not-yet-indexed URLs, and is the warning surface for renames/typos.
- **Collisions → path-qualifier disambiguation** (`[[subfolder/name]]`), nearest-in-folder heuristic otherwise. No hash-suffix invention.
- Support `[[name|display]]` (alias) and `[[name#heading]]` (sub-link) parsing; the target is still `name`.

> **Memex note:** Memex resolves `basename → hash → /item/<hash>`; the generic handler resolves `basename → URL` against the instance's document index. The hash indirection is a Memex-side concern (the frontmatter carries the hash; the resolver maps basename→that document's URL). Keep the core handler generic: it resolves basenames to the URLs of indexed documents, whatever their URL scheme.

## Phases

### Phase 1 — Handler skeleton + frontmatter
- Create `packages/core/handlers/markdown/handler.js`, register it in the handler registry (mode `markdown` + content-type `text/markdown`). Mirror the HTML handler's structure (`handlers/html/handler.js`).
- Parse YAML frontmatter (reuse `js-yaml` or the project's YAML dep) → canonical fields + documentRecord passthrough (defer typing to the documentRecord projection plan).
- Input contract: `(subjectUrl, rawMarkdown)`; edges are stamped under `subjectUrl`.
- **Tests:** frontmatter → canonical fields; unknown frontmatter keys routed to documentRecord (or dropped per admission); malformed YAML handled gracefully.

### Phase 2 — Wikilink extraction (single-doc)
- Parse body `[[…]]` (incl. `|alias` and `#heading`) → a list of `{ targetBasename, alias?, section? }`. Emit them as **unresolved** link intents on the blobject (target = basename string) at this stage.
- **Tests:** simple `[[A]]`; `[[A|caption]]`; `[[A#heading]]`; multiple; none; escaped/inline-code `[[…]]` NOT treated as a link (respect code spans/fences).

### Phase 3 — Deferred whole-instance resolution
- Add a resolution pass (handler-level or a post-index step): build `basename → URL` over the instance's indexed docs; resolve link intents → URL targets; produce `resolvedLinks` / `unresolvedLinks`.
- Collision handling: path-qualifier + nearest-folder.
- Decide the home: inline against a live index vs. a post-index resolve step. **Recommend post-index resolve** (matches deferred semantics; avoids ordering bugs).
- **Tests:** mutual links `A↔B` both resolve; unresolved target lands in `unresolvedLinks` (not dropped); basename collision resolves via path qualifier; rename scenario (basename changes) surfaces old link as unresolved.

### Phase 4 — Integration + docs
- Integration: index a small `.md` set, assert the resulting graph has the expected `octothorpes` link edges and the `unresolvedLinks` report.
- Update `.claude/skills/octothorpes/handlers.md` with the Markdown handler + resolution model.
- Release note.

## Out of scope
- Auto-rewrite-on-rename (Obsidian rewrites `[[old]]`→`[[new]]`) — stateful, deferred (Memex v2).
- Full Markdown → HTML rendering (that's the SSG's job; the handler only extracts graph data).
- Reading Obsidian's cache (explicitly rejected — reimplement the model).

## Definition of done
A registered Markdown handler extracts frontmatter + `[[wikilinks]]`; a deferred resolution pass yields resolved/unresolved link sets with path-qualifier collision handling; mutual links resolve; unresolved links are reported not dropped; covered by unit + one integration test.
