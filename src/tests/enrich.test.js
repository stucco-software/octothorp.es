import { describe, it, expect, vi, beforeEach } from 'vitest'
import { enrichBlobjectTargets } from '$lib/sparql.js'

// Mock fetch globally to intercept SPARQL queries
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function sparqlResponse(bindings) {
  return {
    ok: true,
    json: () => Promise.resolve({ results: { bindings } })
  }
}

beforeEach(() => {
  mockFetch.mockReset()
})

describe('enrichBlobjectTargets', () => {
  it('returns empty array unchanged', async () => {
    const result = await enrichBlobjectTargets([])
    expect(result).toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('skips query when no page-type octothorpes exist', async () => {
    const blobjects = [{
      '@id': 'http://example.com/page',
      title: 'Page',
      description: null,
      image: null,
      date: 1700000000,
      octothorpes: ['gadgets', 'bikes']
    }]
    const result = await enrichBlobjectTargets(blobjects)
    expect(result).toEqual(blobjects)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('merges subtype onto octothorpe objects', async () => {
    mockFetch.mockResolvedValueOnce(sparqlResponse([{
      source: { value: 'http://source.com/page' },
      target: { value: 'http://target.com/linked' },
      bnType: { value: 'octo:Bookmark' }
    }]))

    const blobjects = [{
      '@id': 'http://source.com/page',
      title: 'Source',
      description: null,
      image: null,
      date: 1700000000,
      octothorpes: [
        'gadgets',
        { uri: 'http://target.com/linked', type: 'link' }
      ]
    }]

    const result = await enrichBlobjectTargets(blobjects)
    const pageOcto = result[0].octothorpes.find(o => typeof o === 'object')
    expect(pageOcto.type).toBe('Bookmark')
  })

  it('merges terms array onto octothorpe objects', async () => {
    mockFetch.mockResolvedValueOnce(sparqlResponse([
      {
        source: { value: 'http://source.com/page' },
        target: { value: 'http://target.com/linked' },
        bnType: { value: 'octo:Bookmark' },
        term: { value: 'https://octothorp.es/~/gadgets' }
      },
      {
        source: { value: 'http://source.com/page' },
        target: { value: 'http://target.com/linked' },
        bnType: { value: 'octo:Bookmark' },
        term: { value: 'https://octothorp.es/~/bikes' }
      }
    ]))

    const blobjects = [{
      '@id': 'http://source.com/page',
      title: 'Source',
      description: null,
      image: null,
      date: 1700000000,
      octothorpes: [
        { uri: 'http://target.com/linked', type: 'link' }
      ]
    }]

    const result = await enrichBlobjectTargets(blobjects)
    const pageOcto = result[0].octothorpes[0]
    expect(pageOcto.type).toBe('Bookmark')
    expect(pageOcto.terms).toContain('gadgets')
    expect(pageOcto.terms).toContain('bikes')
  })

  it('handles mixed blobjects (some with targets, some without)', async () => {
    mockFetch.mockResolvedValueOnce(sparqlResponse([{
      source: { value: 'http://source.com/page1' },
      target: { value: 'http://target.com/linked' },
      bnType: { value: 'octo:Cite' },
      term: { value: 'https://octothorp.es/~/research' }
    }]))

    const blobjects = [
      {
        '@id': 'http://source.com/page1',
        title: 'Page with links',
        description: null,
        image: null,
        date: 1700000000,
        octothorpes: [
          'tag1',
          { uri: 'http://target.com/linked', type: 'link' }
        ]
      },
      {
        '@id': 'http://source.com/page2',
        title: 'Page with only terms',
        description: null,
        image: null,
        date: 1700000001,
        octothorpes: ['tag2', 'tag3']
      }
    ]

    const result = await enrichBlobjectTargets(blobjects)

    const enrichedOcto = result[0].octothorpes.find(o => typeof o === 'object')
    expect(enrichedOcto.type).toBe('Cite')
    expect(enrichedOcto.terms).toContain('research')

    expect(result[1].octothorpes).toEqual(['tag2', 'tag3'])
  })

  it('prefers specific subtype over Backlink', async () => {
    mockFetch.mockResolvedValueOnce(sparqlResponse([
      {
        source: { value: 'http://source.com/page' },
        target: { value: 'http://target.com/linked' },
        bnType: { value: 'octo:Backlink' }
      },
      {
        source: { value: 'http://source.com/page' },
        target: { value: 'http://target.com/linked' },
        bnType: { value: 'octo:Bookmark' }
      }
    ]))

    const blobjects = [{
      '@id': 'http://source.com/page',
      title: 'Source',
      description: null,
      image: null,
      date: 1700000000,
      octothorpes: [
        { uri: 'http://target.com/linked', type: 'link' }
      ]
    }]

    const result = await enrichBlobjectTargets(blobjects)
    expect(result[0].octothorpes[0].type).toBe('Bookmark')
  })

  it('does not add terms array when no terms exist', async () => {
    mockFetch.mockResolvedValueOnce(sparqlResponse([{
      source: { value: 'http://source.com/page' },
      target: { value: 'http://target.com/linked' },
      bnType: { value: 'octo:Bookmark' }
    }]))

    const blobjects = [{
      '@id': 'http://source.com/page',
      title: 'Source',
      description: null,
      image: null,
      date: 1700000000,
      octothorpes: [
        { uri: 'http://target.com/linked', type: 'link' }
      ]
    }]

    const result = await enrichBlobjectTargets(blobjects)
    expect(result[0].octothorpes[0].terms).toBeUndefined()
  })
})
