import { describe, it, expect } from 'vitest'
import { createQueryBuilders } from 'octothorpes'

// #282: a *required* triple pattern emitted after an OPTIONAL block in the same
// group is a planner landmine. Oxigraph 0.4+ will not hoist it above the
// LeftJoin, so it left-joins the whole OPTIONAL stack against an unconstrained
// intermediate — 11s vs 23ms on a 68k-triple store, growing as store size ×
// result rows. Oxigraph 0.3 reordered loosely enough to avoid it, which is why
// this only reproduces on newer engines.
//
// The rule is a query *shape* invariant, so it is asserted structurally rather
// than by timing: no populated store, no clock, safe in CI.

const INSTANCE = 'http://localhost:5173/'

const KEYWORDS = /^(FILTER|BIND|VALUES|OPTIONAL|UNION|MINUS|SELECT|GRAPH|SERVICE)\b/i

/**
 * Walk a SPARQL query and collect required triple patterns that appear after an
 * OPTIONAL within the same group. Skips IRIs and quoted strings so that dots
 * inside them are not mistaken for statement terminators.
 *
 * @param {string} query
 * @returns {string[]} offending patterns, in source order
 */
export function requiredPatternsAfterOptional(query) {
  const offenders = []
  const stack = [{ seenOptional: false }]
  let buf = ''

  const flush = () => {
    const stmt = buf.trim().replace(/\s+/g, ' ')
    buf = ''
    if (!stmt || KEYWORDS.test(stmt)) return
    // a required triple pattern starts with a term: ?var, <iri>, or prefix:name
    if (!/^(\?|<|\w+:)/.test(stmt)) return
    if (stack[stack.length - 1].seenOptional) offenders.push(stmt)
  }

  for (let i = 0; i < query.length; i++) {
    const c = query[i]

    if (c === '<') {
      const end = query.indexOf('>', i)
      if (end !== -1) { buf += query.slice(i, end + 1); i = end; continue }
    }
    if (c === '"' || c === "'") {
      const end = query.indexOf(c, i + 1)
      if (end !== -1) { buf += query.slice(i, end + 1); i = end; continue }
    }

    if (c === '{') {
      // the keyword immediately preceding the brace tells us what this group is
      if (/OPTIONAL\s*$/i.test(buf)) stack[stack.length - 1].seenOptional = true
      buf = ''
      stack.push({ seenOptional: false })
      continue
    }
    if (c === '}') {
      flush()
      if (stack.length > 1) stack.pop()
      continue
    }
    if (c === '.') { flush(); continue }

    buf += c
  }

  return offenders
}

const multiPass = (over = {}) => ({
  meta: { resultMode: 'pages' },
  subjects: { mode: 'exact', include: [], exclude: [] },
  objects: { type: 'termsOnly', mode: 'exact', include: ['demo'], exclude: [] },
  filters: {
    subtype: '',
    limitResults: 'no-limit',
    offsetResults: '0',
    dateRange: {},
    createdRange: null,
    indexedRange: null,
  },
  ...over,
})

// prepEverything resolves subjects with a real query; stub it so
// buildEverythingQuery reaches its main template.
const stubQueryArray = async () => ({
  results: { bindings: [{ s: { type: 'uri', value: 'https://example.com/a' } }] },
})

const builders = createQueryBuilders(INSTANCE, stubQueryArray)

describe('#282 required triple patterns must precede OPTIONAL blocks', () => {
  const cases = [
    ['buildSimpleQuery, termsOnly objects', () => builders.buildSimpleQuery(multiPass())],
    ['buildSimpleQuery, pagesOnly objects', () =>
      builders.buildSimpleQuery(multiPass({
        objects: { type: 'pagesOnly', mode: 'exact', include: ['https://example.com/x'], exclude: [] },
      }))],
    ['buildSimpleQuery, no objects', () =>
      builders.buildSimpleQuery(multiPass({
        objects: { type: 'none', mode: 'exact', include: [], exclude: [] },
        subjects: { mode: 'exact', include: ['https://example.com/a'], exclude: [] },
      }))],
    ['buildSimpleQuery, dateRange filter', () =>
      builders.buildSimpleQuery(multiPass({
        filters: { ...multiPass().filters, dateRange: { start: '2024-01-01', end: '2026-01-01' } },
      }))],
    ['buildSimpleQuery, createdRange filter', () =>
      builders.buildSimpleQuery(multiPass({
        filters: { ...multiPass().filters, createdRange: { start: '2024-01-01', end: '2026-01-01' } },
      }))],
    ['buildSimpleQuery, very-fuzzy objects', () =>
      builders.buildSimpleQuery(multiPass({
        objects: { type: 'termsOnly', mode: 'very-fuzzy', include: ['demo'], exclude: [] },
      }))],
    ['buildThorpeQuery', () => builders.buildThorpeQuery(multiPass())],
    ['buildEverythingQuery', () =>
      builders.buildEverythingQuery({ ...multiPass(), meta: { resultMode: 'blobjects' } })],
  ]

  for (const [label, build] of cases) {
    it(`${label} emits no required pattern after an OPTIONAL`, async () => {
      const query = await build()
      expect(requiredPatternsAfterOptional(query)).toEqual([])
    })
  }
})

describe('the ordering scanner itself', () => {
  it('flags a required pattern stranded below an OPTIONAL', () => {
    const bad = `SELECT * WHERE { ?s a ?t . OPTIONAL { ?s :p ?v . } ?s :q ?w . }`
    expect(requiredPatternsAfterOptional(bad)).toEqual(['?s :q ?w'])
  })

  it('accepts the same patterns ordered correctly', () => {
    const good = `SELECT * WHERE { ?s a ?t . ?s :q ?w . OPTIONAL { ?s :p ?v . } }`
    expect(requiredPatternsAfterOptional(good)).toEqual([])
  })

  it('does not mistake dots inside IRIs or literals for terminators', () => {
    const q = `SELECT * WHERE { ?s <https://vocab.octothorp.es#title> "a.b.c" . OPTIONAL { ?s :p ?v . } }`
    expect(requiredPatternsAfterOptional(q)).toEqual([])
  })

  it('scopes the rule per group, not across nested groups', () => {
    const q = `SELECT * WHERE { OPTIONAL { ?s :p ?v . ?s :r ?u . } }`
    expect(requiredPatternsAfterOptional(q)).toEqual([])
  })
})
