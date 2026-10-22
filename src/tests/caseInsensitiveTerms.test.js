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
      // #306: substrings are compared against the stored IRI, which never
      // contains a raw space — variants carry termIri's percent-encoding.
      expect(q).toContain('"my%20tag"')
      expect(q).not.toContain('"My Tag"')
      expect(q).not.toContain('"my tag"')
    })

    it('folds the exclude side too', async () => {
      const q = await builders.buildSimpleQuery(
        mp({ type: 'termsOnly', mode: 'very-fuzzy', include: [], exclude: ['MyTag'] })
      )
      expect(q).toContain('CONTAINS(LCASE(STR(?o))')
    })
  })

  // #306: very-fuzzy ran CONTAINS against the raw stored IRI, so a spaced
  // query ("site changes") could never match the stored `~/site%20changes`.
  // Search strings are now encoded with the same rules as termIri.
  describe('#306 percent-encoded terms', () => {
    it('very-fuzzy include encodes spaces like termIri', async () => {
      const q = await builders.buildSimpleQuery(
        mp({ type: 'termsOnly', mode: 'very-fuzzy', include: ['site changes'], exclude: [] })
      )
      expect(q).toContain('"site%20changes"')
      expect(q).not.toContain('"site changes"')
      // separator variants still present (encoded forms are unchanged)
      expect(q).toContain('"site-changes"')
      expect(q).toContain('"sitechanges"')
    })

    it('very-fuzzy exclude encodes spaces too', async () => {
      const q = await builders.buildSimpleQuery(
        mp({ type: 'termsOnly', mode: 'very-fuzzy', include: [], exclude: ['site changes'] })
      )
      expect(q).toContain('"site%20changes"')
      expect(q).not.toContain('"site changes"')
    })

    it('very-fuzzy non-ASCII matches only the canonical raw spelling (#328)', async () => {
      const q = await builders.buildSimpleQuery(
        mp({ type: 'termsOnly', mode: 'very-fuzzy', include: ['café'], exclude: [] })
      )
      // termIri keeps non-ASCII raw; the legacy new URL() %-encoded spelling
      // is no longer bridged — stragglers normalize on re-index.
      expect(q).toContain('"café"')
      expect(q).not.toContain('"caf%c3%a9"')
    })

    it('fuzzy non-ASCII matches only the canonical raw IRI (#328)', async () => {
      const q = await builders.buildSimpleQuery(
        mp({ type: 'termsOnly', mode: 'fuzzy', include: ['café'], exclude: [] })
      )
      expect(q).toContain(`"${INSTANCE}~/café"`)
      expect(q).not.toContain(`"${INSTANCE}~/caf%c3%a9"`)
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
