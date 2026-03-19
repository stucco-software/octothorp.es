# op-ical: Standalone ICS Calendar Client for OP

## Summary

A standalone Node.js project that fetches ICS/iCal calendar feeds, parses VEVENT entries into OP blobjects, and stores them in an OP triplestore via the `octothorpes` npm package. This is a prototype client that demonstrates ingesting non-HTML structured data into OP without modifying the harmonizer system.

## Motivation

OP currently only ingests data from HTML pages via the harmonizer pipeline. Calendar data (Google Calendar, iCal feeds, meetup schedules) is structured data in ICS format -- not HTML. Rather than extending the harmonizer system immediately, this prototype takes the simpler path: parse ICS directly in the client, map VEVENT properties to blobject fields, and use the `octothorpes` core indexer helpers to store them.

This validates the concept of non-HTML ingestion into OP and informs future harmonizer work (a dedicated `"ical"` or `"json"` harmonizer mode).

## Scope

### In scope

- Standalone project (own repo, own `package.json`)
- Fetch a remote ICS feed by URL
- Parse VEVENTs using `node-ical`
- Map VEVENT properties to blobject fields
- Store each event in the triplestore via `octothorpes` indexer helpers
- CLI interface: `node --env-file=.env ingest.js <ics-url>`

### Out of scope

- Changes to the `octothorpes` core package or harmonizer system
- Recurring/scheduled fetching (cron, polling)
- UI or web interface
- VTODO, VJOURNAL, or other ICS component types
- Calendar-specific RDF predicates (DTEND, LOCATION, etc.)

## Architecture

### Project structure

```
op-ical/
  package.json       # depends on octothorpes, node-ical
  ingest.js          # the script
  .env               # instance + sparql_endpoint
```

### Data flow

```
ICS feed URL
  -> fetch ICS text
  -> node-ical parses into VEVENT objects
  -> for each VEVENT:
       -> map properties to blobject shape
       -> store via octothorpes indexer helpers
```

### VEVENT-to-blobject mapping

| VEVENT property | Blobject field | Notes |
|---|---|---|
| `URL` | `@id` | Primary identifier. Falls back to synthetic `{instance}calendar/{UID}` if no `URL` present. |
| `SUMMARY` | `title` | Direct mapping. |
| `DESCRIPTION` | `description` | Direct mapping. |
| `DTSTART` | `postDate` | Pass Date object directly; `recordPostDate` handles conversion internally. |
| `CATEGORIES` | octothorpes (terms) | Each category becomes a hashtag via `handleThorpe`. |
| `LOCATION` | -- | No blobject field. Skipped in prototype. |
| `DTEND` | -- | No blobject field. Skipped in prototype. |

### Storage path

The client creates an `octothorpes` client with `indexPolicy: 'active'` to bypass origin verification (trusted/privileged client -- the operator vouches for the data). It then uses `createIndexer` (exported from `octothorpes`) with the client's SPARQL dependencies to access the lower-level storage helpers directly.

```javascript
import { createClient, createIndexer } from 'octothorpes'

const client = createClient({
  instance: process.env.instance,
  sparql: { endpoint: process.env.sparql_endpoint },
  indexPolicy: 'active',
})

const indexer = createIndexer({
  ...client.sparql,
  harmonizeSource: async () => ({}), // stub -- not used for pre-parsed data
  instance: process.env.instance,
})
```

For each VEVENT:

1. Determine `@id`: use `URL` property if present, fall back to `{instance}calendar/{UID}` (synthetic URL so `@id` is always a valid URL -- required by indexer helpers like `createOctothorpe` which call `new URL(s)`)
2. `extantPage(id)` -- check if already stored
3. If not extant: `createPage(id)`
4. `recordTitle(id, summary)`
5. `recordDescription(id, description)`
6. `recordPostDate(id, dtstart)`
7. For each category: `handleThorpe(id, category)`
8. `recordIndexing(id)`

This bypasses `handleHTML` (expects a fetch Response object) and `handler` (runs origin checks, rate limits, cooldown) since neither applies to this use case.

## Client setup

### Dependencies

```json
{
  "name": "op-ical",
  "type": "module",
  "dependencies": {
    "octothorpes": "latest",
    "node-ical": "latest"
  }
}
```

### Environment

```env
instance=https://octothorp.es/
sparql_endpoint=http://0.0.0.0:7878
```

Same env vars as the main OP project. The client connects directly to the SPARQL endpoint.

### Usage

```bash
node --env-file=.env ingest.js https://calendar.example.com/basic.ics
```

Output: logs each event as it's processed (title, @id, categories found).

### Error handling

- If the ICS feed fails to fetch or parse: abort with an error message.
- If an individual VEVENT fails to store: log the error and continue to the next event. One bad event should not block the rest of the feed.

## Design decisions

### Why standalone, not in the OP repo

This is a prototype to validate the concept. It has no SvelteKit dependency, no harmonizer changes, and no API surface. Keeping it separate avoids coupling experimental client code to the core project.

### Why `indexPolicy: 'active'` (bypass origin checks)

Calendar feeds come from external domains (Google, Apple, etc.) that haven't registered with the OP relay. The operator running the client is making a trust decision about what data to ingest. This mirrors the orchestra-pit debug endpoint's approach.

### Why direct indexer helpers instead of `indexSource`

`indexSource` calls `handler()`, which runs the full validation pipeline (origin verification, rate limiting, cooldown, harmonizer checks). None of these apply to a trusted client ingesting pre-parsed data. The indexer already exposes all the storage helpers needed.

### Why `URL` with synthetic `UID` fallback for `@id`

`URL` is the most OP-native choice -- it's a dereferenceable URI pointing to a real webpage. But not every VEVENT has a `URL` property. When missing, the client mints a synthetic URL: `{instance}calendar/{UID}`. This is necessary because indexer helpers like `createOctothorpe` call `new URL(s)` on the `@id` -- a bare UID like `event-abc@google.com` would throw. The synthetic URL keeps `@id` always valid while preserving the UID for deduplication.

### Why `node-ical`

~200k weekly npm downloads, handles both local and remote ICS files, parses VEVENT properties into plain JS objects. Lighter and more straightforward than Mozilla's `ical.js` for this use case.

## Future work

- **Harmonizer mode for ICS**: A proper `"ical"` harmonizer mode where selectors are VEVENT property names. This would make the extraction declarative/configurable rather than hardcoded.
- **JSON harmonizer mode**: ICS can be parsed to JSON first; a `"json"` mode with JSONPath selectors would be broadly useful beyond calendars.
- **Calendar-specific predicates**: `octo:dtend`, `octo:location` in the RDF schema for calendar-native data.
- **Recurring fetch**: A cron/polling layer to re-ingest feeds on a schedule.
- **Event updates**: The prototype skips events that already exist (`extantPage` check). Future work could detect changed properties (title, description, dates) on re-runs and update existing triples.

## Testing

### Manual testing

1. Find a public ICS feed (Google Calendar public URL, university event calendar, etc.)
2. Run the script against a local SPARQL endpoint
3. Verify events appear via the OP API: `GET {instance}/get/everything/thorped?o={category}`
4. Verify individual event blobjects: `GET {instance}/get/everything/posted?s={event-url}`

### Edge cases to verify

- VEVENT with no `URL` property (should fall back to synthetic `{instance}calendar/{UID}`)
- VEVENT with no `CATEGORIES` (should store page with no octothorpes)
- VEVENT with no `DESCRIPTION` (should store page with title only)
- Malformed ICS feed (should fail gracefully with error message)
- Empty ICS feed with no VEVENTs (should exit cleanly)
- Duplicate runs of the same feed (should not create duplicate pages due to `extantPage` check)
