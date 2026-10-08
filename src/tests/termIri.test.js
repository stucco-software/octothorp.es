import { describe, it, expect, vi, beforeEach } from 'vitest'
import { termIri, termName } from '../../packages/core/utils.js'
import { getBlobjectFromResponse } from '../../packages/core/blobject.js'
import { createIndexer } from '../../packages/core/indexer.js'
import { createQueryBuilders } from '../../packages/core/queryBuilders.js'
import { rdfa2triples } from '../../packages/core/ld/rdfa2triples.js'
import { JSDOM } from 'jsdom'

// #285: terms with IRI-illegal characters were interpolated raw into
// `<${instance}~/${term}>`, which Oxigraph rejects ("expected IRI parsing failed").

const instance = 'http://localhost:5173/'

// Characters that may not appear raw inside a SPARQL IRIREF.
const ILLEGAL_IN_IRI = /[\u0000- <>"{}|\\^`]/

describe('termIri', () => {
  it('leaves ordinary terms unchanged', () => {
    expect(termIri(instance, 'demo')).toBe(`${instance}~/demo`)
    expect(termIri(instance, 'Indie-Web2')).toBe(`${instance}~/Indie-Web2`)
  })

  it('percent-encodes spaces the same way new URL() does', () => {
    expect(termIri(instance, 'site changes')).toBe(`${instance}~/site%20changes`)
    expect(termIri(instance, 'site changes'))
      .toBe(new URL(`${instance}~/site changes`).href)
  })

  it('percent-encodes every IRI-illegal character', () => {
    const cases = {
      '<': '%3C', '>': '%3E', '"': '%22', '{': '%7B', '}': '%7D',
      '|': '%7C', '\\': '%5C', '^': '%5E', '`': '%60', '\t': '%09', '\n': '%0A',
    }
    for (const [ch, enc] of Object.entries(cases)) {
      expect(termIri(instance, `a${ch}b`)).toBe(`${instance}~/a${enc}b`)
    }
    const iri = termIri(instance, 'a<b>"c{d}|e\\f^g`h i')
    expect(iri.slice(instance.length)).not.toMatch(ILLEGAL_IN_IRI)
  })

  it('encodes a bare % that does not start a valid escape', () => {
    expect(termIri(instance, '100%')).toBe(`${instance}~/100%25`)
    expect(termIri(instance, '50%off')).toBe(`${instance}~/50%25off`)
  })

  it('keeps an existing %HH escape (href-authored terms) and is idempotent', () => {
    expect(termIri(instance, 'site%20changes')).toBe(`${instance}~/site%20changes`)
    const once = termIri(instance, 'a b|c')
    expect(termIri(instance, once.slice(`${instance}~/`.length))).toBe(once)
  })

  it('leaves non-ASCII as-is (legal in IRIs; preserves stored terms)', () => {
    expect(termIri(instance, 'café')).toBe(`${instance}~/café`)
  })
})

describe('term IRIs in indexer SPARQL', () => {
  const mockInsert = vi.fn()
  const mockQueryBoolean = vi.fn()
  let indexer

  beforeEach(() => {
    vi.clearAllMocks()
    indexer = createIndexer({
      insert: mockInsert,
      query: vi.fn(),
      queryBoolean: mockQueryBoolean,
      queryArray: vi.fn(),
      instance,
      handlerRegistry: { getHandler: () => null, getHandlerForContentType: () => null },
    })
  })

  it('extantTerm queries the encoded term IRI', async () => {
    mockQueryBoolean.mockResolvedValue(false)
    await indexer.extantTerm('site changes', { instance })
    const q = mockQueryBoolean.mock.calls[0][0]
    expect(q).toContain(`<${instance}~/site%20changes> rdf:type <octo:Term>`)
    expect(q).not.toContain('site changes')
  })

  it('extantTerm query shape is unchanged for a plain term', async () => {
    mockQueryBoolean.mockResolvedValue(true)
    await indexer.extantTerm('demo', { instance })
    expect(mockQueryBoolean.mock.calls[0][0]).toContain(`<${instance}~/demo> rdf:type <octo:Term>`)
  })

  it('createOctothorpe and createTerm write the encoded term IRI', async () => {
    mockInsert.mockResolvedValue({})
    await indexer.createOctothorpe('https://example.com/page', 'a>b c', { instance })
    await indexer.createTerm('a>b c', { instance })
    for (const [q] of mockInsert.mock.calls) {
      expect(q).toContain(`<${instance}~/a%3Eb%20c>`)
      expect(q).not.toContain('a>b c')
    }
  })
})

describe('term IRIs in query builders', () => {
  const builders = createQueryBuilders(instance, async () => ({ results: { bindings: [] } }))
  const multiPass = (over = {}) => ({
    meta: { resultMode: 'pages' },
    subjects: { mode: 'exact', include: [], exclude: [] },
    objects: { type: 'termsOnly', mode: 'exact', include: ['site changes'], exclude: [] },
    filters: {
      subtype: '', limitResults: 'no-limit', offsetResults: '0',
      dateRange: {}, createdRange: null, indexedRange: null,
    },
    ...over,
  })

  it('encodes term objects on the read path', () => {
    const q = builders.buildSimpleQuery(multiPass())
    expect(q).toContain(`<${instance}~/site%20changes>`)
    expect(q).not.toContain('~/site changes')
  })

  it('encodes relationTerms', () => {
    const q = builders.buildSimpleQuery(multiPass({
      objects: { type: 'pagesOnly', mode: 'exact', include: ['https://example.com/x'], exclude: [] },
      filters: { ...multiPass().filters, relationTerms: ['two words'] },
    }))
    expect(q).toContain(`<${instance}~/two%20words>`)
  })
})

describe('RDFa / harmonizer parity', () => {
  it('textContent term in RDFa yields the same IRI as termIri', () => {
    const doc = new JSDOM(
      `<html><body><span rel="octo:octothorpes">site changes</span><span rel="octo:octothorpes">a|b</span></body></html>`
    ).window.document
    const triples = rdfa2triples({ doc, s: 'https://example.com/page', instance }).join('\n')
    expect(triples).toContain(`<${termIri(instance, 'site changes')}>`)
    expect(triples).toContain(`<${termIri(instance, 'a|b')}>`)
  })
})

// The read side of #285: a term's identity is its decoded name, and the IRI is
// only its spelling. termName inverts termIri so output shows `site changes`,
// not `site%20changes`.
describe('termName', () => {
  const I = 'https://relay.test/'

  it('round-trips every name termIri encodes', () => {
    for (const name of ['demo', 'site changes', 'a<b>"c"{d}|e\\f^g`h', '100%', '100% sure', 'café', 'tab\there']) {
      expect(termName(termIri(I, name))).toBe(name)
    }
  })

  it('decodes percent-encoded non-ASCII written by the RDFa path', () => {
    expect(termName(`${I}~/caf%C3%A9`)).toBe('café')
  })

  it('returns the raw tail when it is not valid percent-encoding', () => {
    expect(termName(`${I}~/100%`)).toBe('100%')
    expect(termName(`${I}~/%E0%A4%A`)).toBe('%E0%A4%A')
  })

  it('takes everything after the first /~/, so a term may contain ~/', () => {
    expect(termName(`${I}~/a~/b`)).toBe('a~/b')
  })

  it('returns a non-term string unchanged', () => {
    expect(termName('plain')).toBe('plain')
  })
})

describe('blobject output uses decoded term names', () => {
  it('lists a spaced term by its name, not its IRI spelling', async () => {
    const response = {
      results: {
        bindings: [{
          s: { value: 'https://site.test/page' },
          o: { value: 'https://relay.test/~/site%20changes' },
          oType: { value: 'octo:Term' },
        }],
      },
    }
    const [blob] = await getBlobjectFromResponse(response)
    expect(blob.octothorpes).toContain('site changes')
    expect(blob.octothorpes).not.toContain('site%20changes')
  })
})

describe('term lists (what=thorpes) use decoded names', () => {
  it('parseBindings terms mode decodes the term after /~/', async () => {
    const { parseBindings } = await import('../../packages/core/utils.js')
    const out = parseBindings([
      { o: { value: 'https://relay.test/~/site%20changes' }, date: { value: '1' } },
      { o: { value: 'https://relay.test/~/demo' }, date: { value: '2' } },
    ], 'terms')
    expect(out.map((r) => r.term)).toEqual(['site changes', 'demo'])
  })
})
