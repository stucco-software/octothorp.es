/**
 * Deferred, whole-instance wikilink resolution (issue #238 P3 / chunk C12).
 *
 * The Markdown handler (`handlers/markdown/handler.js`) stages body `[[wikilinks]]`
 * on `blobject.wikilinks` as PER-OCCURRENCE extraction records keyed by
 * `basename` — deliberately NOT on `octothorpes`, because a basename is not a
 * URL yet. Turning those basenames into real link edges is a whole-instance
 * concern: it can only be done once every document in the set is known (so that
 * mutual links `A <-> B` both resolve, which a per-document / file-ordered pass
 * cannot guarantee). Hence this pass is DEFERRED and runs over the whole set.
 *
 * This module is a PURE resolver. It never touches SPARQL and never builds
 * triples. It maps `basename -> URL` and produces, per source document:
 *   - `resolvedLinks`   — every resolved occurrence (kept un-deduped for ref-counting)
 *   - `unresolvedLinks` — every occurrence with no target (RECORDED, never dropped)
 *   - `octothorpes`     — deduped `{ type: 'link', uri }` edges ready to be merged
 *                         onto a blobject and ingested through the shared
 *                         relationship-write path (indexer.ingestBlobject ->
 *                         handleMention). That shared path is the ONLY place a
 *                         wikilink becomes a graph edge — the RDF-star guardrail.
 *
 * Resolution model = Obsidian's, reimplemented (we never read Obsidian's private
 * cache):
 *   - Key on basename (filename without `.md`), not frontmatter title.
 *   - Collision (two docs share a basename) → path-qualifier disambiguation
 *     first (`[[subfolder/name]]`), then a nearest-in-folder heuristic. No
 *     hash-suffix invention.
 *   - A rename changes a basename but not a stale `[[old]]` reference, so the
 *     old link surfaces LOUDLY in `unresolvedLinks` — never silent corruption.
 */

/** Strip a trailing `.md` (case-insensitive) and split a path into segments. */
const pathSegments = (path) =>
  String(path ?? '')
    .replace(/\.md$/i, '')
    .split('/')
    .filter(Boolean)

/** Basename = last non-empty path segment, `.md` stripped. */
const basenameFromPath = (path) => pathSegments(path).pop() ?? ''

/** Directory segments of a document path (everything but the last segment). */
const dirSegments = (path) => {
  const segs = pathSegments(path)
  return segs.slice(0, -1)
}

/** Count of leading segments two arrays share. */
const commonPrefixLength = (a, b) => {
  let n = 0
  while (n < a.length && n < b.length && a[n] === b[n]) n++
  return n
}

/**
 * Build the whole-instance resolution index: `basename -> entry[]`.
 * A basename with >1 entry is a collision, disambiguated at resolve time.
 *
 * @param {Array<{uri:string, path?:string, basename?:string}>} documents
 * @returns {Map<string, Array<{uri:string, path:string, basename:string, segs:string[]}>>}
 */
export const buildResolutionIndex = (documents = []) => {
  const index = new Map()
  for (const d of documents) {
    if (!d || !d.uri) continue
    const path = d.path ?? ''
    const basename = d.basename ?? basenameFromPath(path)
    if (!basename) continue
    const entry = { uri: d.uri, path, basename, segs: pathSegments(path) }
    if (!index.has(basename)) index.set(basename, [])
    index.get(basename).push(entry)
  }
  return index
}

/**
 * Resolve one wikilink occurrence against the index, from the perspective of
 * `fromEntry` (the source document — used for the nearest-in-folder tiebreak).
 *
 * @returns {{ uri:string }|{ unresolved:true, reason:string }}
 */
const resolveOne = (link, index, fromEntry) => {
  const candidates = index.get(link.basename)
  if (!candidates || candidates.length === 0) {
    return { unresolved: true, reason: 'no-match' }
  }

  // Single candidate: unambiguous.
  if (candidates.length === 1) return { uri: candidates[0].uri }

  // Collision. If the authored target carries a path qualifier (has a '/'),
  // require a candidate whose path tail matches those segments.
  const targetSegs = pathSegments(link.target)
  if (targetSegs.length > 1) {
    const qualified = candidates.filter((c) => {
      if (c.segs.length < targetSegs.length) return false
      const tail = c.segs.slice(c.segs.length - targetSegs.length)
      return tail.every((seg, i) => seg === targetSegs[i])
    })
    if (qualified.length === 1) return { uri: qualified[0].uri }
    if (qualified.length === 0) return { unresolved: true, reason: 'no-match' }
    // qualifier still ambiguous → fall through to nearest-folder over `qualified`
    return nearest(qualified, fromEntry)
  }

  // Bare basename collision → nearest-in-folder heuristic over all candidates.
  return nearest(candidates, fromEntry)
}

/**
 * Nearest-in-folder pick: the candidate sharing the longest directory prefix
 * with the source document. Deterministic tiebreak: shorter path, then
 * lexicographic — so the result never depends on document input order.
 */
const nearest = (candidates, fromEntry) => {
  const fromDir = fromEntry ? dirSegments(fromEntry.path) : []
  let best = null
  let bestScore = -1
  for (const c of candidates) {
    const score = commonPrefixLength(fromDir, dirSegments(c.path))
    if (
      score > bestScore ||
      (score === bestScore &&
        (c.segs.length < best.segs.length ||
          (c.segs.length === best.segs.length && c.path < best.path)))
    ) {
      best = c
      bestScore = score
    }
  }
  return best ? { uri: best.uri } : { unresolved: true, reason: 'ambiguous' }
}

/**
 * Resolve every document's wikilinks against the whole-instance index.
 *
 * @param {Array<{uri:string, path?:string, basename?:string, wikilinks?:Array}>} documents
 * @returns {{
 *   index: Map,
 *   results: Array<{uri, resolvedLinks, unresolvedLinks, octothorpes}>,
 *   byUri: Map<string, {uri, resolvedLinks, unresolvedLinks, octothorpes}>
 * }}
 */
export const resolveWikilinks = (documents = []) => {
  const index = buildResolutionIndex(documents)
  const results = []
  const byUri = new Map()

  for (const d of documents) {
    if (!d || !d.uri) continue
    const fromEntry = { uri: d.uri, path: d.path ?? '', segs: pathSegments(d.path ?? '') }
    const resolvedLinks = []
    const unresolvedLinks = []
    const edgeUris = new Set()
    const octothorpes = []

    for (const link of d.wikilinks || []) {
      const outcome = resolveOne(link, index, fromEntry)
      if (outcome.unresolved) {
        unresolvedLinks.push({ ...link, reason: outcome.reason })
        continue
      }
      // Every occurrence is kept in resolvedLinks (ref-counting surface).
      resolvedLinks.push({ ...link, uri: outcome.uri })
      // Edges are deduped and never self-referential.
      if (outcome.uri !== d.uri && !edgeUris.has(outcome.uri)) {
        edgeUris.add(outcome.uri)
        octothorpes.push({ type: 'link', uri: outcome.uri })
      }
    }

    const result = { uri: d.uri, resolvedLinks, unresolvedLinks, octothorpes }
    results.push(result)
    byUri.set(d.uri, result)
  }

  return { index, results, byUri }
}

/**
 * Merge a per-document resolution result onto a harmonized blobject: append the
 * resolved `{ type:'link', uri }` edges to `octothorpes` (deduped against edges
 * already present) and attach the `resolvedLinks` / `unresolvedLinks` report.
 *
 * The blobject is then ingested through the normal `ingestBlobject` path, so the
 * link edges are written by `handleMention` like any other relationship — this
 * module never writes to the graph itself.
 *
 * @param {Object} blobject - harmonized blobject (mutated and returned)
 * @param {{octothorpes:Array, resolvedLinks:Array, unresolvedLinks:Array}} result
 * @returns {Object} the same blobject
 */
export const applyResolution = (blobject, result) => {
  if (!blobject || !result) return blobject
  if (!Array.isArray(blobject.octothorpes)) blobject.octothorpes = []

  const present = new Set(
    blobject.octothorpes
      .filter((o) => o && typeof o === 'object' && o.uri)
      .map((o) => `${o.type}:${o.uri}`)
  )
  for (const edge of result.octothorpes || []) {
    const key = `${edge.type}:${edge.uri}`
    if (present.has(key)) continue
    present.add(key)
    blobject.octothorpes.push(edge)
  }

  blobject.resolvedLinks = result.resolvedLinks || []
  blobject.unresolvedLinks = result.unresolvedLinks || []
  return blobject
}
