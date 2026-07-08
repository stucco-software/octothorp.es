import { documentRecordVar } from './queryBuilders.js'

/**
 * Coerce a raw SPARQL binding value into the JS type declared by a
 * documentRecord range (#237). Range enum (frozen):
 *   literal   -> string
 *   uri       -> string (semantically a node)
 *   timestamp -> ISO-8601 string (unix ms, unix seconds, or ISO in; ISO out;
 *                unparseable input is passed through as the raw string)
 *   number    -> JS number (non-numeric -> undefined, i.e. key dropped)
 *   boolean   -> JS boolean (only true/1/false/0; anything else -> undefined)
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
        const ms = s.length >= 13 ? num : num * 1000
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
 * @param {Array<{predicate:string, namespace?:string, range:string, iri?:string}>} [documentRecordSchema=[]]
 *   Declared documentRecord predicates (#237). Each present-in-storage entry is
 *   projected into `blobject.documentRecord`, typed by `range`. Declared-but-absent
 *   keys are omitted; undeclared predicates are never looped (the admission
 *   allowlist / #166 abuse guard). Empty/absent -> no `documentRecord` key
 *   (behaviour identical to before this feature). `documentRecord` is a LEAF and
 *   is never fed to link/backlink traversal. C7 wires this param from the
 *   profile's `vocabulary.documentRecord`.
 * @returns {Promise<Array>} Array of processed blobjects with metadata
 */
export const getBlobjectFromResponse = async (response, filters = { limitResults: 100, offsetResults: 0, dateRange: null }, documentRecordSchema = []) => {
  const limit = filters.limitResults
  const offset = filters.offsetResults

  const urlMap = {};

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
    if (binding.date?.value && !current.date) {
      current.date = parseInt(binding.date.value);
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
        // For Terms, only include if starts with instance
        // Trim to value after last /
        const termValue = targetUrl.substring(targetUrl.lastIndexOf('~/') + 2);
        if (!current.octothorpes.includes(termValue)) {
          current.octothorpes.push(termValue);
        }
      }
      else {
        // For Pages, determine type
        // blank nodes are only set when there is a more specific object type
        // so if they have a value we use that
        oType = "link"
        if (binding.blankNodeObj?.value?.startsWith('octo:')) {
          oType = binding.blankNodeObj.value.substring(5); // Remove 'octo:' prefix
        }

        // Check if this target already exists in the array
        const existingIndex = current.octothorpes.findIndex(
          item => typeof item === 'object' && (item.target === targetUrl || item.uri === targetUrl)
        );

        // Check if this blank node has associated terms (terms on relationships)
        let relationTerm = null
        if (binding.blankNodeObj?.value?.includes('/~/')) {
          const termValue = binding.blankNodeObj.value.substring(
            binding.blankNodeObj.value.lastIndexOf('~/') + 2
          )
          relationTerm = termValue
        }

        if (existingIndex === -1) {
          const newEntry = {
            uri: targetUrl,
            type: oType
          }
          if (relationTerm) {
            newEntry.terms = [relationTerm]
          }
          current.octothorpes.push(newEntry);
        } else {
          if (oType !== 'link') {
            current.octothorpes[existingIndex].type = oType;
          }
          if (relationTerm) {
            if (!current.octothorpes[existingIndex].terms) {
              current.octothorpes[existingIndex].terms = []
            }
            if (!current.octothorpes[existingIndex].terms.includes(relationTerm)) {
              current.octothorpes[existingIndex].terms.push(relationTerm)
            }
          }
        }
      }
    }
  });

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

  const output = limit === 0 ? filteredMap : Object.fromEntries(Object.entries(filteredMap).slice(offset, limit));

  return Object.values(output);
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

  const response = await queryArray(`
    SELECT ?source ?target ?bnType ?term WHERE {
      VALUES ?source { ${sourceValues} }
      VALUES ?target { ${targetValues} }
      ?source octo:octothorpes ?bn .
      ?bn octo:url ?target .
      ?bn rdf:type ?bnType .
      OPTIONAL { ?bn octo:octothorpes ?term . }
    }
  `)

  const lookup = new Map()
  for (const binding of response.results.bindings) {
    const source = binding.source.value
    const target = binding.target.value
    const key = `${source}|${target}`
    let bnType = binding.bnType?.value || ''
    if (bnType.startsWith('octo:')) bnType = bnType.substring(5)

    if (!lookup.has(key)) {
      lookup.set(key, { type: bnType, terms: [] })
    }
    const entry = lookup.get(key)
    if (bnType && bnType !== 'Backlink' && entry.type === 'Backlink') {
      entry.type = bnType
    }

    if (binding.term?.value) {
      const termUri = binding.term.value
      const termName = termUri.substring(termUri.lastIndexOf('~/') + 2)
      if (!entry.terms.includes(termName)) {
        entry.terms.push(termName)
      }
    }
  }

  for (const blob of blobjects) {
    for (const o of blob.octothorpes) {
      if (typeof o === 'object' && o.uri) {
        const meta = lookup.get(`${blob['@id']}|${o.uri}`)
        if (meta) {
          o.type = meta.type
          if (meta.terms.length > 0) o.terms = meta.terms
        }
      }
    }
  }

  return blobjects
}
