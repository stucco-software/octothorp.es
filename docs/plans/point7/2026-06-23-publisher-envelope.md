# Publisher Output Envelope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give OP publishers a first-class, format-neutral "envelope" concept — a declared default set of feed-level wrapper values (title/link/description/date) that every render path resolves uniformly, replacing the ad-hoc per-publisher `meta.channel` / `meta.calendar` handling.

**Architecture:** Add an optional `envelope` field to the publisher object (defaults in a canonical vocabulary). A single shared `resolveEnvelope(publisher, overrides)` helper merges per-request overrides over those defaults (or returns `undefined` for per-record publishers that declare no envelope). The HTTP route and the two *feed-producing* `createClient` methods (`get`, `publish`) call this one helper, so `render` always receives a fully-resolved envelope and never normalizes shapes itself. `prepare()` is **deliberately excluded** (see "prepare() is out of scope" below). This un-overloads `meta`: `meta` becomes publisher *identity* (name/description/lexicon), `envelope` becomes the per-output *wrapper*.

**Tech Stack:** JavaScript (ESM), Vitest. Core package `@octothorpes/core` (`packages/core/`), SvelteKit route (`src/routes/`).

## Global Constraints

- Publishers are NOT public yet — breaking changes to the publisher object shape are acceptable; no back-compat shim required.
- The transform engine (`packages/core/publish.js`: `resolve` / `publish`) must NOT change.
- Canonical envelope vocabulary is exactly: `{ title, link, description, date }`. Every publisher's `envelope` defaults and every per-request override set uses these keys; each `render` maps them to its own format syntax.
- Run tests with `npx vitest run <file>` (never `npm test` — it watches and hangs).
- Out of scope, do NOT touch: the RSS *harmonizer* parse paths (`rss.channel.link` etc. in `packages/core/harmonizers.js`, `handlers/json`, `handlers/xml`, `xmlHandler.test.js`, `core.test.js:51`); the legacy `packages/core/rssify.js` and the legacy RSS routes (`src/routes/rss/+server.js`, `src/routes/~/[thorpe]/rss/+server.js`, `src/routes/debug/[what]/[by]/load.js`); the ICS *parse* side (`handlers/calendar/parse.js`, `calendarParse.test.js`, `calendarPipeline.test.js`). These all use the word "channel"/"calendar" for unrelated concepts.
- Commit after each task.

### `prepare()` is out of scope — do NOT wire it through the envelope

`prepare()` serves **per-record** publishers (`bluesky`, `standardSiteDocument`) — its render returns an array of records for a Bridge/endpoint client to deliver, and those publishers declare no `envelope`. Envelopes are a **feed-level wrapper** concept; the two are mutually exclusive. Running `resolveEnvelope` in `prepare` would always return `undefined`, so adding an `envelope` return field or an envelope `overrides` arg there is dead weight that wrongly implies envelopes belong to the per-record path. **Leave `prepare()` exactly as it is.**

(Architectural note for context only — not work for this plan: `prepare()` is a pure, synchronous *composer*. A future per-record `context` arg — e.g. a leaflet publication id woven into a `standard.site` record — would be caller-*supplied* values; `prepare` must never *acquire* them (no auth, no I/O). That acquisition belongs to the adapter/Bridge layer, which is a separate epoch.)

---

## File Structure

- `packages/core/publishers.js` — add top-level `resolveEnvelope` export; add `envelope` to `rss2` and `ics`; rewrite `rss2Render` and `icsRender` to read the resolved envelope; `register()` carries `envelope` through the flat-shape normalization.
- `packages/core/index.js` — import + re-export `resolveEnvelope`; route `get` / `publish` through it (`prepare` untouched).
- `src/routes/get/[what]/[by]/[[as]]/load.js` — import `resolveEnvelope` from `octothorpes`; build canonical overrides and call it in the default publisher case.
- `src/tests/publish-core.test.js` — new `resolveEnvelope` describe; migrate rss2 + ics render tests.
- `src/tests/publish.test.js` — migrate the `meta.channel` assertion to `envelope`.
- `src/tests/core.test.js` — add `op.publish` envelope integration tests.
- `.claude/skills/octothorpes/publishers.md` — document the envelope concept.
- `docs/plans/point7/release notes/release-notes-development.md` — release note.

---

## Current State Notes (read before starting)

`packages/core/publishers.js` currently has a **band-aid** from a prior fix: `rss2Render` is a block-body arrow that does `const channel = feedMeta?.channel ?? feedMeta ?? {}` to tolerate both the nested `meta.channel` and a flat channel. Task 2 **removes** this band-aid — with the envelope pattern, render always receives a resolved flat envelope, so the normalization is no longer needed.

`rss2` currently stores defaults nested under `meta.channel`:
```js
meta: { name: 'RSS 2.0 Feed', channel: { title: 'Octothorpes Feed', description: 'Links from the Octothorpes network', link: 'https://octothorp.es/' } }
```
`ics` currently has no default calendar name; `icsRender` reads `feedMeta?.calendar?.name`.

The route default case (`load.js:104-125`) currently discriminates "RSS-shaped" via `publisher.meta?.channel` and builds a flat `{ title, description, link, pubDate }`.

---

## Task 1: `resolveEnvelope` helper

**Files:**
- Modify: `packages/core/publishers.js` (add top-level export, above `createPublisherRegistry`)
- Modify: `packages/core/index.js` (re-export)
- Test: `src/tests/publish-core.test.js`

**Interfaces:**
- Produces: `resolveEnvelope(publisher, overrides = {}) => object | undefined`. Returns `undefined` when `publisher.envelope` is absent. Otherwise returns `{ ...publisher.envelope, ...cleanedOverrides }` where overrides with `null`/`undefined`/`''` values are dropped (so a missing per-request value falls back to the declared default).

- [ ] **Step 1: Write the failing test**

Add at the top level of `src/tests/publish-core.test.js` (the file already imports from `../../packages/core/publishers.js` — extend that import to include `resolveEnvelope`):

```js
// at the existing import line:
import { createPublisherRegistry, resolveEnvelope } from '../../packages/core/publishers.js'

describe('resolveEnvelope', () => {
  it('returns undefined for a publisher with no envelope', () => {
    expect(resolveEnvelope({ render: () => {} })).toBeUndefined()
  })

  it('returns the declared defaults when no overrides are given', () => {
    const pub = { envelope: { title: 'Default', link: 'https://x' } }
    expect(resolveEnvelope(pub)).toEqual({ title: 'Default', link: 'https://x' })
  })

  it('lets overrides win over defaults', () => {
    const pub = { envelope: { title: 'Default', link: 'https://x' } }
    expect(resolveEnvelope(pub, { title: 'Override' })).toEqual({ title: 'Override', link: 'https://x' })
  })

  it('ignores nullish/empty overrides so defaults survive', () => {
    const pub = { envelope: { title: 'Default' } }
    expect(resolveEnvelope(pub, { title: undefined, link: '' })).toEqual({ title: 'Default' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/publish-core.test.js -t resolveEnvelope`
Expected: FAIL — `resolveEnvelope is not a function` (not yet exported).

- [ ] **Step 3: Write minimal implementation**

In `packages/core/publishers.js`, add at the top of the file (module scope, before `export const createPublisherRegistry`):

```js
/**
 * Resolve a publisher's output envelope: its declared default feed-level values
 * merged with per-request overrides (canonical vocab: title, link, description, date).
 * Returns undefined for per-record publishers that declare no envelope.
 * @param {Object} publisher - a registered publisher (with optional .envelope)
 * @param {Object} [overrides] - per-request values; nullish/empty entries are ignored
 * @returns {Object|undefined}
 */
export const resolveEnvelope = (publisher, overrides = {}) => {
  if (!publisher?.envelope) return undefined
  const clean = Object.fromEntries(
    Object.entries(overrides ?? {}).filter(([, v]) => v != null && v !== '')
  )
  return { ...publisher.envelope, ...clean }
}
```

In `packages/core/index.js`, extend the publishers re-export line (currently `export { createPublisherRegistry } from './publishers.js'`):

```js
export { createPublisherRegistry, resolveEnvelope } from './publishers.js'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/publish-core.test.js -t resolveEnvelope`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/publishers.js packages/core/index.js src/tests/publish-core.test.js
git commit -m "feat(publishers): add resolveEnvelope helper for output envelopes"
```

---

## Task 2: Migrate rss2 to the envelope

**Files:**
- Modify: `packages/core/publishers.js` (`rss2Render`, `rss2` object)
- Test: `src/tests/publish-core.test.js`

**Interfaces:**
- Consumes: `resolveEnvelope` (Task 1).
- Produces: `rss2` publisher with `meta = { name: 'RSS 2.0 Feed' }` (no `.channel`) and `envelope = { title, description, link }`. `rss2Render(items, envelope)` reads `envelope.title`, `envelope.link`, `envelope.description`, `envelope.date`.

- [ ] **Step 1: Write the failing tests**

In `src/tests/publish-core.test.js`, find the `describe('rss2 render', ...)` block. It currently contains a "should produce valid RSS XML" test and a "should fall back to the static channel defaults when passed nested pub.meta" test (the band-aid test). **Delete the band-aid test** (the one calling `pub.render(items, pub.meta)` and asserting `Octothorpes Feed`) and add these in its place:

```js
    it('renders the declared channel defaults when no overrides are given', () => {
      const pub = registry.getPublisher('rss2')
      const items = [
        { title: 'Test', link: 'https://example.com', guid: 'https://example.com', pubDate: 'Fri, 21 Jun 2024 12:00:00 GMT' }
      ]
      const xml = pub.render(items, resolveEnvelope(pub))
      expect(xml).toContain('<title>Octothorpes Feed</title>')
      expect(xml).toContain('<link>https://octothorp.es/</link>')
    })

    it('renders per-request overrides over the defaults', () => {
      const pub = registry.getPublisher('rss2')
      const xml = pub.render([], resolveEnvelope(pub, { title: '#demo', link: 'https://octothorp.es/~/demo' }))
      expect(xml).toContain('<title>#demo</title>')
      expect(xml).toContain('<link>https://octothorp.es/~/demo</link>')
      // an unspecified field falls back to the declared default
      expect(xml).toContain('<description>Links from the Octothorpes network</description>')
    })

    it('exposes channel defaults via envelope, not meta', () => {
      const pub = registry.getPublisher('rss2')
      expect(pub.meta.channel).toBeUndefined()
      expect(pub.envelope.title).toBe('Octothorpes Feed')
    })
```

Leave the existing "should produce valid RSS XML" test as-is — it passes a flat `{ title, link, description }` object directly, which is already a valid resolved envelope.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/tests/publish-core.test.js -t "rss2 render"`
Expected: FAIL — the defaults render blank (`pub.envelope` is undefined; `rss2.meta` still nests `.channel`).

- [ ] **Step 3: Implement**

In `packages/core/publishers.js`, replace the current band-aid `rss2Render` (block-body arrow with `const channel = feedMeta?.channel ?? feedMeta ?? {}`) with this expression-body version:

```js
  // The envelope is always pre-resolved (defaults + per-request overrides merged by
  // resolveEnvelope) before it reaches render, so we just read canonical fields.
  const rss2Render = (items, envelope = {}) => `
  <rss
    xmlns:atom="http://www.w3.org/2005/Atom"
    version="2.0">
    <channel>
      ${xmlTag('title', envelope.title)}
      ${xmlTag('link', envelope.link)}
      ${envelope.link ? `<atom:link href="${xmlEncode(envelope.link)}" rel="self" type="application/rss+xml" />` : ''}
      ${xmlTag('description', envelope.description)}
      ${xmlTag('pubDate', envelope.date)}
      <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
      ${items.map(rss2RenderItem).join('')}
    </channel>
  </rss>
`
```

Then change the `rss2` object's `meta` (remove the nested `channel`) and add `envelope`:

```js
  const rss2 = {
    resolver: rss2Schema,
    contentType: 'application/rss+xml',
    meta: {
      name: 'RSS 2.0 Feed',
    },
    envelope: {
      title: 'Octothorpes Feed',
      description: 'Links from the Octothorpes network',
      link: 'https://octothorp.es/',
    },
    render: rss2Render,
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/tests/publish-core.test.js -t "rss2 render"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/publishers.js src/tests/publish-core.test.js
git commit -m "feat(publishers): rss2 stores channel defaults as an envelope"
```

---

## Task 3: Migrate ics to the envelope

**Files:**
- Modify: `packages/core/publishers.js` (`icsRender`, `ics` object)
- Test: `src/tests/publish-core.test.js`

**Interfaces:**
- Consumes: `resolveEnvelope` (Task 1).
- Produces: `ics` publisher with `envelope = { title: 'Octothorpes Calendar' }`. `icsRender(items, envelope)` reads `envelope?.title` for `X-WR-CALNAME`.

- [ ] **Step 1: Write the failing tests**

In `src/tests/publish-core.test.js`, find the ICS describe block. There is an existing test that calls `pub.render(items, { calendar: { name: 'My OP Feed' } })` and asserts `X-WR-CALNAME:My OP Feed`. **Replace that test** with the two below (adjust the surrounding `describe` indentation to match):

```js
    it('uses the envelope title as X-WR-CALNAME', () => {
      const pub = registry.getPublisher('ics')
      const event = { '@id': 'https://example.com/e', title: 'Launch', startDate: '2026-07-01T10:00:00Z' }
      const items = publish([event], pub.resolver)
      const ics = pub.render(items, resolveEnvelope(pub, { title: 'My OP Feed' }))
      expect(ics).toContain('X-WR-CALNAME:My OP Feed')
    })

    it('falls back to the default calendar name', () => {
      const pub = registry.getPublisher('ics')
      const ics = pub.render([], resolveEnvelope(pub))
      expect(ics).toContain('X-WR-CALNAME:Octothorpes Calendar')
    })
```

(`publish` is already imported in this test file. If the ICS describe defines its own sample event variable, you may reuse it instead of the inline `event`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/tests/publish-core.test.js -t "CALNAME"`
Expected: FAIL — `icsRender` reads `feedMeta?.calendar?.name`, so `{ title: ... }` produces no `X-WR-CALNAME`, and there is no default.

- [ ] **Step 3: Implement**

In `packages/core/publishers.js`, change the calendar-name line inside `icsRender` (currently `const calName = feedMeta?.calendar?.name`):

```js
  const icsRender = (items, envelope) => {
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Octothorpes//OP ICS Publisher//EN',
      'CALSCALE:GREGORIAN',
    ]
    const calName = envelope?.title
    if (calName) lines.push(icsLine('X-WR-CALNAME', calName))
    for (const item of items) lines.push(...icsRenderEvent(item))
    lines.push('END:VCALENDAR')
    return lines.join('\r\n') + '\r\n'
  }
```

Add `envelope` to the `ics` object:

```js
  const ics = {
    resolver: icsSchema,
    contentType: 'text/calendar',
    meta: {
      name: 'iCalendar Feed',
      description: 'Publishes dated blobjects as an iCalendar (.ics) VCALENDAR feed',
    },
    envelope: {
      title: 'Octothorpes Calendar',
    },
    render: icsRender,
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/tests/publish-core.test.js -t "CALNAME"`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/publishers.js src/tests/publish-core.test.js
git commit -m "feat(publishers): ics calendar name via envelope with a default"
```

---

## Task 4: `register()` carries `envelope` through the flat shape

**Files:**
- Modify: `packages/core/publishers.js` (`register`)
- Test: `src/tests/publish-core.test.js`

**Interfaces:**
- Consumes: `resolveEnvelope` (Task 1).
- Produces: a flat-shape site publisher that declares a top-level `envelope` keeps it after registration (the explicit shape already passes it through unchanged).

- [ ] **Step 1: Write the failing test**

In `src/tests/publish-core.test.js`, inside the `describe('register', ...)` block, add:

```js
    it('preserves a flat publisher\'s envelope after registration', () => {
      const reg = createPublisherRegistry()
      const flat = {
        '@context': 'http://example.com',
        '@id': 'http://example.com/f',
        '@type': 'resolver',
        contentType: 'text/plain',
        meta: { name: 'F' },
        envelope: { title: 'Default Feed' },
        schema: { name: { from: 'title', required: true } },
        render: (items, env) => env?.title ?? '',
      }
      reg.register('f', flat)
      const pub = reg.getPublisher('f')
      expect(resolveEnvelope(pub, { title: 'Live' })).toEqual({ title: 'Live' })
      expect(resolveEnvelope(pub)).toEqual({ title: 'Default Feed' })
    })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/publish-core.test.js -t "preserves a flat publisher"`
Expected: FAIL — the flat-shape normalization drops `envelope`, so `pub.envelope` is undefined and `resolveEnvelope` returns `undefined`.

- [ ] **Step 3: Implement**

In `packages/core/publishers.js`, in `register()`, add `envelope` to the flat-shape normalization object (the `isFlat ? {...}` branch):

```js
    const normalized = isFlat
      ? { resolver: publisher, contentType: publisher.contentType, meta: publisher.meta ?? {}, envelope: publisher.envelope, render: publisher.render }
      : publisher
```

(The explicit-shape branch — `: publisher` — already carries `envelope` if the object has one; no change needed there.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/publish-core.test.js -t "preserves a flat publisher"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/publishers.js src/tests/publish-core.test.js
git commit -m "feat(publishers): carry envelope through flat-shape registration"
```

---

## Task 5: Route `get` / `publish` through `resolveEnvelope`

**Files:**
- Modify: `packages/core/index.js` (`get`, `publish` — **NOT** `prepare`; see "prepare() is out of scope")
- Test: `src/tests/core.test.js`, `src/tests/publish.test.js`

**Interfaces:**
- Consumes: `resolveEnvelope` (Task 1), the rss2 envelope (Task 2).
- Produces:
  - `client.publish(data, publisherOrName, overrides?)` — third arg is now per-request envelope overrides (was `meta`); render receives `resolveEnvelope(pub, overrides)`.
  - `client.get(...)` — RSS/ICS now render their declared defaults (was blank).
  - `client.prepare(...)` — **unchanged.** Stays the pure per-record path.

- [ ] **Step 1: Write the failing tests**

In `src/tests/core.test.js`, add (near the other `createClient` publisher tests; `createClient` is already imported there):

```js
  it('op.publish merges envelope overrides for rss', () => {
    const op = createClient({ instance: 'http://localhost:5173/', sparql: { endpoint: 'http://0.0.0.0:7878' } })
    const blobjects = [{ '@id': 'https://example.com/p', title: 'P', date: 1719057600000 }]
    const xml = op.publish(blobjects, 'rss', { title: '#demo', link: 'https://octothorp.es/~/demo' })
    expect(xml).toContain('<title>#demo</title>')   // channel title from override
    expect(xml).toContain('<title>P</title>')        // item title from blobject
  })

  it('op.publish renders rss channel defaults with no overrides', () => {
    const op = createClient({ instance: 'http://localhost:5173/', sparql: { endpoint: 'http://0.0.0.0:7878' } })
    const xml = op.publish([{ '@id': 'https://example.com/p', title: 'P', date: 1719057600000 }], 'rss')
    expect(xml).toContain('<title>Octothorpes Feed</title>')
  })
```

In `src/tests/publish.test.js`, find the assertion `expect(publisher.meta.channel).toBeDefined()` (in the `getPublisher` describe, ~line 401) and replace it with:

```js
      expect(publisher.envelope).toBeDefined()
      expect(publisher.envelope.title).toBe('Octothorpes Feed')
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/tests/core.test.js -t "op.publish" src/tests/publish.test.js -t "getPublisher"`
Expected: FAIL — `op.publish` passes raw `meta` (no merge / blank channel); `publisher.meta.channel` is now undefined.

- [ ] **Step 3: Implement**

In `packages/core/index.js`, add `resolveEnvelope` to the publishers import (currently `import { createPublisherRegistry } from './publishers.js'`):

```js
import { createPublisherRegistry, resolveEnvelope } from './publishers.js'
```

In the `get` method, change the render line (currently `const rendered = publisher.render(items, publisher.meta)`):

```js
    const rendered = publisher.render(items, resolveEnvelope(publisher))
```

Replace the `publish` method:

```js
    publish: (data, publisherOrName, overrides) => {
      const pub = typeof publisherOrName === 'string'
        ? publisherRegistry.getPublisher(publisherOrName)
        : publisherOrName
      if (!pub) throw new Error(`Unknown publisher: ${publisherOrName}`)
      const items = publish(data, pub.resolver)
      return pub.render(items, resolveEnvelope(pub, overrides))
    },
```

**Do NOT touch `prepare`.** It stays a pure per-record composer (see "prepare() is out of scope" in Global Constraints). It keeps its current signature and return shape; it does not gain envelope overrides or an `envelope` field.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/tests/core.test.js src/tests/publish.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/index.js src/tests/core.test.js src/tests/publish.test.js
git commit -m "feat(publishers): client get/publish resolve envelopes"
```

---

## Task 6: Route default case uses `resolveEnvelope`

**Files:**
- Modify: `src/routes/get/[what]/[by]/[[as]]/load.js`
- Verification: full unit suite (no regression) + manual curl against the live dev server.

**Interfaces:**
- Consumes: `resolveEnvelope` (Task 1, exported from `octothorpes`).

> Note: this SvelteKit `load.js` is exercised by the live-server integration suite (which auto-skips when the server is down), not by isolated unit tests. Verify with the full unit suite for no regressions plus a manual curl.

- [ ] **Step 1: Implement**

In `src/routes/get/[what]/[by]/[[as]]/load.js`, add `resolveEnvelope` to the `octothorpes` import (currently `import { parseBindings, rss, createPublisherRegistry, publish } from 'octothorpes'`):

```js
import { parseBindings, rss, createPublisherRegistry, publish, resolveEnvelope } from 'octothorpes'
```

Replace the body of the `default:` case (the block that builds `const channel = publisher.meta?.channel ? {...} : publisher.meta` and calls `publisher.render`):

```js
    default: {
      const publisher = params.as ? publisherRegistry.getPublisher(params.as) : null
      if (publisher) {
        const items = publish(actualResults, publisher.resolver)
        // Per-request envelope overrides in the canonical vocabulary; resolveEnvelope
        // merges them over the publisher's declared defaults and returns undefined for
        // per-record publishers that declare no envelope.
        const envelope = resolveEnvelope(publisher, {
          title: multiPass.meta?.title,
          description: multiPass.meta?.description,
          link: url.href,
          date: new Date().toUTCString(),
        })
        // render may be async (e.g. publishers that do per-item network I/O).
        // Pass SvelteKit's fetch as an option so publishers can use it.
        const rendered = await publisher.render(items, envelope, { fetch })
        return {
          rendered,
          contentType: publisher.contentType,
          publisher: params.as,
        }
      }
      return { results: actualResults }
    }
```

- [ ] **Step 2: Run the full unit suite to verify no regression**

Run: `npx vitest run`
Expected: PASS (all non-skipped). The integration tests that hit the live server remain skipped if the server is down.

- [ ] **Step 3: Manual verification against the live dev server**

With the dev server running (`instance` in `.env` = `http://localhost:5173/`):

Run: `curl -s -D - "http://localhost:5173/get/everything/thorped/rss?o=demo" -o /tmp/op-rss.xml; grep -m1 -i "content-type" /tmp/op-rss.xml; grep -m1 "<title>" /tmp/op-rss.xml`
Expected: `Content-Type: application/rss+xml`; the first `<title>` is the channel title (the queried term/page title, or the `Octothorpes Feed` default if the query has none).

Run: `curl -s "http://localhost:5173/get/everything/thorped/ics?o=demo" | grep -i "X-WR-CALNAME"`
Expected: `X-WR-CALNAME:Octothorpes Calendar` (the default) — confirms the ICS envelope default now reaches the route, which it never did before.

- [ ] **Step 4: Commit**

```bash
git add "src/routes/get/[what]/[by]/[[as]]/load.js"
git commit -m "feat(publishers): route resolves output envelope generically"
```

---

## Task 7: Document the envelope pattern + release note

**Files:**
- Modify: `.claude/skills/octothorpes/publishers.md`
- Modify: `docs/plans/point7/release notes/release-notes-development.md`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Update the publishers sub-skill**

In `.claude/skills/octothorpes/publishers.md`:

Update the publisher-contract code block to include `envelope`:

```js
{
  resolver,      // a resolver: { '@context', '@id', '@type':'resolver', schema: {...} }
  contentType,   // MIME string, e.g. 'text/calendar'
  meta,          // { name, description, ... } — static publisher identity
  envelope,      // OPTIONAL: default feed-level wrapper values in canonical vocab
                 //   { title, link, description, date }. Absent = per-record publisher.
  render,        // (items, envelope, opts?) => string | object
}
```

Add a short section after the contract (before "The one decision that matters"):

```markdown
## Output envelope (feed-level wrapper)

Formats that wrap their items in a container (RSS `<channel>`, ICS `VCALENDAR`/`X-WR-CALNAME`, Atom/JSON-Feed feed metadata) declare an **`envelope`**: the default wrapper values in the canonical vocabulary `{ title, link, description, date }`. Per-record formats (Bluesky posts, ATProto records) omit `envelope`.

Every feed-producing render path resolves the envelope through one shared helper, `resolveEnvelope(publisher, overrides)` — it merges per-request overrides over the declared defaults (ignoring nullish/empty overrides) and returns `undefined` when the publisher has no envelope. The HTTP route builds overrides from the query (`title`/`description`/`link`/`date`); `client.publish(data, name, overrides)` takes them directly. `render` therefore always receives a fully-resolved flat envelope (or `undefined`) and never normalizes shapes itself. Each `render` maps the canonical fields to its syntax — RSS `title` → `<title>`, ICS `title` → `X-WR-CALNAME`.

Defaults live on the publisher (`pub.envelope`), not in `meta`. Keep `meta` for publisher identity (name/description/lexicon).

`client.prepare()` is **not** an envelope path. It serves per-record publishers (which have no envelope) and stays a pure per-record composer — see its own role notes. Envelopes are for feed-producing formats only.
```

Update the "Route flow" line that mentions building a per-request channel to reference `resolveEnvelope` and the canonical overrides instead of `publisher.meta?.channel`.

- [ ] **Step 2: Append the release note**

Append to `docs/plans/point7/release notes/release-notes-development.md`:

```markdown

## Publisher output envelope — first-class feed-level wrapper with declared defaults

Generalized the ad-hoc per-publisher feed-metadata handling (RSS `meta.channel`, ICS `feedMeta.calendar.name`) into a single **envelope** concept. A publisher may declare an optional `envelope` of default wrapper values in the canonical vocabulary `{ title, link, description, date }`; a shared `resolveEnvelope(publisher, overrides)` merges per-request overrides over those defaults (and returns `undefined` for per-record publishers). The HTTP route and the feed-producing client methods `client.get`/`publish` call this one helper, so `render` always receives a resolved envelope and no longer normalizes shapes. `client.prepare` is deliberately excluded — it serves per-record publishers (no envelope) and stays a pure per-record composer. This un-overloads `meta` (now publisher identity only) and removes the earlier `rss2Render` shape band-aid. Publishers are not public yet, so this is a deliberate breaking change to the publisher object shape.

**What changed:**
- **`packages/core/publishers.js`**: new top-level `resolveEnvelope` export; `rss2` moves its channel defaults from `meta.channel` to `envelope` and `rss2Render` reads the resolved envelope; `ics` gains a default `envelope.title` (`Octothorpes Calendar`) rendered as `X-WR-CALNAME`; `register()` carries `envelope` through flat-shape normalization.
- **`packages/core/index.js`**: re-exports `resolveEnvelope`; `get`/`publish` resolve envelopes. `publish`'s third arg is now per-request overrides. `prepare` is unchanged.
- **`src/routes/get/[what]/[by]/[[as]]/load.js`**: the default publisher case builds canonical overrides and calls `resolveEnvelope` (replacing the `publisher.meta?.channel` discriminator). ICS feeds now carry a calendar name via the route, which they never did before.
- **`.claude/skills/octothorpes/publishers.md`**: documented the envelope concept.

**Files affected:** `packages/core/publishers.js`, `packages/core/index.js`, `src/routes/get/[what]/[by]/[[as]]/load.js`, `.claude/skills/octothorpes/publishers.md`, `src/tests/publish-core.test.js`, `src/tests/publish.test.js`, `src/tests/core.test.js`.
```

- [ ] **Step 3: Run the full suite once more**

Run: `npx vitest run`
Expected: PASS (all non-skipped).

- [ ] **Step 4: Commit**

```bash
git add ".claude/skills/octothorpes/publishers.md" "docs/plans/point7/release notes/release-notes-development.md"
git commit -m "docs(publishers): document output envelope pattern"
```

---

## Self-Review

**Spec coverage:**
- Envelope field on the contract → Task 2 (rss2), Task 3 (ics), Task 4 (register passthrough). ✓
- Shared resolver helper → Task 1. ✓
- Default values declared on the publisher → Task 2 (`rss2.envelope`), Task 3 (`ics.envelope`). ✓
- Per-request override path, feed-producing callers → Task 5 (`get`/`publish`), Task 6 (route). ✓
- Per-record publishers (no envelope) unaffected → `resolveEnvelope` returns `undefined`; bluesky/standardSite/readable render args unchanged; `prepare` left untouched (verified by no-regression run in Tasks 5–6). ✓
- Canonical vocabulary `{ title, link, description, date }` → used consistently in rss2 (`date`→pubDate), ics (`title`→CALNAME), route overrides, client. ✓
- Docs → Task 7. ✓

**Type consistency:** `resolveEnvelope(publisher, overrides) => object | undefined` is defined in Task 1 and used identically in Tasks 2–6. `rss2.envelope`/`ics.envelope` keys (`title`/`link`/`description`) match what `rss2Render`/`icsRender` read. `prepare`'s signature and return shape are unchanged — no task modifies it.

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every test step shows complete assertions.

**Out-of-scope guard:** Harmonizer parse paths, legacy `rssify.js` + legacy RSS routes, and ICS parse side are explicitly excluded in Global Constraints and not referenced by any task.
