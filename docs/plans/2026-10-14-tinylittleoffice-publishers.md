# Tiny Little Office publishers

Date: 2026-10-14
Status: design, not started

## Goal

Two OP publishers that output Tiny Little Office (TLO) links:

1. `tlo-cal` — a whole result set as one TLO calendar, one event per page, dated by `postDate`.
2. `tlo-doc` — each page as a TLO Word Processor document, built from the page title and `documentRecord.richContent`, kept under 2,000 characters.

TLO (https://github.com/aboard-io/tinylittleoffice) stores a whole document in the URL fragment. Nothing is uploaded; the link is the document.

## TLO encoding

Two link forms open the same document:

| Form | Shape | Needs |
|---|---|---|
| Plain | `https://tinylittleoffice.com/<app>/#doc=<percent-encoded TLO>&title=<t>&by=<b>` | `encodeURIComponent` |
| Packed | `https://tinylittleoffice.com/<app>/#/v1/<app>/<payload>` | `link()` from the `tinylittleoffice` npm package |

TLO text is Markdown with additions. TLO's guidance: keep a link under 2,000 characters; every space and newline is significant.

**Decision: plain form, no dependency.** Publishers under `static/publishers/` are loaded eagerly, and a missing dependency in any of them 500s every `/get/` route. The plain form needs only string encoding. The packed form is shorter and would raise how much content fits; revisit it if the 2,000-character budget proves too tight for `tlo-doc` (see Open questions).

Both publishers set `by=octothorpes` and pass a `title=` so the TLO page is named.

## Shared helper

A small module inside each publisher folder (duplicated, or a shared `static/publishers/_tlo/` file if the loader tolerates a non-publisher folder — check `packages/core/discover.js`):

- `tloLink(app, text, { title, by })` — returns the plain-form URL.
- `tloInline(str)` — makes untrusted text safe for a single TLO line: collapse whitespace and newlines to one space, strip `{`/`}` (TLO attribute syntax), escape Markdown control characters (`*`, `_`, `` ` ``, `[`, `]`, `#` at line start, `>` at line start, `---` lines), trim.
- `fits(url, max = 2000)` — length check on the final encoded URL, not the raw text.

All titles, descriptions and content come from member pages and are untrusted. Escaping must stop them from opening a fence, starting front matter, adding attributes, or nesting list items.

## Publisher 1: `tlo-cal`

**Shape:** feed-level, like the built-in `ics` publisher. One response for the whole result set.

**Resolver schema:**

```json
{
  "url":   { "from": "@id", "required": true },
  "title": { "from": ["title", "@id"], "required": true },
  "date":  { "from": "postDate", "postProcess": { "method": "date", "params": "iso8601" }, "required": true }
}
```

Items without `postDate` are dropped by `required`. A fallback to `date` (indexing time) is deliberately left out: indexing time is not when the post happened, and a calendar full of indexing dates is misleading.

**Envelope:** `{ title: 'Octothorpes Calendar' }`, overridable per request the same way `ics` is.

**Render:**

1. Sort items by date, newest first.
2. For each, emit `- YYYY-MM-DD: <tloInline(title)>` (date only; drop time).
3. Add lines while `tloLink('cal', text, { title: envelope.title })` stays under 2,000 characters; stop at the first one that would overflow.
4. Return `{ app: 'cal', link, count, dropped }`, where `dropped` is how many items didn't fit.

**Linking back to the source page:** TLO's calendar format doesn't say whether an event line can carry a Markdown link. If it can, emit `[title](url)`; if not, the calendar has titles only and the source URLs are lost. Verify before building (Open questions).

**Content type:** `application/json`.

## Publisher 2: `tlo-doc`

**Shape:** per-record. One TLO link per page.

**Resolver schema:**

```json
{
  "url":     { "from": "@id", "required": true },
  "title":   { "from": ["title", "@id"], "required": true },
  "content": { "from": "documentRecord.richContent" },
  "description": { "from": "description" }
}
```

`documentRecord.richContent` is sanitized HTML (up to 100 KB) captured by the default harmonizer from `[data-octo-content='rich']`, `[data-octo-content='rich-content']` or `.octo-content`. It only appears on the blobject when the instance profile declares it in `api.documentRecord`. Pages without it fall back to `description`; pages with neither get a title-and-source-link document.

**HTML to TLO Markdown:** the sanitizer (`packages/core/sanitizeHtml.js`) removes dangerous attributes and URLs but otherwise keeps arbitrary HTML, so the converter must handle anything. Walk the tree with `linkedom` (already a dependency, used by the `readable` publisher) and map:

| HTML | TLO |
|---|---|
| `h1`–`h2` | `## ` (the document title is reserved for `# ... {.title}`) |
| `h3`–`h6` | `### ` |
| `p` | paragraph, blank line after |
| `ul`/`ol` `li` | `- ` / `1. `, two spaces per nesting level |
| `blockquote` | `> ` lines |
| `strong`/`b`, `em`/`i`, `code` | `**`, `*`, `` ` `` |
| `a[href]` | `[text](href)` when href is http(s), else text only |
| `br` | newline |
| anything else (`img`, `table`, `script`, `style`, forms, embeds) | text content only, or dropped for `script`/`style` |

No tables, images or TLO fences in v1.

**Render, per item:**

1. Head: `# <tloInline(title)> {.title}`.
2. Body: converted blocks.
3. Footer: `[Source](<url>)` — always present.
4. If the link is over 2,000 characters, drop whole blocks from the end of the body until it fits, then add `[Read the rest](<url>)` before the footer. If the head and footer alone don't fit (very long URL or title), truncate the title.
5. Return `{ url, link, truncated }` per item.

Trimming must work on whole blocks: cutting mid-block can split a percent-escape or leave an unclosed `**` or link.

**Content type:** `application/json`, an array of the per-item results.

## Location and loading

- `static/publishers/tlo-cal/{resolver.json,renderer.js}`
- `static/publishers/tlo-doc/{resolver.json,renderer.js}`

Follow `static/publishers/_example/` and `readable/`. Extensions must be plain ESM/JSON at the built path; no source-tree imports.

Requested via the `as` route segment, e.g. `/get/everything/thorped/tlo-cal?o=demo`.

## Testing

- Unit tests in `src/tests/` with fixture blobjects:
  - escaping: titles containing newlines, `{.title}`, `---`, leading `- `, `[x](y)`, backticks
  - `tlo-cal`: missing `postDate` dropped, ordering, the 2,000 cap and `dropped` count
  - `tlo-doc`: each HTML mapping, nested lists keep two-space indentation, block-wise truncation, `richContent` → `description` → none fallback
  - every output URL ≤ 2,000 characters and round-trips: `decodeURIComponent` of the `doc=` value equals the generated text
- Development-only check (not a test dependency): run sample outputs through `npx tinylittleoffice lint` / `read` to confirm TLO parses them as intended.

## Open questions

1. **Links in calendar events.** Does `- 2026-10-12: [Title](https://…)` render as a link in TLO's calendar? Check with `npx tinylittleoffice try cal -`. Decides whether `tlo-cal` can point back to source pages.
2. **`postDate` units.** The blobject stores `postDate` as `parseInt` of the stored value. Confirm the `date` postProcess reads it in the right unit (ms vs s) before trusting the calendar dates.
3. **Plain vs packed for `tlo-doc`.** If real `richContent` routinely truncates to a sentence or two, the packed form (compressed) may be worth adding `tinylittleoffice` as a core dependency. Measure on devdemo pages first.
4. **Shared helper location.** Whether `discover.js` skips a helper folder under `static/publishers/` or tries to register it as a publisher.
5. **Response shape for `tlo-cal`.** JSON `{ link }` is the default. A redirect to the link (`302`) would make `/get/.../tlo-cal` usable directly as a "view calendar" URL; that needs route support, so it is out of scope for v1.
