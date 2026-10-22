import yaml from 'js-yaml'
import { extractWikilinks } from './wikilinks.js'

/**
 * Markdown handler (issue #238, phases P1+P2; trimmed in #289).
 *
 * Converts raw Markdown source into a blobject:
 *   - YAML frontmatter  -> canonical blobject fields + documentRecord passthrough (P1 / C10)
 *   - frontmatter `tags` -> hashtag entries on `output.octothorpes` (#243 item 1)
 *   - the frontmatter URI field (`options.uriField`, default `uri`) -> the
 *     document's own `@id` when present (#246; replaces the `'source'` placeholder)
 *   - body `[[wikilinks]]` -> extraction-only records on `output.wikilinks`.
 *
 * Wikilink RESOLUTION lives in the Memex client project, not core (#289). This
 * handler never turns a wikilink into an edge: it only extracts. The handler
 * also never writes triples — it produces a plain blobject; edges reach the
 * graph through the shared relationship-write path (`indexer.ingestBlobject`).
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
    if (CANONICAL_KEYS.has(key)) {
      // An explicit canonical key always wins, regardless of frontmatter order.
      output[key] = value
      continue
    }
    const canonical = CANONICAL_ALIASES[key]
    if (canonical) {
      // An alias only fills a canonical field the author hasn't set explicitly.
      if (output[canonical] === undefined && !(canonical in data)) output[canonical] = value
    } else {
      documentRecord[key] = value
    }
  }

  if (Object.keys(documentRecord).length > 0) output.documentRecord = documentRecord

  // Body [[wikilinks]] are extraction-only: raw records on `output.wikilinks`
  // for traceability, never edges. Resolution belongs to the Memex client (#289).
  const wikilinks = extractWikilinks(body)
  if (wikilinks.length > 0) output.wikilinks = wikilinks

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
