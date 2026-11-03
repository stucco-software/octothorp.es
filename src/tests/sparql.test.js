import { describe, it, expect } from 'vitest'
import { testQueryFromMultiPass, buildSimpleQuery } from '$lib/sparql.js'
import { createQueryBuilders, buildMultiPass } from 'octothorpes'

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

  it('breaks ties totally (DESC(?date), ?s, ?o) so the LIMIT window is stable (#270)', () => {
    const multiPass = {
      meta: { resultMode: 'links' },
      subjects: { mode: 'exact', include: [], exclude: [] },
      objects: { type: 'notTerms', mode: 'exact', include: [], exclude: [] },
      filters: { subtype: 'Cite', limitResults: '10', offsetResults: '0', dateRange: null },
    }
    const query = buildSimpleQuery(multiPass)
    expect(query).toMatch(/ORDER BY DESC\(COALESCE\(\?postDate, \?date\)\) DESC\(\?date\) \?s \?o\s+LIMIT 10/)
  })

  it('omits ?o from the tie-break when the query carries no objects', () => {
    const multiPass = {
      meta: { resultMode: 'links' },
      subjects: { mode: 'exact', include: ['https://example.com'], exclude: [] },
      objects: { type: 'none', mode: 'exact', include: [], exclude: [] },
      filters: { subtype: '', limitResults: '10', offsetResults: '0', dateRange: null },
    }
    const query = buildSimpleQuery(multiPass)
    expect(query).toContain('ORDER BY DESC(COALESCE(?postDate, ?date)) DESC(?date) ?s ')
    expect(query).not.toContain('?s ?o')
  })
})

describe('URL filter inputs are widened from their canonical() form (#270)', () => {
  const instance = 'http://localhost:5173/'
  const builders = createQueryBuilders(instance)
  const stmts = (o, mode = 'exact', type = 'notTerms', extra = {}) => builders.getStatements(
    { include: [], exclude: [], mode: 'exact' },
    { include: o, exclude: [], mode, type, ...extra },
    { subtype: 'Cite', limitResults: '10', offsetResults: '0' },
    'links'
  )

  it('matches the canonical store spelling of a www + slash-before-query input (dw.com shape)', () => {
    const { objectStatement } = stmts(['https://www.dw.com/english/?maca=en-rss&b=2'])
    // canonical(): www stripped, slash before the query dropped, params sorted
    expect(objectStatement).toContain('<https://dw.com/english?b=2&maca=en-rss>')
    expect(objectStatement).toContain('<https://www.dw.com/english?b=2&maca=en-rss>')
    // the input as given is still matched (legacy spellings)
    expect(objectStatement).toContain('<https://www.dw.com/english/?maca=en-rss&b=2>')
  })

  it('applies to subjects and exclusions too', () => {
    const r = builders.getStatements(
      { include: ['https://WWW.Example.com/a/'], exclude: [], mode: 'exact' },
      { include: [], exclude: ['https://www.x.test/p/?z=1'], mode: 'exact', type: 'notTerms' },
      { subtype: 'Cite', limitResults: '10', offsetResults: '0' },
      'links'
    )
    expect(r.subjectStatement).toContain('<https://example.com/a>')
    expect(r.objectStatement).toContain('<https://x.test/p?z=1>')
    expect(r.objectStatement).toMatch(/NOT IN \(/)
  })

  it('falls back to the raw value when canonical() cannot parse the input', () => {
    expect(() => stmts(['at://alice.example/app.bsky.feed.post/1'])).not.toThrow()
    const { objectStatement } = stmts(['at://alice.example/app.bsky.feed.post/1'])
    expect(objectStatement).toContain('<at://alice.example/app.bsky.feed.post/1>')
  })

  it('leaves term inputs untouched', () => {
    const { objectStatement } = stmts(['Some-Tag'], 'exact', 'termsOnly')
    expect(objectStatement).toContain(`<${instance}~/Some-Tag>`)
  })

  it('reaches buildSimpleQuery through buildMultiPass (the /get path)', () => {
    const mp = buildMultiPass('pages', 'linked', { o: 'https://www.dw.com/english/?maca=en-rss' }, instance)
    expect(builders.buildSimpleQuery(mp)).toContain('<https://dw.com/english?maca=en-rss>')
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

    // #270: the reifier of ?s -> ?o, typed with the FULL subtype IRI
    expect(result.subtypeFilter).toContain('FILTER EXISTS')
    expect(result.subtypeFilter).toContain('?_st rdf:reifies <<( ?s octo:octothorpes ?o )>>')
    expect(result.subtypeFilter).toContain('?_st rdf:type <https://vocab.octothorp.es#Bookmark>')
    // No blank-node / octo:url shape and no compact class form
    expect(result.subtypeFilter).not.toContain('octo:url')
    expect(result.subtypeFilter).not.toContain('isBlank')
    expect(result.subtypeFilter).not.toContain('<octo:Bookmark>')
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

    // #270: any reifier of a relationship FROM ?s (target unconstrained,
    // same semantics as the blank-node filter it replaces)
    expect(result.relationTermsFilter).toContain('?_rt rdf:reifies <<( ?s octo:octothorpes ?_rtO )>>')
    expect(result.relationTermsFilter).toContain('?_rt octo:octothorpes ?relationTerm')
    expect(result.relationTermsFilter).toContain(`${instance}~/gadgets>`)
    expect(result.relationTermsFilter).not.toContain('isBlank')
    // Not tied to the result row's ?o
    expect(result.relationTermsFilter).not.toContain('octothorpes ?o ')
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
    expect(result.subtypeFilter).toContain('rdf:type <https://vocab.octothorp.es#Bookmark>')
    expect(result.subtypeFilter).toContain('octo:octothorpes ?relationTerm')
    expect(result.subtypeFilter).toContain('~/gadgets>')
    // relationTermsFilter should be empty since it's merged into subtypeFilter
    expect(result.relationTermsFilter).toBe('')
  })

  it('should use the same reifier variable for both constraints', () => {
    const result = builders.getStatements(
      { include: ['https://example.com'], exclude: [], mode: 'exact' },
      { include: [], exclude: [], mode: 'exact', type: 'notTerms' },
      { subtype: 'Bookmark', relationTerms: ['gadgets'], limitResults: '100', offsetResults: '0' },
      'links'
    )

    // Both type and term constraints hang off the same reifier
    const filter = result.subtypeFilter
    expect(filter).toContain('?_st rdf:reifies')
    expect(filter).toContain('?_st rdf:type')
    expect(filter).toContain('?_st octo:octothorpes ?relationTerm')
    const subjects = filter.match(/\?_\w+(?= (rdf:|octo:))/g)
    expect([...new Set(subjects)]).toEqual(['?_st'])
  })

  it('should keep subtypeFilter alone when no relationTerms', () => {
    const result = builders.getStatements(
      { include: ['https://example.com'], exclude: [], mode: 'exact' },
      { include: [], exclude: [], mode: 'exact', type: 'notTerms' },
      { subtype: 'Bookmark', limitResults: '100', offsetResults: '0' },
      'links'
    )

    expect(result.subtypeFilter).toContain('rdf:type <https://vocab.octothorp.es#Bookmark>')
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

    expect(result.relationTermsFilter).toContain('?_rt rdf:reifies')
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
    expect(result.subtypeFilter).toContain('rdf:type <https://vocab.octothorp.es#Cite>')
  })
})

describe('getStatements guard - relaxed for rt and subtype', () => {
  const instance = 'http://localhost:5173/'
  const builders = createQueryBuilders(instance)

  it('should allow getStatements with only relationTerms (no s or o)', () => {
    expect(() => {
      builders.getStatements(
        { include: [], exclude: [], mode: 'exact' },
        { include: [], exclude: [], mode: 'exact', type: 'notTerms' },
        { subtype: '', relationTerms: ['gadgets'], limitResults: '100', offsetResults: '0' },
        'links'
      )
    }).not.toThrow()
  })

  // C9 (#236): a declared-subtype path (e.g. /get/items/posted) constrains the
  // result set by the relationship subtype alone. The subtype FILTER EXISTS is
  // a bounding constraint, so it is admitted like relationTerms.
  it('should allow getStatements with only a subtype (no s, o, or rt)', () => {
    expect(() => {
      builders.getStatements(
        { include: [], exclude: [], mode: 'exact' },
        { include: [], exclude: [], mode: 'exact', type: 'all' },
        { subtype: 'Item', limitResults: '100', offsetResults: '0' },
        'blobjects'
      )
    }).not.toThrow()
  })

  it('should still throw when no s, o, rt, or subtype', () => {
    expect(() => {
      builders.getStatements(
        { include: [], exclude: [], mode: 'exact' },
        { include: [], exclude: [], mode: 'exact', type: 'notTerms' },
        { subtype: '', limitResults: '100', offsetResults: '0' },
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

describe('exclusion params (not-s) — issue #211', () => {
  const instance = 'http://localhost:5173/'
  const builders = createQueryBuilders(instance)

  it('pages/thorped with not-s emits an exclusion FILTER on ?s', () => {
    const mp = buildMultiPass('pages', 'thorped', {
      o: 'cats',
      notS: 'demo.ideastore.dev,docs.octothorp.es'
    }, instance)
    // The exclusion must survive multipass into subjects.exclude
    expect(mp.subjects.exclude).toContain('demo.ideastore.dev')
    const query = builders.buildSimpleQuery(mp)
    expect(query).toContain('demo.ideastore.dev')
    expect(query).toMatch(/FILTER\s*\(\s*!CONTAINS|NOT IN/i)
  })

  it('pages/posted with only not-s does not throw and filters ?s', () => {
    const mp = buildMultiPass('pages', 'posted', {
      notS: 'demo.ideastore.dev'
    }, instance)
    expect(mp.subjects.exclude).toContain('demo.ideastore.dev')
    expect(() => builders.buildSimpleQuery(mp)).not.toThrow()
    const query = builders.buildSimpleQuery(mp)
    expect(query).toContain('demo.ideastore.dev')
  })
})

describe('match=origin anchors subjects on octo:hasPart (#202)', () => {
  const instance = 'http://localhost:5173/'
  const builders = createQueryBuilders(instance)

  it('buildMultiPass maps match=origin to byOrigin subject mode', () => {
    const mp = buildMultiPass('everything', 'posted', { s: 'https://example.com', match: 'origin' }, instance)
    expect(mp.subjects.mode).toBe('byOrigin')
    expect(mp.subjects.include).toEqual(['https://example.com'])
  })

  it('everything/posted phase-1 subject query requires <origin> octo:hasPart ?s, no substring match', async () => {
    // Ghost page: a link target on the domain gets `rdf:type octo:Page` +
    // `octo:created` but no hasPart edge. Phase 1 of buildEverythingQuery picks
    // subjects; it must only admit pages the origin owns.
    const seen = []
    const stub = async (q) => { seen.push(q); return { results: { bindings: [] } } }
    const b = createQueryBuilders(instance, stub)
    const mp = buildMultiPass('everything', 'posted', { s: 'https://example.com', match: 'origin' }, instance)
    await b.buildEverythingQuery(mp)
    const phase1 = seen[0]
    expect(phase1).toContain('?sorigin octo:hasPart ?s')
    expect(phase1).toContain('<https://example.com>')
    expect(phase1).toContain('<https://www.example.com/>')
    expect(phase1).not.toContain('CONTAINS(STR(?s)')
    expect(phase1).toContain('ORDER BY DESC(COALESCE(?postDate, ?date))')
    // An owned page first seen as a link target has no octo:created; under
    // byOrigin, created is optional so that page is still listed.
    expect(phase1).toContain('OPTIONAL { ?s octo:created ?date . }')
  })

  it('posted without origin match still gates on octo:created', () => {
    const mp = buildMultiPass('everything', 'posted', { s: 'example.com', match: 'fuzzy-s' }, instance)
    const q = builders.buildSimpleQuery(mp)
    expect(q).toContain('?s octo:created ?date .')
    expect(q).not.toContain('OPTIONAL { ?s octo:created')
  })

  it('thorpes/thorped is anchored the same way', () => {
    const mp = buildMultiPass('thorpes', 'thorped', { s: 'https://example.com', match: 'origin' }, instance)
    expect(builders.buildThorpeQuery(mp)).toContain('?sorigin octo:hasPart ?s')
  })

  it('notS excludes by origin ownership', () => {
    const r = builders.getStatements(
      { include: [], exclude: ['https://example.com'], mode: 'byOrigin' },
      { include: [], exclude: [], mode: 'exact', type: 'none' },
      { limitResults: '100', offsetResults: '0' },
      'blobjects'
    )
    expect(r.subjectStatement).toContain('FILTER NOT EXISTS')
    expect(r.subjectStatement).toContain('?unwantedOrigins octo:hasPart ?s')
  })
})

describe('buildEverythingQuery - relationship reifiers and date tie-break (#270)', () => {
  const instance = 'http://localhost:5173/'
  const queryArray = async () => ({ results: { bindings: [{ s: { type: 'uri', value: 'https://example.com/a' } }] } })
  const builders = createQueryBuilders(instance, queryArray)
  const mp = {
    meta: { resultMode: 'blobjects' },
    subjects: { mode: 'exact', include: ['https://example.com/a'], exclude: [] },
    objects: { type: 'notTerms', mode: 'exact', include: [], exclude: [] },
    filters: { subtype: 'Bookmark', limitResults: '100', offsetResults: '0' },
  }

  it('reads relationship metadata from the reifier of ?s -> ?o, not a blank node', async () => {
    const q = await builders.buildEverythingQuery(mp)
    expect(q).toContain('?reifier rdf:reifies <<( ?s octo:octothorpes ?o )>>')
    expect(q).toContain('VALUES ?reifierPred { rdf:type octo:octothorpes }')
    expect(q).toContain('?reifier ?reifierPred ?reifierObj')
    expect(q).not.toContain('isBlank')
    expect(q).not.toContain('octo:url')
  })

  it('binds ?date from the reifier octo:created (object-row dates, #268 constraint)', async () => {
    const q = await builders.buildEverythingQuery(mp)
    expect(q).toContain('?_dr octo:created ?date .')
    expect(q).not.toContain('?s ?o ?date .')
  })

  it('orders with a total tie-break after the COALESCE key', async () => {
    const q = await builders.buildEverythingQuery(mp)
    expect(q).toContain('ORDER BY DESC(COALESCE(?postDate, ?date)) DESC(?date) ?s')
  })
})
