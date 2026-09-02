import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createDefaultHandlerRegistry, harmonizeSource, validateHarmonizer } from 'octothorpes'
// NOTE: site handlers live at static/handlers/ (runtime modules discovered by
// Task 19's walk of api.handlers.dir), NOT under src/lib — they are outside
// the Vite alias space, so this import is a relative path, not `$lib/...`.
import csvHandler, { parseCsv } from '../../static/handlers/csv.js'

// NOTE: the harmonizer JSON lives at static/harmonizers/ (controller ruling,
// task 22), not src/lib/harmonizers/ — resolved relative to this test file.
const here = dirname(fileURLToPath(import.meta.url))
const definition = JSON.parse(
  readFileSync(resolve(here, '../../static/harmonizers/csv.json'), 'utf8')
)

const harmonize = (content, options = {}) => csvHandler.harmonize(content, null, options)

// Hoisted to module scope so later describe blocks (task 25's appended
// section) can reuse the same registry instead of re-registering the handler.
const registry = createDefaultHandlerRegistry({ defaultHandler: 'html' })
registry.register('csv', csvHandler)

describe('parseCsv', () => {
  it('parses headers and rows', () => {
    expect(parseCsv('a,b\n1,2\n3,4')).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '4' },
    ])
  })

  it('handles quoted fields containing commas', () => {
    expect(parseCsv('a,b\n"one, two",three')).toEqual([{ a: 'one, two', b: 'three' }])
  })

  it('handles escaped double quotes', () => {
    expect(parseCsv('a\n"she said ""hi"""')).toEqual([{ a: 'she said "hi"' }])
  })

  it('handles CRLF line endings and trailing newlines', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([{ a: '1', b: '2' }])
  })

  it('lowercases and trims headers', () => {
    expect(parseCsv(' Octothorpes , Links \nx,y')).toEqual([{ octothorpes: 'x', links: 'y' }])
  })

  it('returns an empty array for an empty or header-only document', () => {
    expect(parseCsv('')).toEqual([])
    expect(parseCsv('a,b')).toEqual([])
  })
})

describe('csv handler shape', () => {
  it('declares mode csv and the text/csv content type', () => {
    expect(csvHandler.mode).toBe('csv')
    expect(csvHandler.contentTypes).toContain('text/csv')
    expect(typeof csvHandler.harmonize).toBe('function')
  })
})

describe('csv handler — one document, many statements', () => {
  const doc = [
    'octothorpes,bookmarks,cites,links,title,description',
    'cats,https://a.test/,https://c.test/,https://l.test/,My Links,A demo file',
    'dogs,https://b.test/,,,,',
  ].join('\n')

  it('uses the document itself as the subject', () => {
    const blob = harmonize(doc)
    expect(blob['@id']).toBe('source')
  })

  it('does NOT create a subject per row (that is epic #274 territory)', () => {
    const blob = harmonize(doc)
    expect(Array.isArray(blob.rows)).toBe(false)
    expect(blob.subjects).toBeUndefined()
    expect(Object.keys(blob).filter((k) => k.startsWith('@')).sort()).toEqual(['@id'])
  })

  it('emits one statement per non-empty cell in a recognized column', () => {
    const blob = harmonize(doc)
    expect(blob.octothorpes).toEqual(['cats', 'dogs'])
    expect(blob.bookmarks).toEqual(['https://a.test/', 'https://b.test/'])
    expect(blob.cites).toEqual(['https://c.test/'])
    expect(blob.links).toEqual(['https://l.test/'])
  })

  it('takes the first non-empty value for title and description', () => {
    const blob = harmonize(['title,description', ',', 'My Links,A demo file', 'Later,Later'].join('\n'))
    expect(blob.title).toBe('My Links')
    expect(blob.description).toBe('A demo file')
  })

  it('ignores unrecognized columns instead of erroring', () => {
    const blob = harmonize('octothorpes,notes,internal id\ncats,whatever,42')
    expect(blob.octothorpes).toEqual(['cats'])
    expect(blob.notes).toBeUndefined()
    expect(blob['internal id']).toBeUndefined()
  })

  it('skips empty cells and trims values', () => {
    const blob = harmonize('octothorpes\n  cats  \n\n   \ndogs')
    expect(blob.octothorpes).toEqual(['cats', 'dogs'])
  })

  it('dedupes repeated values within a column', () => {
    expect(harmonize('octothorpes\ncats\ncats\ndogs').octothorpes).toEqual(['cats', 'dogs'])
  })

  it('returns an empty blobject for an empty document rather than throwing', () => {
    const blob = harmonize('')
    expect(blob).toEqual({ '@id': 'source', octothorpes: [] })
  })

  it('does not force opt-in — indexPolicy is left to the document', () => {
    expect(harmonize('bookmarks\nhttps://a.test/').indexPolicy).toBeUndefined()
  })

  it('a csv with octothorpes opts in implicitly via the existing rule', async () => {
    const { resolveIndexPolicy } = await import('octothorpes')
    expect(resolveIndexPolicy({ blobject: harmonize('octothorpes\ncats') }).optedIn).toBe(true)
    expect(resolveIndexPolicy({ blobject: harmonize('bookmarks\nhttps://a.test/') }).optedIn).toBe(false)
  })
})

describe('csv harmonizer definition', () => {
  it('is a valid harmonizer definition', () => {
    expect(validateHarmonizer(definition)).toEqual([])
  })

  it('references the csv HANDLER through its mode field', () => {
    // This is the cross-registry link: a JSON file in api.harmonizers.dir
    // naming a JS module in api.handlers.dir.
    expect(definition.mode).toBe('csv')
  })

  it('maps columns to OP fields', () => {
    expect(Object.keys(definition.schema.subject)).toEqual(
      expect.arrayContaining(['octothorpes', 'bookmarks', 'cites', 'links'])
    )
  })
})

describe('csv harmonizer dispatches to the csv handler', () => {
  const doc = 'octothorpes,bookmarks\ncats,https://a.test/'

  it('resolves handler by the harmonizer-declared mode', async () => {
    const blob = await harmonizeSource(doc, definition, { handlerRegistry: registry })
    expect(blob.octothorpes).toEqual(['cats'])
    expect(blob.bookmarks).toEqual(['https://a.test/'])
  })

  it('also dispatches by content-type when no mode is supplied', async () => {
    const blob = await harmonizeSource(doc, null, {
      handlerRegistry: registry,
      contentType: 'text/csv',
    })
    expect(blob.octothorpes).toEqual(['cats'])
  })

  it('falls back to default dispatch when the csv handler is absent', async () => {
    const bare = createDefaultHandlerRegistry({ defaultHandler: 'html' })
    await expect(harmonizeSource(doc, definition, { handlerRegistry: bare })).resolves.toBeDefined()
  })
})

describe('#217 task 25: the handler reads its column map from the harmonizer', () => {
  const doc = [
    'tags,topics,saved,headline,notes',
    'cats,gardens,https://a.test/,My Links,ignored',
    'dogs,,https://b.test/,Later,ignored',
  ].join('\n')

  const mapping = (subject) => ({
    id: 'harmonizer/csv-test',
    type: 'harmonizer',
    title: 'CSV test map',
    mode: 'csv',
    schema: { subject: { s: 'source', ...subject } },
  })

  it('extracts from the columns the DEFINITION names, not hardcoded ones', () => {
    const blob = csvHandler.harmonize(doc, mapping({
      octothorpes: [{ column: 'tags' }],
      bookmarks: [{ column: 'saved' }],
      title: [{ column: 'headline' }],
    }))
    expect(blob.octothorpes).toEqual(['cats', 'dogs'])
    expect(blob.bookmarks).toEqual(['https://a.test/', 'https://b.test/'])
    expect(blob.title).toBe('My Links')
  })

  // THE POINT OF THIS TASK: altering the harmonizer JSON alters extraction,
  // with no code change. Same document, different map, different statements.
  it('changing the column map changes the emitted statements', () => {
    const asTags = csvHandler.harmonize(doc, mapping({ octothorpes: [{ column: 'tags' }] }))
    const asTopics = csvHandler.harmonize(doc, mapping({ octothorpes: [{ column: 'topics' }] }))
    expect(asTags.octothorpes).toEqual(['cats', 'dogs'])
    expect(asTopics.octothorpes).toEqual(['gardens'])
    expect(asTags.octothorpes).not.toEqual(asTopics.octothorpes)
  })

  it('unions multiple selectors for one field, in declaration order', () => {
    const blob = csvHandler.harmonize(doc, mapping({
      octothorpes: [{ column: 'tags' }, { column: 'topics' }],
    }))
    expect(blob.octothorpes).toEqual(['cats', 'dogs', 'gardens'])
  })

  it('does not extract a field the definition omits', () => {
    const blob = csvHandler.harmonize(doc, mapping({ octothorpes: [{ column: 'tags' }] }))
    expect(blob.bookmarks).toBeUndefined()
    expect(blob.title).toBeUndefined()
  })

  it('ignores a selector naming a column the document does not have', () => {
    const blob = csvHandler.harmonize(doc, mapping({ octothorpes: [{ column: 'nope' }] }))
    expect(blob.octothorpes).toEqual([])
  })

  it('ignores a definition key that is not an OP field it knows', () => {
    const blob = csvHandler.harmonize(doc, mapping({
      octothorpes: [{ column: 'tags' }],
      nonsense: [{ column: 'notes' }],
    }))
    expect(blob.nonsense).toBeUndefined()
    expect(blob.octothorpes).toEqual(['cats', 'dogs'])
  })

  it('keeps scalar semantics for title/description — first non-empty wins', () => {
    const blob = csvHandler.harmonize(doc, mapping({ title: [{ column: 'headline' }] }))
    expect(blob.title).toBe('My Links')
  })

  it('falls back to the built-in map when no definition is supplied', () => {
    // Content-type dispatch (text/csv with no harmonizer named) must keep
    // working exactly as it did in Task 21.
    const legacy = 'octothorpes,bookmarks\ncats,https://a.test/'
    expect(csvHandler.harmonize(legacy, null).octothorpes).toEqual(['cats'])
    expect(csvHandler.harmonize(legacy, undefined).bookmarks).toEqual(['https://a.test/'])
  })

  it('still emits ONE subject — this changes cells, not cardinality (#274 stays out)', () => {
    const blob = csvHandler.harmonize(doc, mapping({ octothorpes: [{ column: 'tags' }] }))
    expect(blob['@id']).toBe('source')
    expect(blob.subjects).toBeUndefined()
  })
})

describe('the shipped csv.json drives the shipped handler', () => {
  it('the committed definition produces the same result as the built-in map', () => {
    // The two agreed by hand through Task 24; after this task the definition is
    // the source of truth and this test is what keeps them honest.
    const doc = 'octothorpes,bookmarks,title\ncats,https://a.test/,My Links'
    expect(csvHandler.harmonize(doc, definition)).toEqual(csvHandler.harmonize(doc, null))
  })

  it('editing the definition alone changes extraction end to end', async () => {
    const altered = structuredClone(definition)
    altered.schema.subject.octothorpes = [{ column: 'bookmarks' }]
    const blob = await harmonizeSource('octothorpes,bookmarks\ncats,https://a.test/', altered, {
      handlerRegistry: registry,
    })
    expect(blob.octothorpes).toEqual(['https://a.test/'])
  })
})
