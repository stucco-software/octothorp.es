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

// Statement columns: every non-empty cell becomes a value.
const LIST_COLUMNS = ['octothorpes', 'bookmarks', 'cites', 'links']
// Scalar columns: first non-empty value wins.
const SCALAR_COLUMNS = ['title', 'description']

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
 * @param {Object|null} schema - harmonizer definition. Unused here: this task
 *   ships the column mapping hardcoded, and the parameter exists for interface
 *   parity with the other handlers. TASK 25 makes it load-bearing — the handler
 *   reads schema.subject for its column map — so keep the argument in place.
 * @param {Object} [options]
 * @returns {Object} blobject with '@id': 'source' — the indexer substitutes the
 *   document URI, so the subject is always the CSV's own URL.
 */
const harmonize = (content, schema, options = {}) => {
  const rows = parseCsv(content)
  const output = { '@id': 'source', octothorpes: [] }
  if (!rows.length) return output

  for (const column of LIST_COLUMNS) {
    const values = []
    for (const row of rows) pushUnique(values, row[column])
    // octothorpes is always present (the blobject contract); the rest appear
    // only when the document actually declared that column.
    if (column === 'octothorpes' || values.length) output[column] = values
  }

  for (const column of SCALAR_COLUMNS) {
    const first = rows.map((r) => String(r[column] ?? '').trim()).find(Boolean)
    if (first) output[column] = first
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
