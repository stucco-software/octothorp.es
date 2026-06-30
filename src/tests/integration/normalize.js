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

/**
 * Normalize an RSS XML string for stable golden comparison:
 *  - volatile date elements (<pubDate>, <lastBuildDate>) replaced with {DATE}
 *  - instance origin in any string -> "{INSTANCE}"
 * The result is still valid XML and openable in a feed reader.
 *
 * @param {string} xml - raw RSS response body
 * @param {{ instanceOrigin?: string }} opts
 * @returns {string}
 */
export const normalizeRss = (xml, opts = {}) => {
  const { instanceOrigin } = opts
  let out = xml
  out = out.replace(/<pubDate>[^<]*<\/pubDate>/g, '<pubDate>{DATE}</pubDate>')
  out = out.replace(/<lastBuildDate>[^<]*<\/lastBuildDate>/g, '<lastBuildDate>{DATE}</lastBuildDate>')
  if (instanceOrigin) out = out.split(instanceOrigin).join('{INSTANCE}')
  return out
}

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
