# Merge Guide: development <- main

**Date:** 2026-03-16
**Direction:** Merge `main` into `development` before deploying

## Summary

`main` is ahead by 12 commits, mostly from badge-test, Umami tracking, README cleanup, octo-index docs, and a User-Agent patch on the index fetch. `development` has ~80 commits of substantial feature work. There are no true semantic conflicts -- just overlapping edits in two files.

## File-by-file resolution

### Auto-resolve / no conflict

| File | Notes |
|------|-------|
| `README.md` | Main removed "coding break" notice. Development already lacks it. Auto-resolves or take development. |
| `docs/plans/2026-02-13-octo-index-design.md` | New file from main. Accept as-is. |
| `docs/plans/2026-02-13-octo-index-plan.md` | New file from main. Accept as-is. |
| `src/lib/badge.js` | Both branches have identical content. Auto-resolves. |
| `src/routes/debug/badge-test/+server.js` | Both branches have identical content. Auto-resolves. |

### Manual resolution required

#### `src/app.html`

**Keep development's version.** Both branches independently added the same Umami tracking script. The only difference is whitespace (tab vs spaces). Development's version matches the file's existing indentation style.

#### `src/routes/index/+server.js`

**Accept main's change (User-Agent header), then verify against development's version.** `index/+server.js` is the legacy route that remains active on production until the cutover to `indexwrapper/+server.js` + `$lib/indexing.js` is complete. Both routes must stay working and up to date. Main's commit `283d80b` added a User-Agent header to the fetch call -- accept that change. If development also modified this file, resolve in favor of development's structure but keep the User-Agent addition.

## Post-merge: apply the User-Agent fix to the other two fetch locations

Main only patched `index/+server.js`. The same fix needs to be applied to the two other files that make the same fetch call.

### `src/lib/indexing.js` (line 676)

```javascript
// BEFORE
let subject = await fetch(parsed.normalized)

// AFTER
let subject = await fetch(parsed.normalized, {
  headers: { 'User-Agent': 'Octothorpes/1.0' }
})
```

### `packages/core/indexer.js` (line 688)

Same change:

```javascript
// BEFORE
let subject = await fetch(parsed.normalized)

// AFTER
let subject = await fetch(parsed.normalized, {
  headers: { 'User-Agent': 'Octothorpes/1.0' }
})
```

### Why this matters

The User-Agent header was added because some servers reject or behave differently with default fetch user agents. All three files that fetch pages for indexing need this fix:

1. `src/routes/index/+server.js` -- legacy route, active on production until cutover
2. `src/lib/indexing.js` -- new extracted logic, used by `indexwrapper/+server.js`
3. `packages/core/indexer.js` -- framework-agnostic core package version

## Commits on main not in development

```
283d80b Adds user agent to index fetch          <-- needs manual reapplication
96ed327 Add implementation plan for octo-index.js (#190)
0a5d2d5 Add design doc for octo-index.js (#190)
4412eb6 Update README to remove coding break notice
f300b35 put cruft back in
708f4c0 Revert "remove cruft"
03db538 remove cruft
3675e56 stupid
880186a Merge pull request #186 from stucco-software/badge-test
c93e7c5 fixes
8f6a9f6 Create +server.js
d11420d Adds Umami tracking
```
