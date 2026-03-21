import { describe, it, expect } from 'vitest'
import { testQueryFromMultiPass, buildSimpleQuery } from '$lib/sparql.js'
import { createQueryBuilders } from '$lib/queryBuilders.js'

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
    expect(query).toContain('COALESCE(?postDate, ?date) >= 1700000000000')
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

describe('subtypeFilter - source-anchored', () => {
  const instance = 'http://localhost:5173/'
  const builders = createQueryBuilders(instance)

  it('should generate source-anchored subtype filter', () => {
    const result = builders.getStatements(
      { include: ['https://example.com'], exclude: [], mode: 'exact' },
      { include: [], exclude: [], mode: 'exact', type: 'notTerms' },
      { subtype: 'Bookmark', limitResults: '100', offsetResults: '0' },
      'links'
    )

    expect(result.subtypeFilter).toContain('?s octo:octothorpes ?_stBn')
    expect(result.subtypeFilter).toContain('?_stBn octo:url ?o')
    expect(result.subtypeFilter).toContain('?_stBn rdf:type <octo:Bookmark>')
    // Should NOT traverse from ?o to blank node
    expect(result.subtypeFilter).not.toContain('?o ?blankNodePred')
  })
})

describe('relationTermsFilter - source-anchored', () => {
  const instance = 'http://localhost:5173/'
  const builders = createQueryBuilders(instance)

  it('should traverse directly from source to blank node to term', () => {
    const result = builders.getStatements(
      { include: ['https://example.com'], exclude: [], mode: 'exact' },
      { include: [], exclude: [], mode: 'exact', type: 'notTerms' },
      { subtype: '', relationTerms: ['gadgets'], limitResults: '100', offsetResults: '0' },
      'links'
    )

    expect(result.relationTermsFilter).toContain('?s octo:octothorpes ?_rtBn')
    expect(result.relationTermsFilter).toContain('FILTER(isBlank(?_rtBn))')
    expect(result.relationTermsFilter).toContain('?_rtBn octo:octothorpes ?relationTerm')
    expect(result.relationTermsFilter).toContain(`${instance}~/gadgets>`)
    // Should NOT traverse through an intermediate target
    expect(result.relationTermsFilter).not.toContain('?_rtTarget')
    // Should NOT traverse from ?o
    expect(result.relationTermsFilter).not.toContain('?o ?blankNodePred')
  })

  it('should include all terms in VALUES clause', () => {
    const result = builders.getStatements(
      { include: ['https://example.com'], exclude: [], mode: 'exact' },
      { include: [], exclude: [], mode: 'exact', type: 'notTerms' },
      { subtype: '', relationTerms: ['gadgets', 'bikes'], limitResults: '100', offsetResults: '0' },
      'links'
    )

    expect(result.relationTermsFilter).toContain(`~/gadgets>`)
    expect(result.relationTermsFilter).toContain(`~/bikes>`)
  })
})

describe('merged subtypeFilter + relationTermsFilter', () => {
  const instance = 'http://localhost:5173/'
  const builders = createQueryBuilders(instance)

  it('should merge subtype and relationTerms into one FILTER EXISTS block', () => {
    const result = builders.getStatements(
      { include: ['https://example.com'], exclude: [], mode: 'exact' },
      { include: [], exclude: [], mode: 'exact', type: 'notTerms' },
      { subtype: 'Bookmark', relationTerms: ['gadgets'], limitResults: '100', offsetResults: '0' },
      'links'
    )

    // Should produce a single merged filter, not two separate ones
    expect(result.subtypeFilter).toContain('rdf:type <octo:Bookmark>')
    expect(result.subtypeFilter).toContain('octo:octothorpes ?relationTerm')
    expect(result.subtypeFilter).toContain('~/gadgets>')
    // relationTermsFilter should be empty since it's merged into subtypeFilter
    expect(result.relationTermsFilter).toBe('')
  })

  it('should use same blank node variable for both constraints', () => {
    const result = builders.getStatements(
      { include: ['https://example.com'], exclude: [], mode: 'exact' },
      { include: [], exclude: [], mode: 'exact', type: 'notTerms' },
      { subtype: 'Bookmark', relationTerms: ['gadgets'], limitResults: '100', offsetResults: '0' },
      'links'
    )

    // Both type and term constraints should reference the same blank node
    const filter = result.subtypeFilter
    const bnMatch = filter.match(/\?(\w+Bn)\b/g)
    const uniqueBns = [...new Set(bnMatch)]
    // All blank node references should be the same variable
    expect(uniqueBns.length).toBe(1)
  })

  it('should keep subtypeFilter alone when no relationTerms', () => {
    const result = builders.getStatements(
      { include: ['https://example.com'], exclude: [], mode: 'exact' },
      { include: [], exclude: [], mode: 'exact', type: 'notTerms' },
      { subtype: 'Bookmark', limitResults: '100', offsetResults: '0' },
      'links'
    )

    expect(result.subtypeFilter).toContain('rdf:type <octo:Bookmark>')
    expect(result.subtypeFilter).not.toContain('?relationTerm')
    expect(result.relationTermsFilter).toBe('')
  })

  it('should keep relationTermsFilter alone when no subtype', () => {
    const result = builders.getStatements(
      { include: ['https://example.com'], exclude: [], mode: 'exact' },
      { include: [], exclude: [], mode: 'exact', type: 'notTerms' },
      { subtype: '', relationTerms: ['tools'], limitResults: '100', offsetResults: '0' },
      'links'
    )

    expect(result.relationTermsFilter).toContain('?_rtBn')
    expect(result.relationTermsFilter).toContain('~/tools>')
    expect(result.subtypeFilter).toBe('')
  })

  it('should include multiple terms in VALUES when merged', () => {
    const result = builders.getStatements(
      { include: ['https://example.com'], exclude: [], mode: 'exact' },
      { include: [], exclude: [], mode: 'exact', type: 'notTerms' },
      { subtype: 'Cite', relationTerms: ['methodology', 'disagree'], limitResults: '100', offsetResults: '0' },
      'links'
    )

    expect(result.subtypeFilter).toContain('~/methodology>')
    expect(result.subtypeFilter).toContain('~/disagree>')
    expect(result.subtypeFilter).toContain('rdf:type <octo:Cite>')
  })
})

describe('getStatements guard - relaxed for rt', () => {
  const instance = 'http://localhost:5173/'
  const builders = createQueryBuilders(instance)

  it('should allow getStatements with only relationTerms (no s or o)', () => {
    expect(() => {
      builders.getStatements(
        { include: [], exclude: [], mode: 'exact' },
        { include: [], exclude: [], mode: 'exact', type: 'notTerms' },
        { subtype: 'Bookmark', relationTerms: ['gadgets'], limitResults: '100', offsetResults: '0' },
        'links'
      )
    }).not.toThrow()
  })

  it('should still throw when no s, o, or rt', () => {
    expect(() => {
      builders.getStatements(
        { include: [], exclude: [], mode: 'exact' },
        { include: [], exclude: [], mode: 'exact', type: 'notTerms' },
        { subtype: 'Bookmark', limitResults: '100', offsetResults: '0' },
        'links'
      )
    }).toThrow()
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
