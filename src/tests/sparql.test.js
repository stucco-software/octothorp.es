import { describe, it, expect } from 'vitest'
import { testQueryFromMultiPass, buildSimpleQuery } from '$lib/sparql.js'
import { createQueryBuilders } from 'octothorpes'

describe('buildObjectStatement via testQueryFromMultiPass', () => {
  describe('mode "all" with terms', () => {
    it('should include VALUES clause for ?o binding', () => {
      const result = testQueryFromMultiPass({
        meta: { resultMode: 'blobjects' },
        subjects: { mode: 'exact', include: [], exclude: [] },
        objects: { type: 'termsOnly', mode: 'all', include: ['cats', 'tacos'], exclude: [] },
        filters: { dateRange: {}, limitResults: '100', offsetResults: '0' }
      })

      expect(result.objectStatement).toContain('VALUES ?o')
    })

    it('should include FILTER EXISTS for each term', () => {
      const result = testQueryFromMultiPass({
        meta: { resultMode: 'blobjects' },
        subjects: { mode: 'exact', include: [], exclude: [] },
        objects: { type: 'termsOnly', mode: 'all', include: ['cats', 'tacos'], exclude: [] },
        filters: { dateRange: {}, limitResults: '100', offsetResults: '0' }
      })

      expect(result.objectStatement).toContain('FILTER EXISTS')
      // Should have one FILTER EXISTS per term
      const filterCount = (result.objectStatement.match(/FILTER EXISTS/g) || []).length
      expect(filterCount).toBe(2)
    })

    it('should reference correct term URIs in FILTER EXISTS', () => {
      const result = testQueryFromMultiPass({
        meta: { resultMode: 'blobjects' },
        subjects: { mode: 'exact', include: [], exclude: [] },
        objects: { type: 'termsOnly', mode: 'all', include: ['cats', 'tacos'], exclude: [] },
        filters: { dateRange: {}, limitResults: '100', offsetResults: '0' }
      })

      expect(result.objectStatement).toContain('~/cats>')
      expect(result.objectStatement).toContain('~/tacos>')
    })

    it('should work with a single term (no FILTER EXISTS needed but still valid)', () => {
      const result = testQueryFromMultiPass({
        meta: { resultMode: 'blobjects' },
        subjects: { mode: 'exact', include: [], exclude: [] },
        objects: { type: 'termsOnly', mode: 'all', include: ['cats'], exclude: [] },
        filters: { dateRange: {}, limitResults: '100', offsetResults: '0' }
      })

      expect(result.objectStatement).toContain('VALUES ?o')
      // Single term still gets a FILTER EXISTS -- harmless
      const filterCount = (result.objectStatement.match(/FILTER EXISTS/g) || []).length
      expect(filterCount).toBe(1)
    })
  })

  describe('mode "all" with page URIs', () => {
    it('should include VALUES clause and FILTER EXISTS for page URIs', () => {
      const result = testQueryFromMultiPass({
        meta: { resultMode: 'links' },
        subjects: { mode: 'exact', include: [], exclude: [] },
        objects: { type: 'notTerms', mode: 'all', include: ['https://a.com', 'https://b.com'], exclude: [] },
        filters: { dateRange: {}, limitResults: '100', offsetResults: '0' }
      })

      expect(result.objectStatement).toContain('VALUES ?o')
      expect(result.objectStatement).toContain('FILTER EXISTS')
      expect(result.objectStatement).toContain('<https://a.com>')
      expect(result.objectStatement).toContain('<https://b.com>')
      const filterCount = (result.objectStatement.match(/FILTER EXISTS/g) || []).length
      expect(filterCount).toBe(2)
    })
  })
})

describe('postDate in SPARQL queries', () => {
  it('should include postDate OPTIONAL in buildSimpleQuery', () => {
    const multiPass = {
      meta: { resultMode: 'links' },
      subjects: { mode: 'exact', include: ['https://example.com'], exclude: [] },
      objects: { type: 'termsOnly', mode: 'exact', include: ['demo'], exclude: [] },
      filters: {
        subtype: '',
        relationTerms: undefined,
        limitResults: '100',
        offsetResults: '0',
        dateRange: null,
        createdRange: null,
        indexedRange: null
      }
    }
    const query = buildSimpleQuery(multiPass)
    expect(query).toContain('octo:postDate')
    expect(query).toContain('?postDate')
  })

  it('should filter on ?postDate when dateRange is set', () => {
    const multiPass = {
      meta: { resultMode: 'links' },
      subjects: { mode: 'exact', include: ['https://example.com'], exclude: [] },
      objects: { type: 'termsOnly', mode: 'exact', include: ['demo'], exclude: [] },
      filters: {
        subtype: '',
        relationTerms: undefined,
        limitResults: '100',
        offsetResults: '0',
        dateRange: { after: 1700000000000 },
        createdRange: null,
        indexedRange: null
      }
    }
    const query = buildSimpleQuery(multiPass)
    expect(query).toContain('?postDate >= 1700000000000')
  })

  it('should filter on ?createdDate when createdRange is set', () => {
    const multiPass = {
      meta: { resultMode: 'links' },
      subjects: { mode: 'exact', include: ['https://example.com'], exclude: [] },
      objects: { type: 'termsOnly', mode: 'exact', include: ['demo'], exclude: [] },
      filters: {
        subtype: '',
        relationTerms: undefined,
        limitResults: '100',
        offsetResults: '0',
        dateRange: null,
        createdRange: { after: 1700000000000 },
        indexedRange: null
      }
    }
    const query = buildSimpleQuery(multiPass)
    expect(query).toContain('octo:created')
    expect(query).toContain('?createdDate >= 1700000000000')
  })

  it('should filter on ?indexedDate when indexedRange is set', () => {
    const multiPass = {
      meta: { resultMode: 'links' },
      subjects: { mode: 'exact', include: ['https://example.com'], exclude: [] },
      objects: { type: 'termsOnly', mode: 'exact', include: ['demo'], exclude: [] },
      filters: {
        subtype: '',
        relationTerms: undefined,
        limitResults: '100',
        offsetResults: '0',
        dateRange: null,
        createdRange: null,
        indexedRange: { before: 1700000000000 }
      }
    }
    const query = buildSimpleQuery(multiPass)
    expect(query).toContain('octo:indexed')
    expect(query).toContain('?indexedDate <= 1700000000000')
  })
})

describe('postDate sort order', () => {
  it('should sort by COALESCE of postDate and date in buildSimpleQuery', () => {
    const multiPass = {
      meta: { resultMode: 'links' },
      subjects: { mode: 'exact', include: ['https://example.com'], exclude: [] },
      objects: { type: 'termsOnly', mode: 'exact', include: ['demo'], exclude: [] },
      filters: {
        subtype: '',
        relationTerms: undefined,
        limitResults: '100',
        offsetResults: '0',
        dateRange: null,
        createdRange: null,
        indexedRange: null
      }
    }
    const query = buildSimpleQuery(multiPass)
    expect(query).toContain('ORDER BY DESC(COALESCE(?postDate, ?date))')
  })
})

describe('buildSimpleQuery with match-all', () => {
  it('should produce SPARQL with VALUES and FILTER EXISTS for match=all terms', () => {
    const multiPass = {
      meta: { resultMode: 'links' },
      subjects: { mode: 'exact', include: [], exclude: [] },
      objects: { type: 'termsOnly', mode: 'all', include: ['cats', 'tacos'], exclude: [] },
      filters: { dateRange: null, subtype: null, limitResults: '100', offsetResults: '0' }
    }

    const query = buildSimpleQuery(multiPass)

    expect(query).toContain('VALUES ?o')
    expect(query).toContain('FILTER EXISTS')
    expect(query).toContain('~/cats>')
    expect(query).toContain('~/tacos>')
  })

  it('should NOT contain FILTER EXISTS for normal exact mode', () => {
    const multiPass = {
      meta: { resultMode: 'links' },
      subjects: { mode: 'exact', include: [], exclude: [] },
      objects: { type: 'termsOnly', mode: 'exact', include: ['cats', 'tacos'], exclude: [] },
      filters: { dateRange: null, subtype: null, limitResults: '100', offsetResults: '0' }
    }

    const query = buildSimpleQuery(multiPass)

    expect(query).toContain('VALUES ?o')
    expect(query).not.toContain('FILTER EXISTS')
  })
})

describe('createQueryBuilders', () => {
  const instance = 'https://test.example.com/'
  const builders = createQueryBuilders(instance)

  it('should use the provided instance for thorpePath', () => {
    const result = builders.testQueryFromMultiPass({
      meta: { resultMode: 'blobjects' },
      subjects: { mode: 'exact', include: [], exclude: [] },
      objects: { type: 'termsOnly', mode: 'exact', include: ['cats'], exclude: [] },
      filters: { dateRange: {}, limitResults: '100', offsetResults: '0' }
    })
    expect(result.processedObjs).toContain('https://test.example.com/~/cats')
  })

  it('should export all query builder functions', () => {
    expect(typeof builders.buildSimpleQuery).toBe('function')
    expect(typeof builders.buildEverythingQuery).toBe('function')
    expect(typeof builders.buildThorpeQuery).toBe('function')
    expect(typeof builders.buildDomainQuery).toBe('function')
    expect(typeof builders.getStatements).toBe('function')
    expect(typeof builders.prepEverything).toBe('function')
  })
})
