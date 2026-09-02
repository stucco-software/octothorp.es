import { describe, it, expect } from 'vitest'
// NOTE: site handlers live at static/handlers/ (runtime modules discovered by
// Task 19's walk of api.handlers.dir), NOT under src/lib — they are outside
// the Vite alias space, so this import is a relative path, not `$lib/...`.
import csvHandler, { parseCsv } from '../../static/handlers/csv.js'

const harmonize = (content, options = {}) => csvHandler.harmonize(content, null, options)

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
