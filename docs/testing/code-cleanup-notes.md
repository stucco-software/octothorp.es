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
