# Code Cleanup Notes

## Unused Imports (Low Priority)

The following unused imports were identified during issue #118 implementation. They can be removed in a future cleanup pass.

### `src/lib/harmonizeSource.js`

```javascript
// Line 8 - unused
import { json, error } from '@sveltejs/kit'

// Line 10 - unused
import normalizeUrl from 'normalize-url'

// Line 12 - commented-out duplicate
// import { json } from '@sveltejs/kit'
```

### `src/lib/converters.js`

```javascript
// Line 2 - unused
import { error, json } from '@sveltejs/kit';
```

## Known Duplication

`src/routes/index/+server.js` contains duplicated logic from `src/lib/indexing.js`, including its own `handleMention` function. This file does not include the terms-on-relationships handling from issue #118.

This is intentional - `/index` will be superseded by `/indexwrapper` which uses the shared `indexing.js` module.

## Broken: `index/+server.js` origin verification (#178 regression)

The old `/index` endpoint calls `verifiedOrigin(origin)` with a single argument, but `origin.js` was decoupled in the #178 core extraction work to require a second argument: `{ serverName, queryBoolean }`. This causes a `TypeError: Cannot destructure property 'serverName' of 'undefined'` on any indexing request through the old endpoint.

This does **not** affect `/indexwrapper`, which passes config correctly via `handler()`. Confirms that the old endpoint is effectively broken for origin-verified domains and should be replaced by `indexwrapper` as planned.

Discovered during #170 (postDate) testing.
