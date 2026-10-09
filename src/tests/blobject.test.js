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
