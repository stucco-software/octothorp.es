# op-ical: Standalone ICS Calendar Client for OP

## Summary

A standalone Node.js project that ingests calendar events into an OP triplestore via the `octothorpes` npm package. Supports two ingestion modes: bulk ICS/iCal feeds (parsed directly) and individual calendar share/invite links (HTML pages scraped for event data). This prototype demonstrates ingesting non-HTML structured data into OP without modifying the harmonizer system.

## Motivation

OP currently only ingests data from HTML pages via the harmonizer pipeline. Calendar data exists in two forms that OP can't currently handle: ICS feeds (structured text, multiple events) and calendar share/invite links (HTML pages with event details, like Google Calendar share URLs). Rather than extending the harmonizer system immediately, this prototype takes the simpler path: parse both formats directly in the client, map event properties to blobject fields, and use the `octothorpes` core indexer helpers to store them.

This validates the concept of non-HTML ingestion into OP and informs future harmonizer work (a dedicated `"ical"` or `"json"` harmonizer mode). The share link mode also demonstrates that calendar invite URLs can serve as dereferenceable `@id` values for events.

## Scope

### In scope

- Standalone project (own repo, own `package.json`)
- **ICS mode**: Fetch a remote ICS feed by URL, parse VEVENTs, store each as a blobject
- **Share link mode**: Fetch a calendar share/invite URL (HTML), scrape event details, store as a blobject
- Map event properties to blobject fields in both modes
- Store events in the triplestore via `octothorpes` indexer helpers
- CLI interface: `node --env-file=.env ingest.js <url>` (auto-detects mode from URL/content)

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

The client auto-detects the input type. If the URL points to an ICS file (by extension or content-type), it uses ICS mode. Otherwise it treats it as an HTML share link.

**ICS mode** (bulk):
```
ICS feed URL
  -> fetch ICS text
  -> node-ical parses into VEVENT objects
  -> for each VEVENT:
       -> map properties to blobject shape
       -> store via octothorpes indexer helpers
```

**Share link mode** (single event):
```
Share/invite URL (e.g. Google Calendar share link)
  -> fetch HTML
  -> scrape event details from page markup
  -> map to blobject shape (share URL becomes @id)
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

### Share link scraping (Google Calendar)

Google Calendar share/invite links render an HTML page with event details. The client fetches this page and scrapes event data using DOM parsing (e.g. `jsdom`).

Example URL: `https://calendar.google.com/calendar/u/0/share?slt=...`

| Page content | Blobject field | Notes |
|---|---|---|
| Event title | `title` | Direct mapping. |
| Date/time | `postDate` | Parse the displayed date string into a Date. |
| Notes/description | `description` | Direct mapping. |
| The share URL itself | `@id` | The invite link is the dereferenceable identifier for this event. |
| Location | -- | No blobject field. Skipped in prototype. |

The share URL is the `@id` -- it's a real, dereferenceable URL that anyone can visit to see the event. This is preferable to synthetic URIs.

The scraping selectors will be specific to Google Calendar's share page markup and may break if Google changes their HTML structure. This is acceptable for a prototype. Future work could add support for other calendar providers (Apple Calendar, Outlook, etc.) with their own selector sets.

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

For each event (from either mode):

1. Determine `@id`:
   - **Share link mode**: the share URL itself
   - **ICS mode**: `URL` property if present, fall back to `{instance}calendar/{UID}` (synthetic URL so `@id` is always a valid URL -- required by indexer helpers like `createOctothorpe` which call `new URL(s)`)
2. `extantPage(id)` -- check if already stored
3. If not extant: `createPage(id)`
4. `recordTitle(id, title)`
5. `recordDescription(id, description)`
6. `recordPostDate(id, date)`
7. For each category/tag: `handleThorpe(id, category)`
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
    "node-ical": "latest",
    "jsdom": "latest"
  }
}
```

`jsdom` is used for share link scraping (DOM parsing of HTML pages). It's already a transitive dependency of `octothorpes` via `harmonizeSource`.

### Environment

```env
instance=https://octothorp.es/
sparql_endpoint=http://0.0.0.0:7878
```

Same env vars as the main OP project. The client connects directly to the SPARQL endpoint.

### Usage

```bash
# ICS feed (bulk)
node --env-file=.env ingest.js https://calendar.example.com/basic.ics

# Google Calendar share link (single event)
node --env-file=.env ingest.js "https://calendar.google.com/calendar/u/0/share?slt=..."
```

The client detects the mode automatically: if the fetched content-type is `text/calendar` or the URL ends in `.ics`, it uses ICS mode. Otherwise it treats the URL as an HTML share page.

Output: logs each event as it's processed (title, @id, categories found).

### Error handling

- If the URL fails to fetch: abort with an error message.
- If ICS parsing fails: abort with an error message.
- If an individual VEVENT fails to store (ICS mode): log the error and continue to the next event. One bad event should not block the rest of the feed.
- If share page scraping finds no event data: abort with an error message explaining the page structure wasn't recognized.

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
- **Additional share link providers**: Apple Calendar, Outlook, Eventbrite, Meetup, etc. -- each would need its own scraping selectors.
- **Recurring fetch**: A cron/polling layer to re-ingest feeds on a schedule.
- **Event updates**: The prototype skips events that already exist (`extantPage` check). Future work could detect changed properties (title, description, dates) on re-runs and update existing triples.

## Testing

### Manual testing

**ICS mode:**
1. Find a public ICS feed (Google Calendar public URL, university event calendar, etc.)
2. Run the script against a local SPARQL endpoint
3. Verify events appear via the OP API: `GET {instance}/get/everything/thorped?o={category}`
4. Verify individual event blobjects: `GET {instance}/get/everything/posted?s={event-url}`

**Share link mode:**
1. Create a Google Calendar event and generate a share link
2. Run the script with the share link against a local SPARQL endpoint
3. Verify the event appears with the share URL as its `@id`
4. Verify title, description, and date were extracted correctly

### Edge cases to verify

**ICS mode:**
- VEVENT with no `URL` property (should fall back to synthetic `{instance}calendar/{UID}`)
- VEVENT with no `CATEGORIES` (should store page with no octothorpes)
- VEVENT with no `DESCRIPTION` (should store page with title only)
- Malformed ICS feed (should fail gracefully with error message)
- Empty ICS feed with no VEVENTs (should exit cleanly)
- Duplicate runs of the same feed (should not create duplicate pages due to `extantPage` check)

**Share link mode:**
- Google Calendar share link with all fields (title, date, location, description)
- Share link with minimal data (title and date only)
- Expired or invalid share link (should fail gracefully)
- Non-calendar HTML page (should report "no event data found")
