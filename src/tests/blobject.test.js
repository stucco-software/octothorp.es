import { describe, it, expect } from 'vitest'
import { getBlobjectFromResponse } from '../../packages/core/blobject.js'

describe('getBlobjectFromResponse - source-anchored blank nodes', () => {
  it('should extract subtype and terms from source-anchored blank node bindings', async () => {
    // Simulate SPARQL bindings where blank node data comes from source side
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
            blankNodeObj: { value: 'octo:Bookmark' },
          },
          {
            s: { value: 'https://source.com/page' },
            o: { value: 'https://target.com/page' },
            title: { value: 'Source Page' },
            date: { value: '1700000000000' },
            pageType: { value: 'octo:Page' },
            oType: { value: 'octo:Page' },
            blankNodeObj: { value: 'http://localhost:5173/~/gadgets' },
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
  const row = (blankNodeObj) => ({
    s: { value: 'https://source.com/page' },
    o: { value: 'https://target.com/page' },
    date: { value: '1700000000000' },
    pageType: { value: 'octo:Page' },
    oType: { value: 'octo:Page' },
    blankNodeObj: { value: blankNodeObj },
  })
  const typeFor = async (...objs) => {
    const [blob] = await getBlobjectFromResponse({ results: { bindings: objs.map(row) } })
    return blob.octothorpes.find(o => o.uri === 'https://target.com/page').type
  }

  it('Backlink survives Link in either row order (promoted dual-typed node)', async () => {
    expect(await typeFor('octo:Link', 'octo:Backlink')).toBe('Backlink')
    expect(await typeFor('octo:Backlink', 'octo:Link')).toBe('Backlink')
  })

  it('a specific subtype beats Link regardless of order', async () => {
    expect(await typeFor('octo:Link', 'octo:Bookmark')).toBe('Bookmark')
    expect(await typeFor('octo:Bookmark', 'octo:Link')).toBe('Bookmark')
  })

  it('stays Link when only Link rows exist', async () => {
    expect(await typeFor('octo:Link', 'octo:Link')).toBe('Link')
  })
})

describe('api.get everything - dual-typed (promoted) relationship through the full path', () => {
  const S = 'https://source.com/page', T = 'https://target.com/page'
  const run = async (typeRows) => {
    const { createApi } = await import('../../packages/core/api.js')
    const queryArray = async (q) => {
      // enrichment query: one row per bnType
      if (q.includes('?bnType')) {
        return { results: { bindings: typeRows.map(t => ({ source: { value: S }, target: { value: T }, bnType: { value: t } })) } }
      }
      // main blobject query: one row per blank-node predicate object
      return { results: { bindings: typeRows.map(t => ({
        s: { value: S }, o: { value: T }, date: { value: '1700000000000' },
        pageType: { value: 'octo:Page' }, oType: { value: 'octo:Page' },
        blankNode: { value: 'bn1' }, blankNodeObj: { value: t },
      })) } }
    }
    const api = createApi({ instance: 'https://relay.test/', queryArray, queryBoolean: async () => false, insert: async () => {}, query: async () => {} })
    const { actualResults } = await api.get('everything', 'linked', { s: S, as: 'debug' })
    return actualResults[0].octothorpes.find(o => o.uri === T).type
  }

  it('reports Backlink for a Link+Backlink node in either row order', async () => {
    expect(await run(['octo:Link', 'octo:Backlink'])).toBe('Backlink')
    expect(await run(['octo:Backlink', 'octo:Link'])).toBe('Backlink')
  })
  it('a specific subtype still beats Backlink (existing enrichment behaviour)', async () => {
    expect(await run(['octo:Backlink', 'octo:Bookmark'])).toBe('Bookmark')
    expect(await run(['octo:Bookmark', 'octo:Backlink'])).toBe('Bookmark')
  })
})
