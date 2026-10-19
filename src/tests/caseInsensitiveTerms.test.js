import { describe, it, expect } from 'vitest'
import { createQueryBuilders, caseInsensitiveTermClause } from 'octothorpes'

// #253: search/fuzzy term matching is case-insensitive on READ. Storage keeps
// the author's casing; only the comparison folds case (LCASE on both sides).
// Exact mode stays case-sensitive — pinned below so #306 work doesn't drift it.

const INSTANCE = 'https://example.com/'
const builders = createQueryBuilders(INSTANCE)

const mp = (objects) => ({
  meta: { resultMode: 'pages' },
  subjects: { mode: 'exact', include: [], exclude: [] },
  objects,
  filters: {
    subtype: '',
    limitResults: 'no-limit',
    offsetResults: '0',
    dateRange: {},
    createdRange: null,
    indexedRange: null,
  },
})

describe('#253 case-insensitive term matching', () => {
  describe('caseInsensitiveTermClause', () => {
    it('compares LCASE of the bound term against the lowercased IRI', () => {
      const clause = caseInsensitiveTermClause(INSTANCE, 'MyTag')
      expect(clause).toContain('LCASE(STR(?term))')
      expect(clause).toContain(`"${INSTANCE}~/mytag"`)
      expect(clause).not.toContain('MyTag')
    })

    it('keeps percent-encoded names intact (hex lowered with the rest)', () => {
      const clause = caseInsensitiveTermClause(INSTANCE, 'site changes')
      expect(clause).toContain(`"${INSTANCE}~/site%20changes"`)
    })

    it('lets callers pick the subject and object variables', () => {
      const clause = caseInsensitiveTermClause(INSTANCE, 'demo', {
        subjectVar: '?page',
        objectVar: '?o',
      })
      expect(clause).toContain('?page octo:octothorpes ?o')
      expect(clause).toContain('LCASE(STR(?o))')
    })
  })

  describe('fuzzy termsOnly include', () => {
    it('matches via LCASE(STR(?o)) IN a lowercased term-IRI list', async () => {
      const q = await builders.buildSimpleQuery(
        mp({ type: 'termsOnly', mode: 'fuzzy', include: ['MyTag'], exclude: [] })
      )
      expect(q).toContain('LCASE(STR(?o)) IN')
      expect(q).toContain(`"${INSTANCE}~/mytag"`)
      // no mixed-case IRIs survive into the comparison list
      expect(q).not.toMatch(/IN\s*\([^)]*MyTag/)
    })
  })

  describe('fuzzy termsOnly exclude', () => {
    it('excludes via LCASE(STR(?o)) NOT IN', async () => {
      const q = await builders.buildSimpleQuery(
        mp({ type: 'termsOnly', mode: 'fuzzy', include: [], exclude: ['MyTag'] })
      )
      expect(q).toContain('LCASE(STR(?o)) NOT IN')
      expect(q).toContain(`"${INSTANCE}~/mytag"`)
    })
  })

  describe('very-fuzzy', () => {
    it('folds both sides of the CONTAINS comparison', async () => {
      const q = await builders.buildSimpleQuery(
        mp({ type: 'termsOnly', mode: 'very-fuzzy', include: ['MyTag'], exclude: [] })
      )
      expect(q).toContain('CONTAINS(LCASE(STR(?o))')
      expect(q).toContain('"my tag"')
      expect(q).not.toContain('"My Tag"')
    })

    it('folds the exclude side too', async () => {
      const q = await builders.buildSimpleQuery(
        mp({ type: 'termsOnly', mode: 'very-fuzzy', include: [], exclude: ['MyTag'] })
      )
      expect(q).toContain('CONTAINS(LCASE(STR(?o))')
    })
  })

  describe('exact mode stays case-sensitive (unchanged semantics)', () => {
    it('emits the term IRI with the caller casing and no LCASE', async () => {
      const q = await builders.buildSimpleQuery(
        mp({ type: 'termsOnly', mode: 'exact', include: ['MyTag'], exclude: [] })
      )
      expect(q).toContain(`<${INSTANCE}~/MyTag>`)
      expect(q).not.toContain('LCASE')
    })
  })
})
