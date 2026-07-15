import yaml from 'js-yaml'
import { extractWikilinks } from './wikilinks.js'

/**
 * Markdown handler (issue #238, phases P1+P2; resolution reworked in #246).
 *
 * Converts raw Markdown source into a blobject:
 *   - YAML frontmatter  -> canonical blobject fields + documentRecord passthrough (P1 / C10)
 *   - frontmatter `tags` -> hashtag entries on `output.octothorpes` (#243 item 1)
 *   - the frontmatter URI field (`options.uriField`, default `uri`) -> the
 *     document's own `@id` when present (#246; replaces the `'source'` placeholder)
 *   - body `[[wikilinks]]` -> either resolved link edges on `output.octothorpes`
 *     (when a `options.wikilinkTargets` lookup is supplied) or extraction-only
 *     records on `output.wikilinks` (when it is not).
 *
 * RESOLUTION MODEL (#246): resolution is anchored on URIs declared in
 * frontmatter, NOT minted from file paths. The caller builds a `name -> uri`
 * lookup with one pass over the vault (`buildTargetMap` below) and passes it as
 * `options.wikilinkTargets`. Each extracted wikilink is resolved against it:
 *   - a matching URI -> a `{ type: 'link', uri }` edge (deduped; no self-edges)
 *   - no match       -> no edge, a `{ target, reason: 'no-match' }` warning
 *   - ambiguous key  -> no edge, a `{ target, reason: 'ambiguous' }` warning
 * A dead link never fails the document. When no lookup is provided the handler
 * is extraction-only: wikilinks stay on `output.wikilinks`, no edges, so it
 * remains usable standalone.
 *
 * IMPORTANT (RDF-star guardrail): this handler NEVER writes triples and never
 * hand-constructs blank nodes / quoted triples. It only produces a plain
 * blobject. Real relationship edges reach the graph through the shared
 * relationship-write path (`indexer.ingestBlobject` -> createMention /
 * createBacklink), which consumes the `octothorpes: [{ type, uri }]` array — the
 * only place a wikilink becomes a graph edge.
 */

// Canonical blobject subject fields (mirrors the default HTML harmonizer's
// `subject` scalars). Frontmatter keys matching these map straight to top level.
const CANONICAL_KEYS = new Set([
  'title',
  'description',
  'image',
  'contact',
  'type',
  'postDate',
  'indexPolicy',
  'indexHarmonizer',
])

// Pragmatic aliases for keys Markdown authors commonly use that map onto a
// canonical field. Kept small and explicit; everything else is passthrough.
const CANONICAL_ALIASES = {
  date: 'postDate',
  published: 'postDate',
}

const TAGS_KEY = 'tags'

// Default frontmatter field carrying a document's declared URI (#246). Override
// per-handler via `options.uriField` (e.g. Memex points identity at its ni:hash).
const URI_FIELD_DEFAULT = 'uri'

// Sentinel stored in a target map when a basename maps to two DISTINCT declared
// URIs. A wikilink that lands on it fails (ambiguous) unless a path-qualified
// key disambiguates. Exported so callers building their own maps can reuse it.
export const AMBIGUOUS = Symbol('octothorpes/wikilink-ambiguous')

/**
 * Normalize frontmatter `tags` into a flat list of trimmed, non-empty tag
 * strings. Accepts a YAML list (`tags: [a, b]`), a single scalar
 * (`tags: foo`), or a comma-separated string (`tags: foo, bar`) — matching
 * the `split` postProcess convention other harmonizers use for hashtags
 * (e.g. the `keywords` HTML harmonizer, `harmonizers.js`). Non-string items
 * are coerced to strings before splitting.
 */
const normalizeTags = (raw) => {
  const items = Array.isArray(raw) ? raw : [raw]
  const tags = []
  for (const item of items) {
    if (item === null || item === undefined) continue
    for (const part of String(item).split(',')) {
      const trimmed = part.trim()
      if (trimmed.length > 0) tags.push(trimmed)
    }
  }
  return tags
}

/**
 * Split leading YAML frontmatter from the Markdown body.
 * Frontmatter is a `---` fence on the very first line, closed by a line that is
 * exactly `---` or `...`. An unterminated fence is treated as "no frontmatter"
 * (graceful). Returns { frontmatter: string|null, body: string }.
 */
export const splitFrontmatter = (raw) => {
  const text = String(raw ?? '').replace(/^﻿/, '')
  const lines = text.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') return { frontmatter: null, body: text }
  for (let i = 1; i < lines.length; i++) {
    const t = lines[i].trim()
    if (t === '---' || t === '...') {
      return {
        frontmatter: lines.slice(1, i).join('\n'),
        body: lines.slice(i + 1).join('\n'),
      }
    }
  }
  // Unterminated frontmatter fence: don't consume the document.
  return { frontmatter: null, body: text }
}

/**
 * Parse frontmatter YAML into a plain object, or {} on any failure / non-object.
 * Malformed YAML never throws — the document still indexes (body-only).
 */
const parseFrontmatter = (frontmatter) => {
  if (frontmatter == null || frontmatter.trim() === '') return {}
  try {
    const parsed = yaml.load(frontmatter)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
    return {}
  } catch {
    return {}
  }
}

/** Strip a trailing `.md` (case-insensitive). */
const stripMd = (s) => String(s ?? '').replace(/\.md$/i, '')

/** Path split into non-empty, `.md`-stripped segments. */
const pathSegments = (path) => stripMd(path).split('/').filter(Boolean)

/**
 * Build a `name -> uri` lookup for wikilink resolution from a vault's
 * frontmatter (#246). This is the ONE trivial pass the caller runs; there is no
 * path→URL minting — every URI is the one the target document DECLARED.
 *
 * Each entry supplies the declared URI (via a pre-parsed `frontmatter` object or
 * raw `source` to parse) and the vault-relative `path` (or `name`) used to
 * derive keys. Keys registered per document:
 *   - the basename (last path segment, `.md` stripped) — the common case
 *   - every path-tail that contains a slash (`archive/Delta`, `notes/archive/Delta`)
 *     so an authored qualifier can disambiguate a basename collision
 * A key that would map to two DISTINCT URIs is marked `AMBIGUOUS`; the more
 * specific qualified keys stay resolvable. Entries without a declared URI are
 * skipped (they cannot be link targets).
 *
 * @param {Array<{frontmatter?:object, source?:string, path?:string, name?:string}>} entries
 * @param {{uriField?:string}} [opts]
 * @returns {Map<string, string|symbol>} name -> uri (or AMBIGUOUS)
 */
export const buildTargetMap = (entries = [], { uriField = URI_FIELD_DEFAULT } = {}) => {
  const map = new Map()
  const setKey = (key, uri) => {
    if (!key) return
    if (!map.has(key)) {
      map.set(key, uri)
      return
    }
    const existing = map.get(key)
    if (existing === AMBIGUOUS || existing === uri) return
    map.set(key, AMBIGUOUS) // distinct declared URIs collide on this key
  }
  for (const entry of entries || []) {
    if (!entry) continue
    const fm =
      entry.frontmatter ??
      parseFrontmatter(splitFrontmatter(entry.source ?? '').frontmatter)
    const uri = fm?.[uriField]
    if (!uri) continue
    const segs = pathSegments(entry.path ?? entry.name ?? '')
    if (segs.length === 0) continue
    // Slash-containing path tails first (qualified keys), then the bare basename.
    for (let i = 0; i < segs.length - 1; i++) setKey(segs.slice(i).join('/'), uri)
    setKey(segs[segs.length - 1], uri)
  }
  return map
}

/**
 * Resolve one extracted wikilink against a `options.wikilinkTargets` lookup,
 * which may be a Map, a plain object (`name -> uri`), or a resolver function.
 * Map/object lookups try the authored `target` (qualified) then the `basename`.
 * A function receives `(target, link)` and owns its own fallback.
 * Returns a URI string, the `AMBIGUOUS` sentinel, or `undefined` (no match).
 */
const resolveTarget = (lookup, link) => {
  if (typeof lookup === 'function') return lookup(link.target, link)
  if (lookup instanceof Map) {
    const hit = lookup.get(link.target)
    return hit === undefined ? lookup.get(link.basename) : hit
  }
  if (lookup && typeof lookup === 'object') {
    if (link.target in lookup) return lookup[link.target]
    if (link.basename in lookup) return lookup[link.basename]
  }
  return undefined
}

const harmonize = async (content, _harmonizerSchema, options = {}) => {
  const { frontmatter, body } = splitFrontmatter(content)
  const data = parseFrontmatter(frontmatter)

  const uriField = options.uriField ?? URI_FIELD_DEFAULT
  const declaredUri = data[uriField]

  // Own `@id` comes from the declared frontmatter URI when present (#246),
  // falling back to the 'source' placeholder for standalone / undeclared docs.
  const output = { '@id': declaredUri || 'source', octothorpes: [] }
  const documentRecord = {}

  for (const [key, value] of Object.entries(data)) {
    // The URI field is identity, not a documentRecord leaf — it becomes @id.
    if (key === uriField) continue
    if (key === TAGS_KEY) {
      // Frontmatter tags become hashtag octothorpes, in the same bare-string
      // shape the HTML/JSON handlers emit for `hashtag` schema entries (see
      // handlers/html/handler.js and handlers/json/handler.js — hashtags are
      // spread onto `octothorpes` as plain strings, not { type, uri }
      // objects; `indexer.ingestBlobject` treats a string octothorpe as a
      // hashtag via `handleThorpe`). They are intentionally NOT mirrored into
      // documentRecord.
      output.octothorpes.push(...normalizeTags(value))
      continue
    }
    const canonical = CANONICAL_KEYS.has(key) ? key : CANONICAL_ALIASES[key]
    if (canonical) {
      // First writer wins so an explicit canonical key beats an alias.
      if (output[canonical] === undefined) output[canonical] = value
    } else {
      documentRecord[key] = value
    }
  }

  if (Object.keys(documentRecord).length > 0) output.documentRecord = documentRecord

  // Body [[wikilinks]]. Always keep the raw extraction records on
  // `output.wikilinks` for traceability. When a target lookup is supplied,
  // resolve each against DECLARED URIs and emit `{ type: 'link', uri }` edges
  // directly on `octothorpes` (deduped, no self-edges); unresolved/ambiguous
  // links surface as warnings and never become edges (#246). Without a lookup
  // the handler is extraction-only — no edges — so it stays usable standalone.
  const wikilinks = extractWikilinks(body)
  if (wikilinks.length > 0) output.wikilinks = wikilinks

  const lookup = options.wikilinkTargets
  if (lookup != null && wikilinks.length > 0) {
    const warnings = []
    const seen = new Set()
    for (const link of wikilinks) {
      const resolved = resolveTarget(lookup, link)
      if (resolved === AMBIGUOUS) {
        warnings.push({ target: link.target, reason: 'ambiguous' })
        continue
      }
      if (resolved == null || resolved === '') {
        warnings.push({ target: link.target, reason: 'no-match' })
        continue
      }
      if (resolved === output['@id']) continue // no self-edge
      if (seen.has(resolved)) continue // dedupe repeated targets
      seen.add(resolved)
      output.octothorpes.push({ type: 'link', uri: resolved })
    }
    if (warnings.length > 0) output.warnings = warnings
  }

  return output
}

export default {
  mode: 'markdown',
  contentTypes: ['text/markdown'],
  meta: {
    name: 'Markdown Handler',
    description:
      'Extracts YAML frontmatter (canonical fields + documentRecord passthrough) and body [[wikilinks]] from Markdown source.',
  },
  harmonize,
}
