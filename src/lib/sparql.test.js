import { describe, it, expect } from 'vitest'
import { 
  buildEverythingQuery, 
  buildSimpleQuery, 
  buildThorpeQuery, 
  buildDomainQuery,
  buildBookmarksWithTermsQuery,
  cleanQuery
} from './sparql.js'

describe('cleanQuery', () => {
  it('should remove extra whitespace and newlines', () => {
    const dirtyQuery = `
      SELECT ?s ?o
      WHERE {
        ?s ?p ?o .
      }
    `
    const result = cleanQuery(dirtyQuery)
    expect(result).toBe('SELECT ?s ?o WHERE { ?s ?p ?o . }')
  })

  it('should handle single line queries', () => {
    const query = 'SELECT ?s WHERE { ?s ?p ?o . }'
    const result = cleanQuery(query)
    expect(result).toBe(query)
  })
})

describe('buildEverythingQuery', () => {
  it('should build basic everything query', () => {
    const multiPass = {
      meta: { resultMode: 'everything' },
      subjects: { mode: 'all', include: [], exclude: [] },
      objects: { type: 'all', mode: 'all', include: [], exclude: [] },
      filters: { subtype: null, limitResults: 100, offsetResults: 0, dateRange: null }
    }

    const result = buildEverythingQuery(multiPass)
    
    expect(result).toContain('SELECT DISTINCT ?s ?o ?title ?description ?image ?date ?pageType ?ot ?od ?oimg ?oType ?blankNode ?blankNodePred ?blankNodeObj')
    expect(result).toContain('?s octo:indexed ?date')
    expect(result).toContain('?s rdf:type ?pageType')
    expect(result).toContain('?s octo:octothorpes ?o')
  })

  it('should include subject filtering', () => {
    const multiPass = {
      meta: { resultMode: 'everything' },
      subjects: { mode: 'exact', include: ['https://example.com'], exclude: [] },
      objects: { type: 'all', mode: 'all', include: [], exclude: [] },
      filters: { subtype: null, limitResults: 100, offsetResults: 0, dateRange: null }
    }

    const result = buildEverythingQuery(multiPass)
    
    expect(result).toContain('VALUES ?s { <https://example.com> }')
  })

  it('should include object filtering', () => {
    const multiPass = {
      meta: { resultMode: 'everything' },
      subjects: { mode: 'all', include: [], exclude: [] },
      objects: { type: 'termsOnly', mode: 'exact', include: ['test-tag'], exclude: [] },
      filters: { subtype: null, limitResults: 100, offsetResults: 0, dateRange: null }
    }

    const result = buildEverythingQuery(multiPass)
    
    expect(result).toContain('VALUES ?o { <https://octothorp.es/~/test-tag> }')
  })

  it('should include date filtering', () => {
    const multiPass = {
      meta: { resultMode: 'everything' },
      subjects: { mode: 'all', include: [], exclude: [] },
      objects: { type: 'all', mode: 'all', include: [], exclude: [] },
      filters: { subtype: null, limitResults: 100, offsetResults: 0, dateRange: { after: 1703123456 } }
    }

    const result = buildEverythingQuery(multiPass)
    
    expect(result).toContain('FILTER(?date > 1703123456)')
  })

  it('should include subtype filtering', () => {
    const multiPass = {
      meta: { resultMode: 'everything' },
      subjects: { mode: 'all', include: [], exclude: [] },
      objects: { type: 'all', mode: 'all', include: [], exclude: [] },
      filters: { subtype: 'Bookmark', limitResults: 100, offsetResults: 0, dateRange: null }
    }

    const result = buildEverythingQuery(multiPass)
    
    expect(result).toContain('FILTER EXISTS')
    expect(result).toContain('octo:Bookmark')
  })
})

describe('buildSimpleQuery', () => {
  it('should build basic simple query', () => {
    const multiPass = {
      meta: { resultMode: 'simple' },
      subjects: { mode: 'all', include: [], exclude: [] },
      objects: { type: 'all', mode: 'all', include: [], exclude: [] },
      filters: { subtype: null, limitResults: 100, offsetResults: 0, dateRange: null }
    }

    const result = buildSimpleQuery(multiPass)
    
    expect(result).toContain('SELECT DISTINCT ?s ?o')
    expect(result).toContain('?s octo:octothorpes ?o')
  })

  it('should include limit and offset', () => {
    const multiPass = {
      meta: { resultMode: 'simple' },
      subjects: { mode: 'all', include: [], exclude: [] },
      objects: { type: 'all', mode: 'all', include: [], exclude: [] },
      filters: { subtype: null, limitResults: 50, offsetResults: 100, dateRange: null }
    }

    const result = buildSimpleQuery(multiPass)
    
    expect(result).toContain('LIMIT 50')
    expect(result).toContain('OFFSET 100')
  })
})

describe('buildThorpeQuery', () => {
  it('should build basic thorpe query', () => {
    const multiPass = {
      meta: { resultMode: 'thorpes' },
      subjects: { mode: 'all', include: [], exclude: [] },
      objects: { type: 'all', mode: 'all', include: [], exclude: [] },
      filters: { subtype: null, limitResults: 100, offsetResults: 0, dateRange: null }
    }

    const result = buildThorpeQuery(multiPass)
    
    expect(result).toContain('SELECT DISTINCT ?o ?date')
    expect(result).toContain('?s octo:octothorpes ?o')
    expect(result).toContain('?o rdf:type <octo:Term>')
  })

  it('should include subject filtering', () => {
    const multiPass = {
      meta: { resultMode: 'thorpes' },
      subjects: { mode: 'fuzzy', include: ['example'], exclude: [] },
      objects: { type: 'all', mode: 'all', include: [], exclude: [] },
      filters: { subtype: null, limitResults: 100, offsetResults: 0, dateRange: null }
    }

    const result = buildThorpeQuery(multiPass)
    
    expect(result).toContain('FILTER(CONTAINS(STR(?s), ?subList))')
  })
})

describe('buildDomainQuery', () => {
  it('should build basic domain query', () => {
    const multiPass = {
      meta: { resultMode: 'domains' },
      subjects: { mode: 'all', include: [], exclude: [] },
      objects: { type: 'all', mode: 'all', include: [], exclude: [] },
      filters: { subtype: null, limitResults: 100, offsetResults: 0, dateRange: null }
    }

    const result = buildDomainQuery(multiPass)
    
    expect(result).toContain('SELECT DISTINCT ?domain')
    expect(result).toContain('?domain rdf:type <octo:Origin>')
  })

  it('should include object filtering', () => {
    const multiPass = {
      meta: { resultMode: 'domains' },
      subjects: { mode: 'all', include: [], exclude: [] },
      objects: { type: 'termsOnly', mode: 'exact', include: ['test-tag'], exclude: [] },
      filters: { subtype: null, limitResults: 100, offsetResults: 0, dateRange: null }
    }

    const result = buildDomainQuery(multiPass)
    
    expect(result).toContain('VALUES ?term { <https://octothorp.es/~/test-tag> }')
    expect(result).toContain('?domain octo:hasPart ?page')
    expect(result).toContain('?page octo:octothorpes ?term')
  })
})

describe('buildBookmarksWithTermsQuery', () => {
  it('should build basic bookmarks with terms query', () => {
    const multiPass = {
      meta: { resultMode: 'bookmarksWithTerms' },
      subjects: { mode: 'all', include: [], exclude: [] },
      objects: { type: 'all', mode: 'all', include: [], exclude: [] },
      filters: { subtype: null, limitResults: 100, offsetResults: 0, dateRange: null }
    }

    const result = buildBookmarksWithTermsQuery(multiPass)
    
    expect(result).toContain('SELECT DISTINCT ?s ?bookmarkNode ?bookmarkUrl ?bookmarkDate ?term ?termType ?termTitle ?termDescription')
    expect(result).toContain('?s octo:octothorpes ?bookmarkNode')
    expect(result).toContain('FILTER(isBlank(?bookmarkNode))')
    expect(result).toContain('?bookmarkNode rdf:type <octo:Bookmark>')
    expect(result).toContain('?bookmarkNode octo:url ?bookmarkUrl')
    expect(result).toContain('?bookmarkNode octo:created ?bookmarkDate')
    expect(result).toContain('?bookmarkNode octo:octothorpes ?term')
  })

  it('should include subject filtering', () => {
    const multiPass = {
      meta: { resultMode: 'bookmarksWithTerms' },
      subjects: { mode: 'exact', include: ['https://example.com'], exclude: [] },
      objects: { type: 'all', mode: 'all', include: [], exclude: [] },
      filters: { subtype: null, limitResults: 100, offsetResults: 0, dateRange: null }
    }

    const result = buildBookmarksWithTermsQuery(multiPass)
    
    expect(result).toContain('VALUES ?s { <https://example.com> }')
  })

  it('should include object filtering', () => {
    const multiPass = {
      meta: { resultMode: 'bookmarksWithTerms' },
      subjects: { mode: 'all', include: [], exclude: [] },
      objects: { type: 'termsOnly', mode: 'exact', include: ['tech'], exclude: [] },
      filters: { subtype: null, limitResults: 100, offsetResults: 0, dateRange: null }
    }

    const result = buildBookmarksWithTermsQuery(multiPass)
    
    expect(result).toContain('VALUES ?term { <https://octothorp.es/~/tech> }')
  })

  it('should include date filtering', () => {
    const multiPass = {
      meta: { resultMode: 'bookmarksWithTerms' },
      subjects: { mode: 'all', include: [], exclude: [] },
      objects: { type: 'all', mode: 'all', include: [], exclude: [] },
      filters: { subtype: null, limitResults: 100, offsetResults: 0, dateRange: { before: 1703123456 } }
    }

    const result = buildBookmarksWithTermsQuery(multiPass)
    
    expect(result).toContain('FILTER(?bookmarkDate < 1703123456)')
  })

  it('should order by bookmark date descending', () => {
    const multiPass = {
      meta: { resultMode: 'bookmarksWithTerms' },
      subjects: { mode: 'all', include: [], exclude: [] },
      objects: { type: 'all', mode: 'all', include: [], exclude: [] },
      filters: { subtype: null, limitResults: 100, offsetResults: 0, dateRange: null }
    }

    const result = buildBookmarksWithTermsQuery(multiPass)
    
    expect(result).toContain('ORDER BY ?bookmarkDate DESC')
  })
})

describe('Query building edge cases', () => {
  it('should handle empty subject and object filters', () => {
    const multiPass = {
      meta: { resultMode: 'everything' },
      subjects: { mode: 'all', include: [], exclude: [] },
      objects: { type: 'all', mode: 'all', include: [], exclude: [] },
      filters: { subtype: null, limitResults: 100, offsetResults: 0, dateRange: null }
    }

    const result = buildEverythingQuery(multiPass)
    
    // Should not contain VALUES clauses for empty arrays
    expect(result).not.toContain('VALUES ?s { }')
    expect(result).not.toContain('VALUES ?o { }')
  })

  it('should handle fuzzy matching for subjects', () => {
    const multiPass = {
      meta: { resultMode: 'everything' },
      subjects: { mode: 'fuzzy', include: ['example'], exclude: [] },
      objects: { type: 'all', mode: 'all', include: [], exclude: [] },
      filters: { subtype: null, limitResults: 100, offsetResults: 0, dateRange: null }
    }

    const result = buildEverythingQuery(multiPass)
    
    expect(result).toContain('VALUES ?subList { "example" }')
    expect(result).toContain('FILTER(CONTAINS(STR(?s), ?subList))')
  })

  it('should handle fuzzy matching for objects', () => {
    const multiPass = {
      meta: { resultMode: 'everything' },
      subjects: { mode: 'all', include: [], exclude: [] },
      objects: { type: 'termsOnly', mode: 'fuzzy', include: ['test'], exclude: [] },
      filters: { subtype: null, limitResults: 100, offsetResults: 0, dateRange: null }
    }

    const result = buildEverythingQuery(multiPass)
    
    expect(result).toContain('VALUES ?objList { "test" }')
    expect(result).toContain('FILTER(CONTAINS(STR(?o), ?objList))')
  })

  it('should handle very fuzzy matching', () => {
    const multiPass = {
      meta: { resultMode: 'everything' },
      subjects: { mode: 'all', include: [], exclude: [] },
      objects: { type: 'termsOnly', mode: 'very-fuzzy', include: ['test'], exclude: [] },
      filters: { subtype: null, limitResults: 100, offsetResults: 0, dateRange: null }
    }

    const result = buildEverythingQuery(multiPass)
    
    expect(result).toContain('FILTER(CONTAINS(STR(?o), ?objList))')
  })

  it('should handle byParent mode for subjects', () => {
    const multiPass = {
      meta: { resultMode: 'everything' },
      subjects: { mode: 'byParent', include: ['https://webring.example/'], exclude: [] },
      objects: { type: 'all', mode: 'all', include: [], exclude: [] },
      filters: { subtype: null, limitResults: 100, offsetResults: 0, dateRange: null }
    }

    const result = buildEverythingQuery(multiPass)
    
    expect(result).toContain('VALUES ?parents { <https://webring.example/> }')
    expect(result).toContain('?parents octo:hasMember ?sdomain')
    expect(result).toContain('?sdomain octo:hasPart ?s')
  })
}) 