import yaml from 'js-yaml'
import { extractWikilinks } from './wikilinks.js'

/**
 * Markdown handler (issue #238, phases P1+P2).
 *
 * Converts raw Markdown source into a blobject:
 *   - YAML frontmatter  -> canonical blobject fields + documentRecord passthrough (P1 / C10)
 *   - frontmatter `tags` -> hashtag entries on `output.octothorpes` (#243 item 1)
 *   - body `[[wikilinks]]` -> staged link intents in `output.wikilinks` (P2 / C11)
 *
 * IMPORTANT (RDF-star guardrail): this handler NEVER writes triples and never
 * hand-constructs blank nodes / quoted triples. It only produces a plain
 * blobject. Real relationship edges reach the graph through the shared
 * relationship-write path (`indexer.ingestBlobject` -> createMention /
 * createBacklink), which consumes the `octothorpes: [{ type, uri }]` array.
 * Because wikilink targets are basenames (not URLs) until whole-instance
 * resolution runs, they are staged in a SEPARATE `wikilinks` field and are NOT
 * placed on `octothorpes` here. The deferred resolution pass (C12) turns
 * resolved wikilinks into `{ type: 'link', uri }` octothorpes entries; that is
 * the only place a wikilink becomes a graph edge.
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

const harmonize = async (content, _harmonizerSchema, _options = {}) => {
  const { frontmatter, body } = splitFrontmatter(content)
  const data = parseFrontmatter(frontmatter)

  const output = { '@id': 'source', octothorpes: [] }
  const documentRecord = {}

  for (const [key, value] of Object.entries(data)) {
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

  // Body [[wikilinks]] are staged as extraction records for the deferred
  // whole-instance resolution pass (C12). They stay OFF `octothorpes` here:
  // targets are basenames, not URLs, so putting them on the relationship-write
  // path would emit broken edges. C12 resolves basename -> URL and merges the
  // resolved ones into `octothorpes` as { type: 'link', uri }.
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
