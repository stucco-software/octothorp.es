# iCalendar Handler + Calendar Demo Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ingest calendar events into OP from public iCalendar (`.ics`) feeds via a production-ready `calendar` handler, plus a demo page that resolves Google Calendar URLs into a unified, accumulating JSON feed of event blobjects.

**Architecture:** A new `calendar` handler parses one VEVENT block into a plain object and delegates extraction to the existing JSON dot-notation engine (`extractValues`), exactly mirroring how the `xml` handler reuses `json`. The handler stamps each event's subject `@id` as `feedUrl#UID` (a real, dereferenceable fragment URL) and adds a single `{ type: 'link', uri: feedUrl }` octothorpe — the calendar surfaces via OP's bidirectional `backlinked` side, so no separate container record is needed. The demo extends `debug/orchestra-pit/paste`: a stateless server action resolves a Google `?cid=` URL to `/public/basic.ics`, fetches, splits into VEVENTs, and runs each through the handler; the page accumulates results across submissions into one flat, provenance-tagged feed.

**Tech Stack:** JavaScript (ESM), `@octothorpes/core` (npm workspace package `octothorpes`), SvelteKit (demo route + form actions), Vitest (`npx vitest run`).

**Reference spec:** `docs/superpowers/specs/2026-06-11-icalendar-handler-design.md`

**Conventions observed in this repo:**
- Handlers live in `packages/core/handlers/<name>/handler.js`, default-export `{ mode, contentTypes, meta, harmonize }`, and are registered in `packages/core/index.js` inside `createDefaultHandlerRegistry`.
- Tests live in `src/tests/<name>.test.js` and import core via relative path `../../packages/core/...`.
- Run tests with `npx vitest run` (never `npm test` — it watches and hangs).
- The JSON engine (`packages/core/handlers/json/handler.js`) exports `extractValues`; its harmonizer schema shape is `{ subject: { s, <prop>... }, <octotype>: { o } }` and it accepts an already-parsed object as `content` (only calls `JSON.parse` when content is a string).
- Local harmonizers are defined in the `localHarmonizers` object in `packages/core/harmonizers.js`.

---

## File Structure

**Create:**
- `packages/core/handlers/calendar/parse.js` — iCalendar parsing utilities: `splitVevents`, `parseVevent`, `getUid`, `normalizeICalDate`, `parseCalendarName`. Pure, no network. Format knowledge shared by handler and demo pipeline.
- `packages/core/handlers/calendar/handler.js` — the `calendar` handler: parse one VEVENT → delegate to JSON engine → patch `@id`, dates, membership link.
- `src/tests/calendarParse.test.js` — unit tests for `parse.js`.
- `src/tests/calendarHandler.test.js` — unit tests for the handler.
- `src/routes/debug/orchestra-pit/paste/calendarPipeline.js` — demo-only helpers: `resolveCalendarUrl` (Google `cid` decode / `.ics` passthrough) and `runCalendarUrl` (resolve → fetch → split → handler). Route-local (SvelteKit ignores non-`+` files for routing).
- `src/tests/calendarPipeline.test.js` — unit tests for `resolveCalendarUrl` (pure parts only).

**Modify:**
- `packages/core/harmonizers.js` — add the `vevent` default harmonizer to `localHarmonizers`.
- `packages/core/index.js` — import + register the `calendar` handler.
- `src/routes/debug/orchestra-pit/paste/+page.server.js` — add a named `calendar` form action.
- `src/routes/debug/orchestra-pit/paste/+page.svelte` — add a Calendar-URL field and client-side accumulating unified feed.
- `docs/release-notes-development.md` — append a summary entry.

---

## Task 1: iCalendar parser — split & parse a VEVENT

**Files:**
- Create: `packages/core/handlers/calendar/parse.js`
- Test: `src/tests/calendarParse.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/tests/calendarParse.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { splitVevents, parseVevent, getUid } from '../../packages/core/handlers/calendar/parse.js'

// Real-world feed excerpt: UTC event, plus an Apple-imported event with a folded
// LOCATION line, escaped commas, and a `message:` URL.
const sampleIcs = `BEGIN:VCALENDAR
PRODID:-//Google Inc//Google Calendar 70.9054//EN
VERSION:2.0
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:SUMMON THE DARKNESS
X-WR-TIMEZONE:America/Los_Angeles
BEGIN:VEVENT
DTSTART:20220721T210000Z
DTEND:20220721T220000Z
UID:2nsahmu5trde0cejl4et0cs2ln@google.com
SUMMARY:Haircut with Haley
STATUS:CONFIRMED
END:VEVENT
BEGIN:VEVENT
DTSTART:20240405T150900Z
DTEND:20240405T172900Z
UID:C7C87A94-7BA8-4632-8F26-4A01A030DCCD
DESCRIPTION:Reservation Number: MBYRDQ
LOCATION:Portland International Airport\\n7000 NE Airport Way\\, Portland\\, O
 R 97218-1009\\, United States
SUMMARY:Flight: AS 290 from PDX to EWR
END:VEVENT
END:VCALENDAR`

describe('splitVevents', () => {
  it('returns one block per VEVENT', () => {
    const blocks = splitVevents(sampleIcs)
    expect(blocks.length).toBe(2)
    expect(blocks[0]).toContain('Haircut with Haley')
    expect(blocks[1]).toContain('Flight: AS 290')
  })
})

describe('parseVevent', () => {
  it('parses simple properties', () => {
    const block = splitVevents(sampleIcs)[0]
    const ev = parseVevent(block)
    expect(ev.UID).toBe('2nsahmu5trde0cejl4et0cs2ln@google.com')
    expect(ev.SUMMARY).toBe('Haircut with Haley')
    expect(ev.DTSTART).toBe('20220721T210000Z')
    expect(ev.STATUS).toBe('CONFIRMED')
  })

  it('unfolds continuation lines and unescapes values', () => {
    const block = splitVevents(sampleIcs)[1]
    const ev = parseVevent(block)
    // Folded across two physical lines, \\, -> , and \\n -> newline.
    expect(ev.LOCATION).toBe(
      'Portland International Airport\n7000 NE Airport Way, Portland, OR 97218-1009, United States'
    )
    expect(ev.DESCRIPTION).toBe('Reservation Number: MBYRDQ')
  })

  it('strips property parameters, keying by base property name', () => {
    const ev = parseVevent('BEGIN:VEVENT\nDTSTART;TZID=America/Los_Angeles:20240405T080000\nUID:x\nEND:VEVENT')
    expect(ev.DTSTART).toBe('20240405T080000')
    expect(ev['DTSTART;TZID']).toBeUndefined()
  })

  it('collects CATEGORIES into an array, split on unescaped commas', () => {
    const ev = parseVevent('BEGIN:VEVENT\nUID:x\nCATEGORIES:music,live show\nEND:VEVENT')
    expect(ev.CATEGORIES).toEqual(['music', 'live show'])
  })
})

describe('getUid', () => {
  it('reads UID from a raw block without full parse', () => {
    expect(getUid(splitVevents(sampleIcs)[0])).toBe('2nsahmu5trde0cejl4et0cs2ln@google.com')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/calendarParse.test.js`
Expected: FAIL — cannot resolve module `parse.js` / functions not defined.

- [ ] **Step 3: Write minimal implementation**

Create `packages/core/handlers/calendar/parse.js`:

```js
// Minimal RFC 5545 reader, scoped to what VEVENT property extraction needs:
// line unfolding, parameter stripping, value unescaping. No timezone database.

/** Unfold folded content lines: a line beginning with space or tab continues
 *  the previous line (the leading whitespace is removed). */
const unfold = (text) => {
  const out = []
  for (const raw of text.split(/\r\n|\r|\n/)) {
    if ((raw.startsWith(' ') || raw.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += raw.slice(1)
    } else {
      out.push(raw)
    }
  }
  return out
}

/** Unescape an iCalendar TEXT value: \\n and \\N -> newline, \\, \\; \\\\ literal. */
const unescapeText = (v) =>
  v.replace(/\\([nN,;\\])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c))

/** Split a value on commas that are NOT backslash-escaped. */
const splitUnescapedCommas = (v) => {
  const parts = []
  let cur = ''
  for (let i = 0; i < v.length; i++) {
    const c = v[i]
    if (c === '\\' && i + 1 < v.length) { cur += c + v[i + 1]; i++; continue }
    if (c === ',') { parts.push(cur); cur = ''; continue }
    cur += c
  }
  parts.push(cur)
  return parts
}

/** Split a VCALENDAR into the text of each VEVENT (inclusive of BEGIN/END). */
export const splitVevents = (icsText) => {
  const lines = unfold(icsText)
  const blocks = []
  let cur = null
  for (const line of lines) {
    if (line.trim() === 'BEGIN:VEVENT') { cur = [line]; continue }
    if (cur) cur.push(line)
    if (line.trim() === 'END:VEVENT') { blocks.push(cur.join('\n')); cur = null }
  }
  return blocks
}

/** Parse one VEVENT block into a plain object keyed by base property name. */
export const parseVevent = (block) => {
  const ev = {}
  for (const line of unfold(block)) {
    const colon = line.indexOf(':')
    if (colon === -1) continue
    const namePart = line.slice(0, colon)
    const value = line.slice(colon + 1)
    const name = namePart.split(';')[0].trim().toUpperCase()
    if (name === 'BEGIN' || name === 'END') continue

    if (name === 'CATEGORIES') {
      ev.CATEGORIES = [
        ...(ev.CATEGORIES || []),
        ...splitUnescapedCommas(value).map(unescapeText),
      ]
      continue
    }

    const decoded = unescapeText(value)
    if (ev[name] === undefined) {
      ev[name] = decoded
    } else {
      ev[name] = Array.isArray(ev[name]) ? [...ev[name], decoded] : [ev[name], decoded]
    }
  }
  return ev
}

/** Cheap UID read for building a subject URL without a full parse. */
export const getUid = (block) => {
  const m = unfold(block).find((l) => l.toUpperCase().startsWith('UID'))
  if (!m) return undefined
  return m.slice(m.indexOf(':') + 1).trim()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/calendarParse.test.js`
Expected: PASS (all cases in this file).

- [ ] **Step 5: Commit**

```bash
git add packages/core/handlers/calendar/parse.js src/tests/calendarParse.test.js
git commit -m "feat(calendar): minimal iCalendar VEVENT parser and splitter"
```

---

## Task 2: Date normalization and calendar-name helpers

**Files:**
- Modify: `packages/core/handlers/calendar/parse.js`
- Test: `src/tests/calendarParse.test.js:append`

- [ ] **Step 1: Write the failing test**

Append to `src/tests/calendarParse.test.js`:

```js
import { normalizeICalDate, parseCalendarName } from '../../packages/core/handlers/calendar/parse.js'

describe('normalizeICalDate', () => {
  it('converts UTC datetimes to ISO 8601 with Z', () => {
    expect(normalizeICalDate('20220721T210000Z')).toBe('2022-07-21T21:00:00Z')
  })
  it('converts all-day VALUE=DATE to a plain ISO date', () => {
    expect(normalizeICalDate('20240405')).toBe('2024-04-05')
  })
  it('converts floating/local datetimes to ISO without offset', () => {
    // No timezone database in v1: TZID-bearing local times are emitted as-is in ISO shape.
    expect(normalizeICalDate('20240405T080000')).toBe('2024-04-05T08:00:00')
  })
  it('returns the input unchanged when it is not a recognized iCal date', () => {
    expect(normalizeICalDate('not-a-date')).toBe('not-a-date')
  })
})

describe('parseCalendarName', () => {
  it('reads X-WR-CALNAME from the calendar', () => {
    const ics = 'BEGIN:VCALENDAR\nX-WR-CALNAME:SUMMON THE DARKNESS\nEND:VCALENDAR'
    expect(parseCalendarName(ics)).toBe('SUMMON THE DARKNESS')
  })
  it('returns undefined when absent', () => {
    expect(parseCalendarName('BEGIN:VCALENDAR\nEND:VCALENDAR')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/calendarParse.test.js`
Expected: FAIL — `normalizeICalDate` / `parseCalendarName` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `packages/core/handlers/calendar/parse.js`:

```js
/** Normalize an iCalendar date/date-time value to an ISO 8601 string.
 *  Handles the three common shapes; leaves anything else untouched.
 *  No timezone conversion in v1 — TZID local times become floating ISO. */
export const normalizeICalDate = (value) => {
  if (typeof value !== 'string') return value
  const utc = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/)
  if (utc) { const [, y, mo, d, h, mi, s] = utc; return `${y}-${mo}-${d}T${h}:${mi}:${s}Z` }
  const local = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/)
  if (local) { const [, y, mo, d, h, mi, s] = local; return `${y}-${mo}-${d}T${h}:${mi}:${s}` }
  const date = value.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (date) { const [, y, mo, d] = date; return `${y}-${mo}-${d}` }
  return value
}

/** Read X-WR-CALNAME from a full VCALENDAR document. */
export const parseCalendarName = (icsText) => {
  for (const line of icsText.split(/\r\n|\r|\n/)) {
    if (line.toUpperCase().startsWith('X-WR-CALNAME')) {
      return line.slice(line.indexOf(':') + 1).trim()
    }
  }
  return undefined
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/calendarParse.test.js`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add packages/core/handlers/calendar/parse.js src/tests/calendarParse.test.js
git commit -m "feat(calendar): iCal date normalization and calendar-name helpers"
```

---

## Task 3: Default `vevent` harmonizer

**Files:**
- Modify: `packages/core/harmonizers.js` (the `localHarmonizers` object, before its closing `}`)
- Test: `src/tests/calendarHarmonizer.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/tests/calendarHarmonizer.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { createHarmonizerRegistry } from '../../packages/core/harmonizers.js'

describe('vevent harmonizer', () => {
  it('is registered and declares calendar mode with the expected paths', async () => {
    const { getHarmonizer } = createHarmonizerRegistry('https://example.com/')
    const h = await getHarmonizer('vevent')
    expect(h.mode).toBe('calendar')
    expect(h.schema.subject.s).toBe('UID')
    expect(h.schema.subject.title).toBe('SUMMARY')
    expect(h.schema.subject.startDate).toBe('DTSTART')
    expect(h.schema.subject.endDate).toBe('DTEND')
    expect(h.schema.subject.description).toBe('DESCRIPTION')
    expect(h.schema.subject.location).toBe('LOCATION')
    expect(h.schema.hashtag.o).toBe('CATEGORIES')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/calendarHarmonizer.test.js`
Expected: FAIL — `Harmonizer not found`.

- [ ] **Step 3: Write minimal implementation**

In `packages/core/harmonizers.js`, add the `vevent` entry to `localHarmonizers`. Insert it immediately after the `"rss": { ... }` block (mirror its structure; note the trailing comma after `rss`):

```js
  ,"vevent": {
    "@context": context,
    "@id": `${baseId}vevent`,
    "@type": "harmonizer",
    "title": "iCalendar VEVENT Harmonizer",
    "mode": "calendar",
    "schema": {
      "subject": {
        "s": "UID",
        "title": "SUMMARY",
        "description": "DESCRIPTION",
        "startDate": "DTSTART",
        "endDate": "DTEND",
        "location": "LOCATION"
      },
      "hashtag": { "o": "CATEGORIES" }
    }
  }
```

(If the file already terminates `rss` with the object literal closing on its own line, place the comma + `vevent` block before the final `};` that closes `localHarmonizers`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/calendarHarmonizer.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/harmonizers.js src/tests/calendarHarmonizer.test.js
git commit -m "feat(calendar): default vevent harmonizer"
```

---

## Task 4: The `calendar` handler

**Files:**
- Create: `packages/core/handlers/calendar/handler.js`
- Modify: `packages/core/index.js` (import near other handler imports ~lines 7-10; register inside `createDefaultHandlerRegistry`)
- Test: `src/tests/calendarHandler.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/tests/calendarHandler.test.js`:

```js
import { describe, it, expect } from 'vitest'
import calendarHandler from '../../packages/core/handlers/calendar/handler.js'
import { createDefaultHandlerRegistry } from '../../packages/core/index.js'

const veventSchema = {
  mode: 'calendar',
  schema: {
    subject: {
      s: 'UID',
      title: 'SUMMARY',
      description: 'DESCRIPTION',
      startDate: 'DTSTART',
      endDate: 'DTEND',
      location: 'LOCATION',
    },
    hashtag: { o: 'CATEGORIES' },
  },
}

const block = `BEGIN:VEVENT
DTSTART:20220721T210000Z
DTEND:20220721T220000Z
UID:2nsahmu5trde0cejl4et0cs2ln@google.com
SUMMARY:Haircut with Haley
CATEGORIES:grooming,self care
END:VEVENT`

const feedUrl = 'https://calendar.google.com/calendar/ical/addr/public/basic.ics'

describe('calendar handler', () => {
  it('declares mode and content type', () => {
    expect(calendarHandler.mode).toBe('calendar')
    expect(calendarHandler.contentTypes).toEqual(['text/calendar'])
    expect(typeof calendarHandler.harmonize).toBe('function')
  })

  it('maps VEVENT fields into a blobject and normalizes dates', async () => {
    const blob = await calendarHandler.harmonize(block, veventSchema)
    expect(blob.title).toBe('Haircut with Haley')
    expect(blob.startDate).toBe('2022-07-21T21:00:00Z')
    expect(blob.endDate).toBe('2022-07-21T22:00:00Z')
  })

  it('uses options.subjectUrl as @id and adds the calendar membership link', async () => {
    const subjectUrl = `${feedUrl}#2nsahmu5trde0cejl4et0cs2ln@google.com`
    const blob = await calendarHandler.harmonize(block, veventSchema, { subjectUrl, feedUrl })
    expect(blob['@id']).toBe(subjectUrl)
    expect(blob.octothorpes).toContainEqual({ type: 'link', uri: feedUrl })
    // CATEGORIES become hashtag octothorpes (bare strings).
    expect(blob.octothorpes).toContain('grooming')
    expect(blob.octothorpes).toContain('self care')
  })

  it('falls back to the UID-derived @id when no subjectUrl is given', async () => {
    const blob = await calendarHandler.harmonize(block, veventSchema)
    expect(blob['@id']).toBe('2nsahmu5trde0cejl4et0cs2ln@google.com')
  })

  it('is registered in the default handler registry under text/calendar', () => {
    const reg = createDefaultHandlerRegistry()
    expect(reg.getHandler('calendar')).toBeTruthy()
    expect(reg.getHandlerForContentType('text/calendar')).toBe(reg.getHandler('calendar'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/calendarHandler.test.js`
Expected: FAIL — cannot resolve `handler.js`; registry has no `calendar`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/core/handlers/calendar/handler.js`:

```js
import jsonHandler from '../json/handler.js'
import { parseVevent, normalizeICalDate } from './parse.js'

/**
 * Harmonize a single VEVENT block into a blobject.
 *
 * Parses the iCalendar grammar into a plain object, then delegates field
 * extraction to the JSON handler's dot-notation engine (same relationship the
 * XML handler has to JSON). Afterwards it patches the three things the engine
 * can't know from the VEVENT alone:
 *   - the subject @id (a feedUrl#UID fragment URL passed via options)
 *   - ISO-normalized start/end dates
 *   - the membership edge to the calendar feed (one outgoing link; OP's
 *     bidirectional API surfaces it as the calendar's backlink)
 */
const harmonize = async (content, harmonizerSchema, options = {}) => {
  const schema = harmonizerSchema?.schema || harmonizerSchema
  if (!schema) throw new Error('Calendar handler requires a schema')

  const data = parseVevent(typeof content === 'string' ? content : String(content))

  // Delegate to the JSON engine. It accepts an already-parsed object as content.
  const output = jsonHandler.harmonize(data, harmonizerSchema, options)

  if (options.subjectUrl) output['@id'] = options.subjectUrl
  if (output.startDate) output.startDate = normalizeICalDate(output.startDate)
  if (output.endDate) output.endDate = normalizeICalDate(output.endDate)

  if (options.feedUrl) {
    output.octothorpes = [...(output.octothorpes || []), { type: 'link', uri: options.feedUrl }]
  }

  return output
}

export default {
  mode: 'calendar',
  contentTypes: ['text/calendar'],
  meta: {
    name: 'iCalendar Handler',
    description: 'Harmonizes a single iCalendar VEVENT into a blobject via the JSON extraction engine',
  },
  harmonize,
}
```

In `packages/core/index.js`, add the import alongside the other handler imports (after the `xmlHandler` import line):

```js
import calendarHandler from './handlers/calendar/handler.js'
```

And register it inside `createDefaultHandlerRegistry`, immediately after the `registry.register('xml', xmlHandler)` line:

```js
  registry.register('calendar', calendarHandler)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/calendarHandler.test.js`
Expected: PASS (all cases).

- [ ] **Step 5: Run the full core handler suite to check for regressions**

Run: `npx vitest run src/tests/handlerRegistry.test.js src/tests/xmlHandler.test.js src/tests/calendarHandler.test.js`
Expected: PASS — registering a new builtin must not break existing registry expectations.

- [ ] **Step 6: Commit**

```bash
git add packages/core/handlers/calendar/handler.js packages/core/index.js src/tests/calendarHandler.test.js
git commit -m "feat(calendar): calendar handler delegating to JSON engine, registered as builtin"
```

---

## Task 5: Demo URL resolver (`resolveCalendarUrl`)

**Files:**
- Create: `src/routes/debug/orchestra-pit/paste/calendarPipeline.js`
- Test: `src/tests/calendarPipeline.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/tests/calendarPipeline.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { resolveCalendarUrl } from '../routes/debug/orchestra-pit/paste/calendarPipeline.js'

describe('resolveCalendarUrl', () => {
  it('decodes a Google ?cid= URL to the public basic.ics feed', () => {
    // base64 of "h273s470s1o3628cvr6dsln2jc@group.calendar.google.com"
    const cid = 'aDI3M3M0NzBzMW8zNjI4Y3ZyNmRzbG4yamNAZ3JvdXAuY2FsZW5kYXIuZ29vZ2xlLmNvbQ'
    const url = `https://calendar.google.com/calendar/u/0?cid=${cid}`
    expect(resolveCalendarUrl(url)).toBe(
      'https://calendar.google.com/calendar/ical/h273s470s1o3628cvr6dsln2jc%40group.calendar.google.com/public/basic.ics'
    )
  })

  it('passes a direct .ics URL through unchanged', () => {
    const ics = 'https://example.com/events/feed.ics'
    expect(resolveCalendarUrl(ics)).toBe(ics)
  })

  it('throws on input that is neither a cid URL nor a .ics URL', () => {
    expect(() => resolveCalendarUrl('https://example.com/not-a-calendar')).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/calendarPipeline.test.js`
Expected: FAIL — module / `resolveCalendarUrl` not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/routes/debug/orchestra-pit/paste/calendarPipeline.js`:

```js
// Demo-only pipeline helpers for the orchestra-pit paste page. NOT production:
// it knows one provider trick (Google ?cid=) and otherwise expects a direct
// .ics URL. Nothing here writes to the triplestore.
import { splitVevents, getUid, parseCalendarName } from '../../../../../packages/core/handlers/calendar/parse.js'

/** base64-decode, tolerating missing padding (a dropped '=' is a common cause
 *  of a truncated calendar address). */
const b64decode = (s) => {
  const padded = s + '='.repeat((4 - (s.length % 4)) % 4)
  return Buffer.from(padded, 'base64').toString('utf8')
}

/**
 * Turn a human-facing calendar URL into a fetchable .ics feed URL.
 * - Google `?cid=<base64>` -> https://calendar.google.com/calendar/ical/<addr>/public/basic.ics
 * - a direct `.ics` URL -> returned unchanged
 * - anything else -> throws
 */
export const resolveCalendarUrl = (input) => {
  let u
  try { u = new URL(input) } catch { throw new Error(`Not a valid URL: ${input}`) }

  const cid = u.searchParams.get('cid')
  if (cid) {
    const address = b64decode(cid)
    return `https://calendar.google.com/calendar/ical/${encodeURIComponent(address)}/public/basic.ics`
  }

  if (u.pathname.toLowerCase().endsWith('.ics')) return input

  throw new Error(`Unrecognized calendar URL (need a Google ?cid= link or a .ics URL): ${input}`)
}

/**
 * Resolve, fetch, split, and harmonize a calendar URL into event blobjects.
 * `harmonize` is injected (bound to a handler registry + the vevent schema) so
 * this stays free of $env and is unit-testable in isolation.
 *
 * @returns {Promise<{ feedUrl: string, calendarName: string|undefined, events: object[] }>}
 */
export const runCalendarUrl = async (input, harmonize, { fetchImpl = fetch } = {}) => {
  const feedUrl = resolveCalendarUrl(input)
  const res = await fetchImpl(feedUrl)
  if (!res.ok) throw new Error(`Failed to fetch feed (${res.status}): ${feedUrl}`)
  const ics = await res.text()

  const calendarName = parseCalendarName(ics)
  const blocks = splitVevents(ics)
  const events = []
  for (const block of blocks) {
    const uid = getUid(block)
    const subjectUrl = uid ? `${feedUrl}#${uid}` : feedUrl
    events.push(await harmonize(block, { subjectUrl, feedUrl }))
  }
  return { feedUrl, calendarName, events }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/calendarPipeline.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/debug/orchestra-pit/paste/calendarPipeline.js src/tests/calendarPipeline.test.js
git commit -m "feat(calendar): demo URL resolver + fetch/split/harmonize pipeline helper"
```

---

## Task 6: `runCalendarUrl` integration test (injected fetch)

**Files:**
- Test: `src/tests/calendarPipeline.test.js:append`

- [ ] **Step 1: Write the failing test**

Append to `src/tests/calendarPipeline.test.js`:

```js
import { runCalendarUrl } from '../routes/debug/orchestra-pit/paste/calendarPipeline.js'
import calendarHandler from '../../packages/core/handlers/calendar/handler.js'

const veventSchema = {
  mode: 'calendar',
  schema: {
    subject: { s: 'UID', title: 'SUMMARY', startDate: 'DTSTART', endDate: 'DTEND', location: 'LOCATION' },
    hashtag: { o: 'CATEGORIES' },
  },
}

const feedText = `BEGIN:VCALENDAR
X-WR-CALNAME:Demo Cal
BEGIN:VEVENT
DTSTART:20220721T210000Z
UID:a@google.com
SUMMARY:Event A
END:VEVENT
BEGIN:VEVENT
DTSTART:20240405T150900Z
UID:b@google.com
SUMMARY:Event B
END:VEVENT
END:VCALENDAR`

describe('runCalendarUrl', () => {
  it('resolves, splits, and harmonizes every VEVENT with feed-derived @ids', async () => {
    const fetchImpl = async () => ({ ok: true, status: 200, text: async () => feedText })
    const harmonize = (block, options) => calendarHandler.harmonize(block, veventSchema, options)

    const url = 'https://example.com/feed.ics'
    const { feedUrl, calendarName, events } = await runCalendarUrl(url, harmonize, { fetchImpl })

    expect(feedUrl).toBe(url)
    expect(calendarName).toBe('Demo Cal')
    expect(events.length).toBe(2)
    expect(events[0]['@id']).toBe('https://example.com/feed.ics#a@google.com')
    expect(events[0].title).toBe('Event A')
    expect(events[0].octothorpes).toContainEqual({ type: 'link', uri: url })
    expect(events[1]['@id']).toBe('https://example.com/feed.ics#b@google.com')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/calendarPipeline.test.js`
Expected: PASS already for `resolveCalendarUrl` cases; the new `runCalendarUrl` block must PASS too. If `runCalendarUrl` has a bug, this is where it surfaces. (If green immediately, that is acceptable — the implementation was written in Task 5; this task locks its behavior.)

- [ ] **Step 3: Commit**

```bash
git add src/tests/calendarPipeline.test.js
git commit -m "test(calendar): runCalendarUrl resolves and harmonizes a multi-event feed"
```

---

## Task 7: Wire the demo server action

**Files:**
- Modify: `src/routes/debug/orchestra-pit/paste/+page.server.js`

- [ ] **Step 1: Add the named `calendar` action**

The existing file has `export const actions = { default: async ({ request }) => { ... } }`. Convert it to named actions: keep the existing paste logic as `paste`, add `calendar`. Replace the `export const actions = {` block's opening and the `default:` key as follows.

Change the action key `default:` to `paste:` (the existing body is unchanged), and add a sibling `calendar` action. Also add these imports at the top of the file (after the existing imports):

```js
import calendarHandler from '../../../../../packages/core/handlers/calendar/handler.js'
import { runCalendarUrl } from './calendarPipeline.js'
```

Then the actions object becomes:

```js
export const actions = {
  paste: async ({ request }) => {
    const data = await request.formData()
    const text = (data.get('text') ?? '').toString()
    const harmonizerId = (data.get('harmonizer') ?? 'default').toString()
    const explicitMode = (data.get('mode') ?? '').toString()

    if (!text.trim()) {
      return fail(400, { error: 'Paste some content to harmonize.', harmonizerId, explicitMode })
    }

    try {
      const schema = await resolveHarmonizer(harmonizerId)
      const mode = explicitMode || schema?.mode || undefined
      const result = await harmonize(text, schema, mode ? { mode } : {})
      return { result, harmonizerUsed: schema, mode: mode ?? '(registry default)', harmonizerId, explicitMode, text }
    } catch (e) {
      return fail(500, { error: e?.message ?? String(e), harmonizerId, explicitMode, text })
    }
  },

  calendar: async ({ request }) => {
    const data = await request.formData()
    const calendarUrl = (data.get('calendarUrl') ?? '').toString().trim()
    if (!calendarUrl) {
      return fail(400, { calendarError: 'Paste a Google Calendar URL or a .ics feed URL.', calendarUrl })
    }
    try {
      const schema = await resolveHarmonizer('vevent')
      const runHarmonize = (block, options) => calendarHandler.harmonize(block, schema, options)
      const { feedUrl, calendarName, events } = await runCalendarUrl(calendarUrl, runHarmonize)
      return { calendarUrl, feedUrl, calendarName, events, eventCount: events.length }
    } catch (e) {
      return fail(500, { calendarError: e?.message ?? String(e), calendarUrl })
    }
  },
}
```

- [ ] **Step 2: Verify the dev server compiles and the action runs**

Confirm the dev server is reachable (per the session checklist; ask the user to start `npm run dev` if not). Then exercise the action with the known-public calendar from the spec:

Run:
```bash
curl -s -X POST 'http://localhost:5173/debug/orchestra-pit/paste?/calendar' \
  -F 'calendarUrl=https://calendar.google.com/calendar/u/0?cid=aDI3M3M0NzBzMW8zNjI4Y3ZyNmRzbG4yamNAZ3JvdXAuY2FsZW5kYXIuZ29vZ2xlLmNvbQ' | head -c 600
```
Expected: a SvelteKit action response whose serialized payload contains `"calendarName"` (`SUMMON THE DARKNESS`) and an `events` array with multiple harmonized blobjects (look for `"title"` values like `Haircut with Haley` / `Flight: AS 290 from PDX to EWR`). A 500 mentioning fetch failure means the calendar went private or the network is blocked — note it and move on; the unit tests in Tasks 5–6 are the source of truth.

- [ ] **Step 3: Commit**

```bash
git add src/routes/debug/orchestra-pit/paste/+page.server.js
git commit -m "feat(calendar): add calendar URL action to orchestra-pit paste demo"
```

---

## Task 8: Demo UI — calendar field + accumulating unified feed

**Files:**
- Modify: `src/routes/debug/orchestra-pit/paste/+page.svelte`

**Note on the existing form:** the current single form posts to the default action. Since Task 7 renamed `default` → `paste`, the existing `<form method="POST">` must now target `?/paste`. Update it and add the new calendar form.

- [ ] **Step 1: Point the existing paste form at the renamed action**

In `+page.svelte`, change the paste form opening tag from:

```svelte
  <form method="POST" use:enhance={() => {
```
to:
```svelte
  <form method="POST" action="?/paste" use:enhance={() => {
```

- [ ] **Step 2: Add accumulation state and the calendar form**

In the `<script>` block, add below the existing `let running = false`:

```js
  // Client-side accumulation: each calendar submission appends its events to a
  // running, provenance-tagged feed. Nothing is persisted server-side.
  let feed = []
  let calendars = []      // [{ feedUrl, calendarName, count }]
  let calRunning = false

  const addToFeed = (payload) => {
    if (!payload?.events) return
    feed = [...feed, ...payload.events]
    calendars = [...calendars, {
      feedUrl: payload.feedUrl,
      calendarName: payload.calendarName ?? '(unnamed)',
      count: payload.eventCount ?? payload.events.length,
    }]
  }

  const clearFeed = () => { feed = []; calendars = [] }
```

After the closing `</form>` of the existing paste form, add the calendar form and feed display:

```svelte
  <hr />

  <h2>Unified calendar feed</h2>
  <p>
    Paste a public Google Calendar URL (the <code>?cid=…</code> link from
    “Settings → Integrate calendar → Public address”) or a direct <code>.ics</code>
    URL. Each submission resolves the feed, harmonizes every event, and
    <strong>appends</strong> to the combined feed below — blend several public
    calendars into one JSON document. Nothing is written to the triplestore.
  </p>

  <form method="POST" action="?/calendar" use:enhance={() => {
    calRunning = true
    return async ({ result, update }) => {
      if (result.type === 'success') addToFeed(result.data)
      await update({ reset: false })
      calRunning = false
    }
  }}>
    <label for="calendarUrl">Calendar URL</label>
    <input id="calendarUrl" name="calendarUrl" type="text"
           placeholder="https://calendar.google.com/calendar/u/0?cid=…" />
    <div class="row">
      <button type="submit" disabled={calRunning}>{calRunning ? 'Fetching…' : 'Add calendar'}</button>
      <button type="button" on:click={clearFeed} disabled={!feed.length}>Clear feed</button>
    </div>
  </form>

  {#if form?.calendarError}
    <section class="error"><h3>Error</h3><pre>{form.calendarError}</pre></section>
  {/if}

  {#if calendars.length}
    <section>
      <h3>{feed.length} events from {calendars.length} calendar{calendars.length === 1 ? '' : 's'}</h3>
      <ul>
        {#each calendars as c}
          <li><strong>{c.calendarName}</strong> — {c.count} events <code>{c.feedUrl}</code></li>
        {/each}
      </ul>
      <pre>{JSON.stringify(feed, null, 2)}</pre>
    </section>
  {/if}
```

- [ ] **Step 3: Add an input style**

In the `<style>` block, add a rule so the URL field matches the textarea width:

```css
  input[type="text"] { width: 100%; font-family: ui-monospace, monospace; font-size: 0.85rem; padding: 0.3rem; box-sizing: border-box; }
  hr { margin: 2rem 0; }
```

- [ ] **Step 4: Manually verify in the browser**

With the dev server running, open `http://localhost:5173/debug/orchestra-pit/paste`. Paste the known-public calendar URL from Task 7 into the Calendar URL field and click **Add calendar**. Expected: the summary shows “N events from 1 calendar”, the calendar name `SUMMON THE DARKNESS` is listed, and the combined JSON array of event blobjects renders (each with `@id` ending in `#<UID>` and an octothorpe `{ "type": "link", "uri": "<feedUrl>" }`). Submitting a second public calendar URL grows the feed and the count. **Clear feed** empties it. Confirm the original paste textarea flow still works (paste the RSS sample, Run, see a blobject).

- [ ] **Step 5: Commit**

```bash
git add src/routes/debug/orchestra-pit/paste/+page.svelte
git commit -m "feat(calendar): accumulating unified-feed UI on orchestra-pit paste demo"
```

---

## Task 9: Full test sweep + release notes

**Files:**
- Modify: `docs/release-notes-development.md`

- [ ] **Step 1: Run the whole suite**

Run: `npx vitest run`
Expected: PASS. Investigate any failure before proceeding; a new builtin handler can change registry/handler-count assertions in existing tests — fix those expectations if they enumerate builtins.

- [ ] **Step 2: Append a release-notes entry**

Open `docs/release-notes-development.md`, match the existing entry format, and append:

```markdown
## iCalendar handler + calendar demo pipeline

Adds a production-ready `calendar` handler (`@octothorpes/core`) that harmonizes a
single iCalendar VEVENT into a blobject: subject `@id` is a dereferenceable
`feedUrl#UID` fragment URL, `SUMMARY/DESCRIPTION/DTSTART/DTEND/LOCATION` map to
blobject fields (dates normalized to ISO 8601), `CATEGORIES` become hashtag
octothorpes, and a single `{ type: 'link', uri: feedUrl }` octothorpe wires each
event to its calendar (surfaced via OP's bidirectional `backlinked` side — no
separate container record). The handler parses the iCalendar grammar and
delegates field extraction to the JSON engine, mirroring the XML handler. Ships a
default `vevent` harmonizer.

A demo extension to `debug/orchestra-pit/paste` resolves a public Google Calendar
`?cid=` URL (or a direct `.ics` URL) to its feed, splits VEVENTs, harmonizes each,
and accumulates results client-side into one flat, provenance-tagged JSON feed
across multiple calendars. Preview only — nothing is written to the triplestore.

Files: `packages/core/handlers/calendar/{parse,handler}.js`,
`packages/core/harmonizers.js`, `packages/core/index.js`,
`src/routes/debug/orchestra-pit/paste/{+page.server.js,+page.svelte,calendarPipeline.js}`,
tests under `src/tests/calendar*.test.js`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/release-notes-development.md
git commit -m "docs: release notes for iCalendar handler + calendar demo pipeline"
```

---

## Self-Review Notes (for the implementer)

- **Spec coverage:** Handler kind (dedicated, reuses JSON engine) → Tasks 1–4. Fragment-URL identity → Task 4 (`options.subjectUrl`) + Task 5 (`runCalendarUrl` builds `feedUrl#UID`). Bidirectional membership link → Task 4. `cid` resolution → Task 5. Accumulating unified feed, raw-paste mode preserved → Tasks 7–8. Minimal non-Google handling (`.ics` passthrough only) → Task 5. Out-of-scope items (container blobject, recurrence, triplestore writes) are intentionally absent.
- **Type/name consistency:** `parseVevent`, `splitVevents`, `getUid`, `normalizeICalDate`, `parseCalendarName`, `resolveCalendarUrl`, `runCalendarUrl` are used with identical signatures across tasks. Handler options keys are `subjectUrl` and `feedUrl` everywhere. Harmonizer id is `vevent`, mode is `calendar`, content-type is `text/calendar` throughout.
- **Known soft spots to watch during implementation:** (1) Task 7 renames the existing `default` action to `paste`; the Svelte form in Task 8 must point at `?/paste` or the paste flow silently breaks. (2) If any existing test asserts the exact set/count of builtin handlers, Task 4/9 must update it. (3) `node-ical`/`ical.js` were considered and rejected in favor of the tiny purpose-built parser — do not add a dependency.
