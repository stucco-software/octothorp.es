# iCalendar Handler + Calendar Demo Pipeline — Design

**Date:** 2026-06-11
**Status:** Approved, ready for planning

## Summary

Add the ability to ingest calendar events into OP from public iCalendar
(`.ics`) feeds. Two deliverables, clearly separated:

1. **A production-ready `calendar` handler** (`@octothorpes/core`) that
   harmonizes a single VEVENT into a blobject.
2. **A demo pipeline** — an extension of the existing
   `debug/orchestra-pit/paste` route — that takes a human Google Calendar URL,
   resolves it to a feed, splits it into VEVENTs, runs each through the handler,
   and accumulates the resulting blobjects into a unified JSON feed across
   multiple calendars. Demo-grade, not production.

## Background / Discovery

We probed several real Google Calendar links to learn what is actually
retrievable server-side (no auth, no JS):

| Input | Server-side yield |
|---|---|
| Public calendar (`?cid=…` → `/public/basic.ics`) | Full VEVENTs — rich, structured, no auth |
| Private calendar (`?cid=…`) | 404, nothing |
| Invite link (`calendar.app.google/…`) | Open Graph title/image only; dates are JS-rendered |

Key facts established:

- A `?cid=<base64>` calendar URL base64-decodes to a calendar address
  (`…@group.calendar.google.com`). When the calendar is **public**, the feed
  lives at
  `https://calendar.google.com/calendar/ical/<urlencoded-address>/public/basic.ics`
  and returns `200 text/calendar` with real `BEGIN:VEVENT…` blocks. (Watch
  base64 padding when decoding — a dropped `=` truncates the address and 404s.)
- iCalendar is **not** plaintext: RFC 5545 has line folding (continuation lines
  begin with a space), property parameters (`DTSTART;TZID=…:`), value escaping
  (`\,`, `\n`), and repeatable properties (`CATEGORIES`). This grammar must be
  parsed by code — it cannot be expressed in a declarative harmonizer schema.
- Real feeds mix event origins (Google-native, Apple-imported, etc.), so any
  approach that depends on Google-specific event IDs (the `?eid=` view URL) is
  fragile and was rejected.

## Architecture Decisions

### Event identity: fragment URL, not opaque URI

Each VEVENT's subject is a **real, dereferenceable URL** of the form:

```
<feedUrl>#<UID>
```

e.g.
`https://calendar.google.com/calendar/ical/<addr>/public/basic.ics#2nsahmu5trde0cejl4et0cs2ln@google.com`

Rationale:

- It actually dereferences — HTTP ignores the fragment, so the URL resolves to
  the `.ics` document (`200 text/calendar`). Unlike `urn:uid:…`, it is a
  fetchable web address.
- The `#<UID>` fragment uniquely names the event within the document — the
  standard RDF fragment-identifier convention (a hash URI names a thing
  *described by* the document at the non-hash part).
- Universal: works for every VEVENT regardless of origin, because it depends
  only on the feed URL plus `UID`, both always available.
- Round-trips: strip the fragment, fetch the `.ics`, match `UID` to recover the
  event.

The feed URL is **not** derivable from the VEVENT alone, so the pipeline must
pass it to the handler as context (the constructed subject URL).

### Event ↔ calendar relationship: ride the event's own blobject

OP relationships are bidirectional — the API exposes **both ends** of an
`octo:octothorpes` triple (the `thorped` / `backlinked` duality). Therefore a
single edge written **from the event** is complete:

```
<feedUrl#UID> octo:octothorpes <feedUrl>
```

Querying the calendar's `backlinked` side returns its events, even though the
calendar (`<feedUrl>`) is never indexed as a subject in its own right. Both ends
just need to be URLs, which they are.

This is decisive for the handler contract. A blobject only expresses
relationships **outgoing from its own subject** (`ingestBlobject` keys
everything off `harmed['@id']`, and `recordTitle`/`recordDescription`/etc. write
only on that subject; octothorpe targets are bare links with no descriptive
properties of their own). Because the event is the subject, the
event→calendar membership edge **can** be emitted by the handler in the same
call. No separate container blobject and no fan-out aggregation step is required
for the relationship.

(Considered and rejected: a separate "calendar-container" blobject whose
subject is `<feedUrl>` and whose octothorpes link to each event. Unnecessary
given bidirectional querying. A future nicety could record calendar-level
metadata — `X-WR-CALNAME` → title for `<feedUrl>` — but it is out of scope.)

### Handler kind: dedicated `calendar` handler reusing the JSON engine

The handler's only special knowledge is **parsing the iCalendar grammar into a
plain JS object**; it then delegates extraction to the existing JSON
dot-notation engine. This mirrors exactly how the `xml` handler relates to
`json` (xml parses with `fast-xml-parser` into a tree, then calls `json`'s
`extractValues`).

- iCal parse → object like `{ SUMMARY, DTSTART, DTEND, LOCATION, DESCRIPTION,
  UID, URL, CATEGORIES: [...] }` (line-unfolded, params stripped, values
  unescaped, repeatable props as arrays).
- Then `extractValues` runs the **VEVENT harmonizer** (dot-paths) over that
  object — structurally identical to the `rss` harmonizer.

Rejected alternative: a "plaintext" handler with all VEVENT patterns in the
harmonizer. A harmonizer is a declarative field→path map and cannot encode line
folding, param stripping, or value unescaping; pushing the grammar into the
schema means brittle per-field regex. OP's format/schema split says: **grammar
in the handler, field-mapping in the harmonizer.**

Mapping stays harmonizer-driven (not hardcoded) for consistency with every other
handler and to allow remapping / vendor `X-` props without code changes. A
default `vevent` harmonizer ships in-repo (the way `rss` is the default for
`xml`) and is overridable.

## Component 1: The `calendar` Handler (production)

**Location:** `packages/core/handlers/calendar/handler.js`, registered in
`packages/core/index.js` (`createDefaultHandlerRegistry`) alongside html/json/
xml/blobject/null.

**Contract** (standard handler shape):

```js
export default {
  mode: 'calendar',
  contentTypes: ['text/calendar'],
  meta: { name: 'iCalendar Handler', description: '…' },
  harmonize,   // async (content, harmonizerSchema, options) => blobject
}
```

**Input:** the content of a **single VEVENT** (the pipeline splits the feed; the
handler is single-document, consistent with the rest of the system) plus the
constructed subject URL and feed URL passed via `options` (exact option keys to
be settled in the plan, e.g. `options.subjectUrl` / `options.feedUrl`).

**Behavior:**

1. Parse the VEVENT iCalendar block → JS object (unfold, strip params, unescape,
   arrays for repeatable props).
2. Run the resolved harmonizer (default `vevent`) via the JSON engine's
   `extractValues`.
3. Produce a blobject:
   - `@id` = the constructed `feedUrl#UID` subject URL.
   - `SUMMARY` → `title`
   - `DESCRIPTION` → `description`
   - `DTSTART` / `DTEND` → date scalar props (e.g. `startDate` / `endDate`;
     normalization of iCal date forms — `Z` UTC, `;TZID=`, all-day `VALUE=DATE`
     — to be specified in the plan)
   - `LOCATION` → `location`
   - `CATEGORIES` → hashtag octothorpes
   - `octothorpes` includes `{ type: 'link', uri: feedUrl }` — the membership
     edge (calendar surfaced via the `backlinked` side).

**Default harmonizer:** a new `vevent` harmonizer (dot-paths over the parsed
object), registered the way `rss` is, overridable by name or remote URL.

**Tests:** unit tests over real fixture VEVENTs (including Apple-imported events
with escaping and a `message:` URL; all-day events; events with/without
`LOCATION`/`CATEGORIES`). Run with `npx vitest run`.

## Component 2: The Demo Pipeline (demo-grade)

**Location:** extends `src/routes/debug/orchestra-pit/paste/` (`+page.svelte` +
`+page.server.js`). The existing raw-paste mode is **kept**; the calendar URL
flow is added alongside it.

**Server action (stateless, one URL per submit):**

1. Accept a Google Calendar URL (and keep the existing raw-text path).
2. **Resolve** the URL → feed URL:
   - If it is a Google `?cid=<base64>` URL: base64-decode (mind padding) to the
     calendar address, URL-encode it, build
     `…/calendar/ical/<addr>/public/basic.ics`.
   - Otherwise treat the input as a **direct `.ics` URL** and fetch as-is.
   - No `webcal://` or other vendors in v1.
3. Fetch the feed (expect `text/calendar`).
4. **Split** into VEVENT blocks.
5. For each VEVENT: construct `feedUrl#UID`, call the `calendar` handler →
   blobject.
6. Return the array of event-blobjects plus the resolved feed URL and calendar
   name (`X-WR-CALNAME`) for labeling. **Nothing is written to the
   triplestore** — preview only, like the paste page.

**Client (accumulation + unified feed):**

- The Svelte page holds a running list and **appends** each submission's
  blobjects to it.
- Renders the **combined, flat array** of all event-blobjects across every
  calendar submitted so far — the "unified JSON feed of different public
  calendars." Provenance is intrinsic: each blobject carries its
  `{ type: 'link', uri: feedUrl }`.
- Shows a count (e.g. "23 events from 3 calendars") and a **Clear** button to
  reset.
- No server-side session / DB (rejected as heavier with no demo benefit).

**The pitch it demonstrates:** paste calendar A → see its events; paste calendar
B → the feed grows; the output is one JSON document blending independent public
calendars into a single queryable feed.

## Out of Scope (v1)

- Container/calendar-level blobject and `X-WR-CALNAME` → calendar title.
- Inverse (calendar→event) edge written separately — unnecessary given
  bidirectional querying.
- Private calendars, invite links, `webcal://`, non-Google providers.
- ORGANIZER / ATTENDEE modeling, RRULE recurrence expansion.
- Writing demo output to the triplestore.

## Open Items for the Plan

- Exact `options` keys for passing `subjectUrl` / `feedUrl` to the handler.
- iCal date/time normalization rules (UTC `Z`, `TZID`, all-day `VALUE=DATE`) and
  the chosen blobject scalar prop names for start/end.
- Whether to hand-roll the minimal iCal parser or pull a small dependency
  (e.g. `node-ical` / `ical.js`) — weigh footprint vs. correctness on folding
  and escaping. Lean toward a tiny purpose-built unfold+parse given we only need
  VEVENT property extraction.
- VEVENT-splitting location: in the demo pipeline (per the single-document
  handler contract) vs. a shared core util.
