import { describe, it, expect } from 'vitest'
import { getBlobjectFromResponse } from '../../packages/core/blobject.js'

const OCTO = 'https://vocab.octothorp.es#'
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const OCTOTHORPES = `${OCTO}octothorpes`

describe('getBlobjectFromResponse - relationship reifiers (#270)', () => {
  it('should extract subtype and terms from reifier metadata bindings', async () => {
    // One row per reifier predicate: rdf:type (full subtype IRI) and a term
    const response = {
      results: {
        bindings: [
          {
            s: { value: 'https://source.com/page' },
            o: { value: 'https://target.com/page' },
            title: { value: 'Source Page' },
            date: { value: '1700000000000' },
            pageType: { value: 'octo:Page' },
            oType: { value: 'octo:Page' },
            reifier: { value: 'https://vocab.octothorp.es/r1/abc' },
            reifierPred: { value: RDF_TYPE },
            reifierObj: { value: `${OCTO}Bookmark` },
          },
          {
            s: { value: 'https://source.com/page' },
            o: { value: 'https://target.com/page' },
            title: { value: 'Source Page' },
            date: { value: '1700000000000' },
            pageType: { value: 'octo:Page' },
            oType: { value: 'octo:Page' },
            reifier: { value: 'https://vocab.octothorp.es/r1/abc' },
            reifierPred: { value: OCTOTHORPES },
            reifierObj: { value: 'http://localhost:5173/~/gadgets' },
          },
        ]
      }
    }

    const result = await getBlobjectFromResponse(response)
    expect(result).toHaveLength(1)

    const blob = result[0]
    const pageEntry = blob.octothorpes.find(o => typeof o === 'object' && o.uri === 'https://target.com/page')
    expect(pageEntry).toBeDefined()
    expect(pageEntry.type).toBe('Bookmark')
    expect(pageEntry.terms).toContain('gadgets')
  })
})

describe('getBlobjectFromResponse - limit/offset window (#185)', () => {
  const response = {
    results: {
      bindings: ['a', 'b', 'c', 'd', 'e'].map(id => ({
        s: { type: 'uri', value: `https://example.com/${id}` },
      })),
    },
  }
  const ids = (r) => r.map(b => b['@id'].split('/').pop())

  it('returns [offset, offset + limit) with MultiPass string params', async () => {
    expect(ids(await getBlobjectFromResponse(response, { limitResults: '2', offsetResults: '0' }))).toEqual(['a', 'b'])
    expect(ids(await getBlobjectFromResponse(response, { limitResults: '2', offsetResults: '2' }))).toEqual(['c', 'd'])
    expect(ids(await getBlobjectFromResponse(response, { limitResults: '2', offsetResults: '4' }))).toEqual(['e'])
  })

  it('treats limit 0 / no-limit as unbounded, still honouring offset', async () => {
    expect(ids(await getBlobjectFromResponse(response, { limitResults: '0', offsetResults: '0' }))).toHaveLength(5)
    expect(ids(await getBlobjectFromResponse(response, { limitResults: 'no-limit', offsetResults: '3' }))).toEqual(['d', 'e'])
  })
})

describe('getBlobjectFromResponse - subtype precedence across rows', () => {
  const row = (subtype) => ({
    s: { value: 'https://source.com/page' },
    o: { value: 'https://target.com/page' },
    date: { value: '1700000000000' },
    pageType: { value: 'octo:Page' },
    oType: { value: 'octo:Page' },
    reifierPred: { value: RDF_TYPE },
    reifierObj: { value: `${OCTO}${subtype}` },
  })
  const typeFor = async (...objs) => {
    const [blob] = await getBlobjectFromResponse({ results: { bindings: objs.map(row) } })
    return blob.octothorpes.find(o => o.uri === 'https://target.com/page').type
  }

  it('Backlink survives Link in either row order (promoted dual-typed node)', async () => {
    expect(await typeFor('Link', 'Backlink')).toBe('Backlink')
    expect(await typeFor('Backlink', 'Link')).toBe('Backlink')
  })

  it('a specific subtype beats Link regardless of order', async () => {
    expect(await typeFor('Link', 'Bookmark')).toBe('Bookmark')
    expect(await typeFor('Bookmark', 'Link')).toBe('Bookmark')
  })

  it('stays Link when only Link rows exist', async () => {
    expect(await typeFor('Link', 'Link')).toBe('Link')
  })

  it('a term row is not mistaken for a subtype', async () => {
    const [blob] = await getBlobjectFromResponse({ results: { bindings: [{
      ...row('Bookmark'), reifierPred: { value: OCTOTHORPES }, reifierObj: { value: 'http://localhost:5173/~/gadgets' },
    }] } })
    const entry = blob.octothorpes.find(o => o.uri === 'https://target.com/page')
    expect(entry.type).toBe('link')
    expect(entry.terms).toEqual(['gadgets'])
  })
})

describe('getBlobjectFromResponse - page date is order-independent', () => {
  // Rows tie on ORDER BY DESC(COALESCE(?postDate, ?date)) whenever postDate
  // is present; ?date then varies per row (one `?s ?o ?date` per target).
  const row = (o, date) => ({
    s: { value: 'https://source.com/page' },
    o: { value: o },
    date: { value: date },
    postDate: { value: '1600000000000' },
    oType: { value: 'octo:Page' },
  })
  const rows = [row('https://a.test/', '1700000000001'), row('https://b.test/', '1700000000003'), row('https://c.test/', '1700000000002')]
  const dateOf = async (bindings) => (await getBlobjectFromResponse({ results: { bindings } }))[0].date

  it('keeps the MAX ?date across rows, in any row order', async () => {
    expect(await dateOf(rows)).toBe(1700000000003)
    expect(await dateOf([...rows].reverse())).toBe(1700000000003)
    expect(await dateOf([rows[1], rows[0], rows[2]])).toBe(1700000000003)
  })

  it('postDate is unaffected', async () => {
    const [blob] = await getBlobjectFromResponse({ results: { bindings: rows } })
    expect(blob.postDate).toBe(1600000000000)
  })
})

describe('api.get everything - dual-typed (promoted) relationship through the full path', () => {
  const S = 'https://source.com/page', T = 'https://target.com/page'
  const run = async (typeRows) => {
    const { createApi } = await import('../../packages/core/api.js')
    const queryArray = async (q) => {
      // enrichment query: one row per reifier type
      if (q.includes('?relType')) {
        return { results: { bindings: typeRows.map(t => ({ source: { value: S }, target: { value: T }, relType: { value: `${OCTO}${t}` } })) } }
      }
      // main blobject query: one row per reifier rdf:type value
      return { results: { bindings: typeRows.map(t => ({
        s: { value: S }, o: { value: T }, date: { value: '1700000000000' },
        pageType: { value: 'octo:Page' }, oType: { value: 'octo:Page' },
        reifier: { value: `https://vocab.octothorp.es/r1/${t}` },
        reifierPred: { value: RDF_TYPE }, reifierObj: { value: `${OCTO}${t}` },
      })) } }
    }
    const api = createApi({ instance: 'https://relay.test/', queryArray, queryBoolean: async () => false, insert: async () => {}, query: async () => {} })
    const { actualResults } = await api.get('everything', 'linked', { s: S, as: 'debug' })
    return actualResults[0].octothorpes.find(o => o.uri === T).type
  }

  it('reports Backlink for a Link+Backlink node in either row order', async () => {
    expect(await run(['Link', 'Backlink'])).toBe('Backlink')
    expect(await run(['Backlink', 'Link'])).toBe('Backlink')
  })
  it('a specific subtype still beats Backlink (existing enrichment behaviour)', async () => {
    expect(await run(['Backlink', 'Bookmark'])).toBe('Bookmark')
    expect(await run(['Bookmark', 'Backlink'])).toBe('Bookmark')
  })
})
