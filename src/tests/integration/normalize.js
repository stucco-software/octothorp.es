// Canonicalize a /get debug payload so golden comparisons are deterministic and
// target-independent:
//  - volatile index-time date fields (created-derived) are DROPPED entirely;
//    determinism relies on source-controlled postDate instead (present -> stable
//    value that matches; absent -> null that matches). The created-based `date`
//    field is regenerated on every wipe+reindex, so it can never be part of a
//    stable golden.
//  - the active instance origin in any string -> "{INSTANCE}"
//  - arrays sorted by a stable key (removes run-to-run ordering drift)

const VOLATILE_DATE_KEYS = new Set(['date', 'created', 'indexed'])

const sortKey = (el) => {
  if (el && typeof el === 'object') return String(el['@id'] ?? el.uri ?? JSON.stringify(el))
  return String(el)
}

/**
 * @param {*} value - parsed JSON payload (typically an array of records)
 * @param {{ instanceOrigin?: string }} opts - instanceOrigin e.g. "http://localhost:5173" (no trailing slash)
 * @returns {*} normalized deep copy
 */
export const normalize = (value, opts = {}) => {
  const { instanceOrigin } = opts

  const walk = (node) => {
    if (Array.isArray(node)) {
      const arr = node.map(walk)
      arr.sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
      return arr
    }
    if (node && typeof node === 'object') {
      const out = {}
      for (const [k, v] of Object.entries(node)) {
        if (VOLATILE_DATE_KEYS.has(k)) continue // drop created-derived dates entirely
        out[k] = walk(v)
      }
      return out
    }
    if (typeof node === 'string' && instanceOrigin) {
      return node.split(instanceOrigin).join('{INSTANCE}')
    }
    return node
  }

  return walk(value)
}
