import { documentRecordVar, relationshipPattern, relationshipSubtypeName, RELATIONSHIP_PREDICATE } from './queryBuilders.js'
import { termName } from './utils.js'
import { RDF_NS } from './vocabulary.js'

/**
 * Coerce a raw SPARQL binding value into the JS type declared by a
 * documentRecord range (#237). Range enum (frozen):
 *   literal   -> string
 *   uri       -> string (semantically a node)
 *   timestamp -> ISO-8601 string (unix ms, unix seconds, or ISO in; ISO out;
 *                unparseable input is passed through as the raw string)
 *   number    -> JS number (non-numeric -> undefined, i.e. key dropped)
 * `boolean` is NOT in the range enum (profile.schema.json); the branch below
 * is tolerant legacy coercion only and is unreachable via a validated profile.
 * Returning `undefined` signals "do not project this key" (never emit null/NaN).
 * @param {string} raw - the binding's `.value`
 * @param {string} range
 * @returns {string|number|boolean|undefined}
 */
export const coerceDocumentRecordValue = (raw, range) => {
  const s = String(raw)
  switch (range) {
    case 'number': {
      const n = Number(s)
      return Number.isFinite(n) ? n : undefined
    }
    case 'boolean': {
      if (s === 'true' || s === '1') return true
      if (s === 'false' || s === '0') return false
      return undefined
    }
    case 'timestamp': {
      if (/^\d+$/.test(s)) {
        const num = Number(s)
        // <=10 digits is unix seconds; 11+ digits is already milliseconds.
        // (A 12-digit ms value must not be inflated 1000x.)
        const ms = s.length <= 10 ? num * 1000 : num
        const d = new Date(ms)
        return Number.isNaN(d.getTime()) ? s : d.toISOString()
      }
      const d = new Date(s)
      return Number.isNaN(d.getTime()) ? s : d.toISOString()
    }
    case 'uri':
    case 'literal':
    default:
      return s
  }
}

/**
 * Converts SPARQL query response into a structured blobject format
 * @async
 * @param {Object} response - The SPARQL query response object
 * @param {Object} [filters={}] - Filter options for processing results
 * @param {number} [filters.limitResults=100] - Maximum number of results to return
 * @param {number} [filters.offsetResults=0] - Number of results to skip
 * @param {Object|null} [filters.dateRange=null] - Date range filter object
 * @param {number} [filters.dateRange.after] - Unix timestamp for earliest date
 * @param {number} [filters.dateRange.before] - Unix timestamp for latest date
 * @param {Array<{predicate:string, range:string}>} [documentRecordSchema=[]]
 *   Declared documentRecord predicates (#237). Each present-in-storage entry is
 *   projected into `blobject.documentRecord`, typed by `range`. Declared-but-absent
 *   keys are omitted; undeclared predicates are never looped (the admission
 *   allowlist / #166 abuse guard). Empty/absent -> no `documentRecord` key
 *   (behaviour identical to before this feature). `documentRecord` is a LEAF and
 *   is never fed to link/backlink traversal. C7 wires this param from the
 *   profile's `api.documentRecord`. Entries are octo-only: `predicate` is a bare
 *   local name resolved as `octo:<predicate>`.
 * @returns {Promise<Array>} Array of processed blobjects with metadata
 */
// A relationship node can carry several types: a promoted Link is typed Link
// AND Backlink, and queries emit one row per type. Which one a blobject entry
// reports must not depend on row order. Precedence: any specific subtype
// (Bookmark, Cite, harmonizer subtypes) beats Backlink, which beats the generic
// Link ('link' is the no-reifier fallback spelling). Between two specific
// subtypes the lexically first wins, so the result is order-independent.
const subtypeRank = (t) => {
  if (!t || t.toLowerCase() === 'link') return 0
  if (t === 'Backlink') return 1
  return 2
}
export const preferSubtype = (prev, next) => {
  const a = subtypeRank(prev), b = subtypeRank(next)
  if (a !== b) return b > a ? next : prev
  if (a === 2) return next < prev ? next : prev
  return prev || next
}

const RDF_TYPE = `${RDF_NS}type`

// One octothorpes entry per (uri, subtype), from a target's reifiers, each
// `{ type, terms }` with type already reduced by preferSubtype. Specific
// subtypes each keep an entry; Backlink stands in only when there is none;
// 'link' (also an untyped reifier) only when nothing else exists. Terms on an
// absorbed reifier go to every surviving entry.
export const typedEntries = (uri, reifiers) => {
  const byType = new Map()
  for (const { type, terms } of reifiers) {
    const t = type || 'link'
    if (!byType.has(t)) byType.set(t, [])
    const acc = byType.get(t)
    for (const term of terms) if (!acc.includes(term)) acc.push(term)
  }
  const top = Math.max(...[...byType.keys()].map(subtypeRank))
  const kept = [...byType.keys()].filter(t => subtypeRank(t) === top).sort()
  const absorbed = [...byType.entries()].filter(([t]) => subtypeRank(t) !== top).flatMap(([, terms]) => terms)
  return kept.map(type => {
    const terms = [...byType.get(type)]
    for (const term of absorbed) if (!terms.includes(term)) terms.push(term)
    const entry = { uri, type }
    if (terms.length) entry.terms = terms
    return entry
  })
}

export const getBlobjectFromResponse = async (response, filters = { limitResults: 100, offsetResults: 0, dateRange: null }, documentRecordSchema = []) => {
  const limit = filters.limitResults
  const offset = filters.offsetResults

  const urlMap = {};
  const targetMaps = {};

  response.results.bindings.forEach(binding => {
    const url = binding.s.value;

    if (!urlMap[url]) {
      urlMap[url] = {
        '@id': url,
        title: null,
        description: null,
        image: null,
        date: null,
        postDate: null,
        octothorpes: []
      };
    }

    const current = urlMap[url];

    if (binding.title?.value && !current.title) {
      current.title = binding.title.value;
    }
    if (binding.description?.value && !current.description) {
      current.description = binding.description.value;
    }
    if (binding.image?.value && !current.image) {
      current.image = binding.image.value;
    }
    // A page's rows carry one candidate ?date each (the `?s ?o ?date`
    // assertion timestamp of that row's target). Keep the MAX, so the result
    // never depends on which row the engine returns first (rows tie on the
    // ORDER BY key whenever postDate is present).
    if (binding.date?.value) {
      const d = parseInt(binding.date.value);
      if (!Number.isNaN(d) && (current.date === null || d > current.date)) {
        current.date = d;
      }
    }
    if (binding.postDate?.value && !current.postDate) {
      current.postDate = parseInt(binding.postDate.value);
    }
    // Project declared documentRecord leaf predicates (#237). Only declared
    // predicates are looped (admission allowlist); each present value is typed
    // by its range. First non-empty value wins. This is a LEAF — it is never
    // read by the octothorpe/backlink traversal below.
    if (Array.isArray(documentRecordSchema) && documentRecordSchema.length) {
      for (const entry of documentRecordSchema) {
        const raw = binding[documentRecordVar(entry)]?.value;
        if (raw === undefined || raw === '') continue;
        const typed = coerceDocumentRecordValue(raw, entry.range);
        if (typed === undefined) continue;
        if (!current.documentRecord) current.documentRecord = {};
        if (current.documentRecord[entry.predicate] === undefined) {
          current.documentRecord[entry.predicate] = typed;
        }
      }
    }
    // Process octothorpe links
    if (binding.o?.value) {
      const targetUrl = binding.o.value;
      let oType = "";
      if (binding.oType?.value) {
        oType = binding.oType.value
      }
      // deal with Terms
      if (oType.startsWith('octo:')) {
        oType = oType.substring(5); // Remove 'octo:' prefix
      }
      if (oType === "Term") {
        // Terms are listed by their decoded name, not their IRI spelling.
        // skos:prefLabel when bound (#286), else the decoded slug.
        const termValue = binding.oLabel?.value ?? termName(targetUrl);
        if (!current.octothorpes.includes(termValue)) {
          current.octothorpes.push(termValue);
        }
      }
      else {
        // For Pages, rows are grouped per reifier (#270): a row reports its
        // reifier's subtype (rdf:type) or one relationship term
        // (octo:octothorpes); a target with no reifier is a plain link.
        if (!targetMaps[url]) targetMaps[url] = new Map()
        const targets = targetMaps[url]
        if (!targets.has(targetUrl)) {
          targets.set(targetUrl, new Map())
          current.octothorpes.push({ uri: targetUrl, type: 'link' })
        }
        const reifierPred = binding.reifierPred?.value
        const reifierObj = binding.reifierObj?.value
        const key = binding.reifier?.value ?? ''
        const reifiers = targets.get(targetUrl)
        if (!reifiers.has(key)) reifiers.set(key, { type: '', terms: [] })
        const r = reifiers.get(key)
        if (reifierPred === RDF_TYPE && reifierObj) {
          r.type = preferSubtype(r.type, relationshipSubtypeName(reifierObj))
        }
        if (reifierPred === RELATIONSHIP_PREDICATE && reifierObj) {
          const relationTerm = termName(reifierObj)
          if (!r.terms.includes(relationTerm)) r.terms.push(relationTerm)
        }
      }
    }
  });

  for (const [url, targets] of Object.entries(targetMaps)) {
    urlMap[url].octothorpes = urlMap[url].octothorpes.flatMap(item =>
      typeof item === 'object' && targets.has(item.uri)
        ? typedEntries(item.uri, targets.get(item.uri).values())
        : [item]
    )
  }

  // Filter by date range if specified
  // Use postDate when available, falling back to date (matches SPARQL ORDER BY behavior)
  let filteredMap = urlMap;
  if (filters.dateRange) {
    const { after, before } = filters.dateRange;
    filteredMap = Object.fromEntries(
      Object.entries(urlMap).filter(([_, item]) => {
        const effectiveDate = item.postDate || item.date;
        if (!effectiveDate) return false;
        if (after && effectiveDate < after) return false;
        if (before && effectiveDate > before) return false;
        return true;
      })
    );
  }

  // limit/offset arrive as strings from MultiPass. slice() takes an END index,
  // so the window is [offset, offset + limit) — slice(offset, limit) returned
  // nothing past page one (#185). limit 0 / 'no-limit' / non-numeric = unbounded.
  const all = Object.values(filteredMap)
  const off = Math.max(0, parseInt(offset, 10) || 0)
  const lim = parseInt(limit, 10)
  return lim > 0 ? all.slice(off, off + lim) : all.slice(off)
}

/**
 * Factory that creates an enrichBlobjectTargets function bound to a queryArray.
 * Enriches blobjects by fetching backlink metadata (subtype and terms) for page-type targets.
 * @param {Function} queryArray - SPARQL query function
 * @returns {Function} enrichBlobjectTargets(blobjects)
 */
export const createEnrichBlobjectTargets = (queryArray) => async (blobjects) => {
  const sourceUris = new Set()
  const targetUris = new Set()

  for (const blob of blobjects) {
    sourceUris.add(blob['@id'])
    for (const o of blob.octothorpes) {
      if (typeof o === 'object' && o.uri) {
        targetUris.add(o.uri)
      }
    }
  }

  if (targetUris.size === 0) return blobjects

  const sourceValues = [...sourceUris].map(u => `<${u}>`).join(' ')
  const targetValues = [...targetUris].map(u => `<${u}>`).join(' ')

  // #270: metadata lives on the relationship's RDF 1.2 reifier.
  const response = await queryArray(`
    SELECT ?source ?target ?rel ?relType ?term WHERE {
      VALUES ?source { ${sourceValues} }
      VALUES ?target { ${targetValues} }
      ${relationshipPattern({ reifier: '?rel', subject: '?source', object: '?target' })}
      ?rel rdf:type ?relType .
      OPTIONAL { ?rel octo:octothorpes ?term . }
    }
  `)

  const lookup = new Map()
  for (const binding of response.results.bindings) {
    const key = `${binding.source.value}|${binding.target.value}`
    const relType = relationshipSubtypeName(binding.relType?.value || '')
    if (!lookup.has(key)) lookup.set(key, new Map())
    const reifiers = lookup.get(key)
    const rel = binding.rel?.value ?? relType
    if (!reifiers.has(rel)) reifiers.set(rel, { type: '', terms: [] })
    const r = reifiers.get(rel)
    r.type = preferSubtype(r.type, relType)
    if (binding.term?.value) {
      const name = termName(binding.term.value)
      if (!r.terms.includes(name)) r.terms.push(name)
    }
  }

  for (const blob of blobjects) {
    const done = new Set()
    blob.octothorpes = blob.octothorpes.flatMap(o => {
      if (typeof o !== 'object' || !o.uri) return [o]
      const reifiers = lookup.get(`${blob['@id']}|${o.uri}`)
      if (!reifiers) return [o]
      if (done.has(o.uri)) return []
      done.add(o.uri)
      return typedEntries(o.uri, reifiers.values())
    })
  }

  return blobjects
}
