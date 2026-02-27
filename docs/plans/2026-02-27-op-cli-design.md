# OP CLI Design

**Date:** 2026-02-27
**Status:** Approved

---

## Overview

A command-line interface for the Octothorpes Protocol, built as a separate project/repo outside `octothorp.es`. The CLI is a thin shell over `@octothorpes/core` via `commander` -- it replicates existing OP functionality on the command line without adding new features.

The CLI lets someone query an OP instance, index pages, harmonize documents, and register domains from the terminal. Use cases range from personal document graph management to lightweight administration of a small OP server.

---

## Project Structure

```
op-cli/
  bin/op.js              # entry point, wires commander + config loading
  commands/
    init.js              # op init -- interactive config setup
    get.js               # op get <what> <by> [options]
    fast.js              # op fast <method> [value]
    index.js             # op index <uri> [options]
    harmonize.js         # op harmonize <url> [options]
    register.js          # op register <domain>
  lib/
    client.js            # reads config, creates OP client via createClient
    format.js            # human-readable output formatting
  package.json
```

**Dependencies:**
- `octothorpes` -- OP core package
- `commander` -- argument parsing and subcommands
- `dotenv` -- `.env` file loading

---

## Configuration

Two config files, created by `op init`:

### `.env` (gitignored) -- secrets and endpoints

```
SPARQL_ENDPOINT=http://0.0.0.0:7878
SPARQL_USER=
SPARQL_PASSWORD=
```

### `op.config.json` (safe to commit) -- public config

```json
{
  "instance": "https://octothorp.es/",
  "profile": {},
  "termColor": "magenta"
}
```

- `instance` -- the OP server URL (trailing slash required)
- `profile` -- placeholder for future content labels and policies (empty object for MVP)
- `termColor` -- ANSI color for displaying terms; defaults to `magenta` if omitted. Supported values: `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `white`

### Config resolution

The CLI looks for `.env` and `op.config.json` in the current working directory first, then falls back to `~/.config/op/`. This allows per-project configs (one OP instance per directory) with a global default.

### `op init`

Interactive prompts (via Node's built-in `readline`) that walk through setting instance, SPARQL endpoint, and credentials. Creates both files in the current directory.

---

## Commands

Each command maps directly to a `createClient` method. No new business logic.

### `op get <what> <by> [options]`

Query indexed data. Maps to `client.get({ what, by, ... })`.

```
op get everything thorped -o demo
op get pages linked -s https://example.com --limit 10
op get terms posted --when recent
op get everything thorped -o demo --raw
```

**Options:** `-s`, `-o`, `--not-s`, `--not-o`, `--match`, `--limit`, `--offset`, `--when`, `--raw`

`what` and `by` values match the existing API surface (see skill doc for full alias tables).

### `op fast <method> [value]`

Direct SPARQL queries via fast API. Maps to `client.getfast.<method>(value)`.

```
op fast terms
op fast term demo
op fast domains
op fast domain https://example.com
op fast backlinks
op fast bookmarks
```

**Options:** `--raw`

### `op index <uri> [--harmonizer name]`

Index a page. Maps to `client.indexSource(uri, { harmonizer })`.

```
op index https://example.com/post
op index https://example.com/post --harmonizer ghost
```

Prints confirmation with URI and timestamp, or error details on failure.

### `op harmonize <url> [--harmonizer name]`

Fetch a URL and harmonize it without indexing. The orchestra-pit equivalent -- inspect what OP would extract from a page.

```
op harmonize https://example.com/post
op harmonize https://example.com/post --harmonizer openGraph
```

Fetches the URL, runs `client.harmonize(html, harmonizer)`, prints the blobject.

### `op register <domain>`

Register a domain as a verified origin. Runs a direct SPARQL insert:

```sparql
INSERT DATA {
  <DOMAIN> octo:verified 'true' .
  <DOMAIN> rdf:type <octo:Origin> .
}
```

```
op register https://example.com
```

Prints confirmation on success.

### `op init`

Interactive setup. See [Configuration](#configuration) above.

---

## Output Formatting

### `--raw` flag

Dumps the JSON response directly to stdout. Pipeable and scriptable.

### Default (human-readable)

Format varies by result mode:

**Blobjects** (`get everything`, `get blobjects`):
```
── https://example.com/post ──
Title:       Post Title
Description: A post about things.
Terms:       demo, web
Links:       https://other.com (bookmark), https://third.com (link)
Indexed:     2024-01-15

── https://other.com/page ──
Title:       Other Page
Terms:       demo
Indexed:     2024-01-12
```

**Pages/Links** (`get pages`, `get backlinks`, etc.):
```
[subject] https://example.com/post    "Post Title"       2024-01-15
[object]  https://other.com/page      "Other Page"       2024-01-12
```

**Terms** (`get terms`, `fast terms`):
```
demo          2024-01-15
javascript    2024-01-10
```

**Domains** (`get domains`, `fast domains`):
```
https://example.com
https://other.site.org
```

**Fast bindings** (`fast backlinks`, `fast bookmarks`, etc.):
```
── 1 ──
s:    https://example.com/post
o:    https://other.com/page
time: 1740179856134

── 2 ──
s:    https://third.com
o:    https://example.com/post
time: 1740179800000
```

### Term color

OP Terms are displayed in magenta (configurable via `termColor` in `op.config.json`) wherever they appear -- term lists, blobject Terms lines, etc. Uses ANSI escape codes directly (no color library dependency).

### Result count

All human-readable output ends with a count line:
```
3 results
```

---

## Design Decisions

**Separate repo.** The CLI is a consumer of `@octothorpes/core`, not part of the core/site codebase. This validates the package's external API and sets the pattern for other OP client apps.

**No new features.** The CLI wraps existing `createClient` methods 1:1. Any feature gaps (like a JSON-LD local storage backend) belong in core, not here.

**Two config files.** Secrets (`.env`, gitignored) are separated from public config (`op.config.json`, committable). The config file will grow to include content labels and policies.

**Plain Node.js + commander.** Minimal dependencies, no build step, no framework overhead. Appropriate for the scope.

**No color library.** A single ANSI color for terms doesn't justify a dependency. Direct escape codes are sufficient.

**Config resolution (CWD then ~/.config/op/).** Supports both per-project and global usage without complexity.
