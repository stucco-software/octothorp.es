---
name: project_op_harmonize_is_harmonizesource_with_profile_defaults
description: Design constraint — createClient's op.harmonize must only apply client-profile defaults to harmonizeSource, never add functionality
metadata:
  type: project
---

`harmonizeSource()` (exported from `packages/core/index.js`) is the dispatch-to-handler
entry point: it picks a handler from the handler registry by `options.mode` →
`options.contentType` → default → null (HTML is the default), then calls that
handler's `harmonize`. Shared utilities live in `harmonizerUtils.js` (renamed from
the old misleading `harmonizeSource.js`).

`createClient`'s `op.harmonize` is intended to be **exactly** `harmonizeSource()` with
default settings drawn from the client profile (client-profile work is not yet done).

**Why:** keeps one harmonization code path. `op.harmonize` is a convenience that
pre-fills defaults, not a second implementation.

**How to apply:** every default the client profile applies must map onto an option
`harmonizeSource` already accepts (`getHarmonizer`, `handlerRegistry`, `mode`,
`contentType`, `instance`). `op.harmonize` must never branch, transform inputs/outputs,
or add a capability `harmonizeSource` lacks. Today it only pre-binds `getHarmonizer`
(the instance-configured registry); when client-profile work lands it may also default
`handlerRegistry`/`defaultHandler` — still just filling existing options.

See [[only_use_core]]. Handler contract details: `octothorpes:handlers` skill.
