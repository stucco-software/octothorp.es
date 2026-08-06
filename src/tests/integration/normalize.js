// Canonicalize a /get debug payload so golden comparisons are deterministic and
// target-independent:
//  - volatile index-time date fields (created-derived) are DROPPED entirely;
//    determinism relies on source-controlled postDate instead (present -> stable
//    value that matches; absent -> null that matches). The created-based `date`
//    field is regenerated on every wipe+reindex, so it can never be part of a
//    stable golden.
//  - the active instance origin in any string -> "{INSTANCE}"
//  - arrays sorted by a stable key (removes run-to-run ordering drift)
//  - enrichment on out-of-scope object rows is NULLED (see OUT_OF_SCOPE_KEYS)

const VOLATILE_DATE_KEYS = new Set(['date', 'created', 'indexed'])

// `role: "object"` rows are link *targets*, which for the devdemo set are mostly
// third-party URIs. buildSimpleQuery enriches them via OPTIONAL clauses, so
// title/description/image bind only if that target has independently been
// indexed as a page on the instance under test — i.e. they assert on database
// state the smoketest neither seeds nor controls (#258). Null them so the
// fixture depends only on the scoped origin.
const OUT_OF_SCOPE_KEYS = ['title', 'description', 'image']

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

const hostOf = (uri) => {
  try { return new URL(uri).host } catch { return null }
}

/**
 * @param {*} value - parsed JSON payload (typically an array of records)
 * @param {{ instanceOrigin?: string, scopeHost?: string }} opts
 *   instanceOrigin - e.g. "http://localhost:5173" (no trailing slash)
 *   scopeHost      - host of the origin under test, e.g. "nimdaghlian.github.io".
 *                    When set, enrichment on object rows outside it is nulled.
 * @returns {*} normalized deep copy
 */
export const normalize = (value, opts = {}) => {
  const { instanceOrigin, scopeHost } = opts

  const isOutOfScopeObjectRow = (node) =>
    scopeHost &&
    node.role === 'object' &&
    typeof node.uri === 'string' &&
    hostOf(node.uri) !== scopeHost

  const walk = (node) => {
    if (Array.isArray(node)) {
      const arr = node.map(walk)
      arr.sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
      return arr
    }
    if (node && typeof node === 'object') {
      const stripEnrichment = isOutOfScopeObjectRow(node)
      const out = {}
      for (const [k, v] of Object.entries(node)) {
        if (VOLATILE_DATE_KEYS.has(k)) continue // drop created-derived dates entirely
        out[k] = stripEnrichment && OUT_OF_SCOPE_KEYS.includes(k) ? null : walk(v)
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
