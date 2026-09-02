/**
 * CSV content handler — a SITE handler (#217 wave 5, #273).
 *
 * It lives in static/handlers/ and NOT in packages/core/ on purpose: the whole
 * point is to demonstrate that a site can add a content format without touching
 * core. If this could only be written in core, api.handlers.dir would not be an
 * extension point.
 *
 * MODEL: one CSV document is ONE subject — its own URL — with many statements,
 * exactly like the HTML handler. It does NOT mint a subject per row. Treating
 * rows as resources is batch indexing, which is epic #274; doing it here would
 * quietly implement half of that epic in a demo.
 *
 * Column headers name OP statement types. Each non-empty cell in a recognized
 * column contributes one statement about the document. Unrecognized columns are
 * ignored rather than fatal — real spreadsheets carry columns OP does not care
 * about, and rejecting the document over a stray `notes` header would make this
 * useless as a demo.
 */

// The handler still OWNS the field classification — which OP fields are lists
// and which are scalars is protocol shape, not site configuration. What the
// harmonizer supplies is the COLUMN each field reads from.
const LIST_FIELDS = ['octothorpes', 'bookmarks', 'cites', 'links']
const SCALAR_FIELDS = ['title', 'description']

/**
 * The built-in map, used when no harmonizer definition is supplied (content-type
 * dispatch). Identical to the shipped static/harmonizers/csv.json, which is
 * what the "definition and built-in agree" test pins.
 */
const DEFAULT_SUBJECT = {
  octothorpes: [{ column: 'octothorpes' }],
  bookmarks: [{ column: 'bookmarks' }],
  cites: [{ column: 'cites' }],
  links: [{ column: 'links' }],
  title: [{ column: 'title' }],
  description: [{ column: 'description' }],
}

/** Selectors for one field, tolerating a bare object instead of a list. */
const selectorsFor = (subject, field) => {
  const raw = subject?.[field]
  if (!raw) return []
  return (Array.isArray(raw) ? raw : [raw]).filter((sel) => sel && sel.column)
}

/**
 * Minimal, dependency-free CSV parse. Handles quoted fields with embedded
 * commas and newlines, `""` escapes, and CRLF. Deliberately NOT RFC 4180
 * complete — adding a CSV library would defeat the point of the demo.
 *
 * @param {string} text
 * @returns {Array<Record<string, string>>} rows keyed by lowercased header
 */
export const parseCsv = (text) => {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  const src = String(text ?? '')

  const endField = () => { row.push(field); field = '' }
  const endRow = () => { endField(); rows.push(row); row = [] }

  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++ }
        else quoted = false
      } else field += c
      continue
    }
    if (c === '"') { quoted = true; continue }
    if (c === ',') { endField(); continue }
    if (c === '\r') continue
    if (c === '\n') { endRow(); continue }
    field += c
  }
  if (field.length || row.length) endRow()

  const [headerRow, ...dataRows] = rows
  if (!headerRow) return []

  const headers = headerRow.map((h) => h.trim().toLowerCase())
  return dataRows
    .filter((r) => r.some((cell) => cell.trim() !== ''))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])))
}

const pushUnique = (list, value) => {
  const v = String(value ?? '').trim()
  if (v && !list.includes(v)) list.push(v)
}

/**
 * @param {string} content - the raw CSV document
 * @param {Object|null} schema - the harmonizer definition. THIS IS NOW LOAD
 *   BEARING (#217 task 25): schema.subject supplies the column -> OP-field map,
 *   so editing static/harmonizers/csv.json changes what this handler extracts
 *   with no code edit. That is the half of extensibility the earlier Wave 5
 *   tasks did not demonstrate — "a site declares extraction rules as data".
 *   Null/absent falls back to DEFAULT_SUBJECT so content-type dispatch is
 *   unaffected.
 * @param {Object} [options]
 * @returns {Object} blobject with '@id': 'source' — still ONE subject per
 *   document. This task changes which cells become statements, never how many
 *   subjects exist; row-per-subject remains epic #274.
 */
const harmonize = (content, schema, options = {}) => {
  const rows = parseCsv(content)
  const subject = schema?.schema?.subject ?? schema?.subject ?? DEFAULT_SUBJECT
  const declared = (field) => Object.prototype.hasOwnProperty.call(subject, field)
  const output = { '@id': 'source', octothorpes: [] }
  if (!rows.length) return output

  for (const field of LIST_FIELDS) {
    if (!declared(field)) continue
    const values = []
    // Multiple selectors union in declaration order.
    for (const { column } of selectorsFor(subject, field)) {
      for (const row of rows) pushUnique(values, row[String(column).trim().toLowerCase()])
    }
    output[field] = values
  }

  for (const field of SCALAR_FIELDS) {
    if (!declared(field)) continue
    const first = selectorsFor(subject, field)
      .flatMap(({ column }) => rows.map((r) => String(r[String(column).trim().toLowerCase()] ?? '').trim()))
      .find(Boolean)
    if (first) output[field] = first
  }

  // NOTE: no indexPolicy is set. Opt-in stays the document's decision — a CSV
  // with an octothorpes column opts in implicitly through resolveIndexPolicy's
  // existing "has octothorpes" rule; one without has not asked to be indexed.
  return output
}

export default {
  mode: 'csv',
  contentTypes: ['text/csv'],
  meta: {
    name: 'CSV Handler',
    description:
      'Site-level demo handler. Treats a CSV document as one subject (its own URL) with one statement per non-empty cell in a recognized column.',
  },
  harmonize,
}
