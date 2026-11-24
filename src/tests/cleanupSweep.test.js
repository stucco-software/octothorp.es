// #364: rulesets for scripts/cleanup-sweep.js. Pure builders and matchers, plus
// the runners against a stub sparql client. The SPARQL REGEX side was checked
// against Oxigraph 0.5.13 (WASM) while building: same verdicts as the JS side
// for every case below.
import { describe, it, expect } from 'vitest'
import { freshPageState, IRI_ILLEGAL, canonical } from 'octothorpes'
import {
  URL_TERM, MALFORMED_IRI, FLYDEV_IRI, RULESETS,
  toSparqlRegexSource, iriMatchExpr, nodesQuery, tripleCountQuery, reifierCountQuery, retractUpdates,
  selectRulesets, parseCutoff, staleCandidatesQuery, classifyHarvest, diffSize, runPatternRuleset,
} from '../../scripts/cleanup-sweep/rulesets.js'
import { repairDoubledScheme, originTarget, planCanonicalizeOrigins } from '../../scripts/canonicalize-origins.js'

const I = 'http://localhost:5173/'

describe('URL_TERM (#361)', () => {
  it.each([
    [`${I}~/https://nimdaghlian.github.io/devdemo/demo`, true],
    [`${I}~/http://nimdaghlian.github.io/demo`, true],
    ['https://octothorp.es/~/HTTP%3A%2F%2Fexample.com', true],
    [`${I}~/demo`, false],
    [`${I}~/site%20changes`, false],
    [`${I}~/mailto:someone`, false],
    ['https://example.com/https://other.example', false],
  ])('%s -> %s', (iri, expected) => {
    expect(URL_TERM.test(iri)).toBe(expected)
  })
})

describe('MALFORMED_IRI (#358)', () => {
  it('is the same character set canonical() refuses', () => {
    expect(MALFORMED_IRI.source).toBe(IRI_ILLEGAL.source)
  })
  it.each(['web+x:a b', 'web+x:a<b', 'web+x:a>b', 'web+x:a"b', 'web+x:a{b', 'web+x:a|b', 'web+x:a\\b', 'web+x:a^b', 'web+x:a`b', 'web+x:a\u007Fb', 'web+x:a\tb'])(
    'matches %j, which canonical() rejects', (iri) => {
      expect(MALFORMED_IRI.test(iri)).toBe(true)
      expect(() => canonical(iri)).toThrow(/Invalid IRI/)
    })
  it.each(['https://example.com/a%20b', 'web+x:ok/path', 'at://did:plc:abc/x'])('passes %s', (iri) => {
    expect(MALFORMED_IRI.test(iri)).toBe(false)
  })
})

describe('FLYDEV_IRI (#356)', () => {
  it.each([
    ['http://octothorpes.fly.dev/tags/IndieWeb.html', true],
    ['http://octothorpes.fly.dev/update', true],
    ['https://octothorpes.fly.dev/undefined', true],
    ['http://octothorpes.fly.dev', true],
    ['https://octothorpes-next.fly.dev/x', false],
    ['http://octothorpes.fly.dev.evil.example/x', false],
    ['https://example.com/?u=http://octothorpes.fly.dev/x', false],
  ])('%s -> %s', (iri, expected) => {
    expect(FLYDEV_IRI.test(iri)).toBe(expected)
  })
})

describe('toSparqlRegexSource', () => {
  it('rewrites \\u escapes and unescapes slashes, leaving other escapes', () => {
    expect(toSparqlRegexSource(URL_TERM.source)).toBe('/~/https?(:|%3a)(/|%2f){2}')
    expect(toSparqlRegexSource(MALFORMED_IRI.source)).toBe('[\\x{0000}- <>"{}|\\\\^`\\x{007F}]')
    expect(toSparqlRegexSource(FLYDEV_IRI.source)).toBe('^https?://octothorpes\\.fly\\.dev(:[0-9]+)?(/|$)')
  })
  it('does not split an escaped backslash', () => {
    expect(toSparqlRegexSource('a\\\\/b')).toBe('a\\\\/b')
  })
})

describe('query builders', () => {
  it('guards every match with isIRI and escapes the pattern as a SPARQL literal', () => {
    expect(iriMatchExpr(MALFORMED_IRI, '?n')).toBe('(isIRI(?n) && REGEX(STR(?n), "[\\\\x{0000}- <>\\"{}|\\\\\\\\^`\\\\x{007F}]"))')
    expect(iriMatchExpr(URL_TERM, '?x')).toContain(', "i"))')
  })
  it('nodesQuery covers subject, predicate, object and reified-triple positions', () => {
    const q = nodesQuery(FLYDEV_IRI)
    expect(q).toContain('{ ?n ?p ?o } UNION { ?s ?n ?o } UNION { ?s ?p ?n }')
    expect(q).toContain('<<( ?n ?p ?o )>>')
    expect(q).toContain('<<( ?s ?p ?n )>>')
  })
  it('count queries and retraction updates share one WHERE pattern', () => {
    const [reifiers, triples] = retractUpdates(URL_TERM)
    const where = (s) => s.slice(s.indexOf('WHERE'))
    expect(reifiers).toMatch(/^DELETE \{ \?r \?rp \?ro \}/)
    expect(where(reifiers)).toContain(where(reifierCountQuery(URL_TERM)).replace(/\n}$/, ''))
    expect(triples).toMatch(/^DELETE \{ \?s \?p \?o \}/)
    expect(where(triples)).toBe(where(tripleCountQuery(URL_TERM)))
  })
  it('never spells a matched IRI inside <...>', () => {
    // Outside string literals, the only IRI ever written is rdf:reifies.
    for (const u of retractUpdates(MALFORMED_IRI)) {
      const bare = u.replace(/"(?:[^"\\]|\\.)*"/g, '""')
      const iris = [...bare.matchAll(/<([^<>()]+)>/g)].map((m) => m[1])
      for (const iri of iris) expect(iri).toBe('http://www.w3.org/1999/02/22-rdf-syntax-ns#reifies')
    }
  })
})

describe('selectRulesets', () => {
  it('defaults to every store-only class (stale-thorpes must be named)', () => {
    expect(selectRulesets(undefined).map((r) => r.id)).toEqual(['url-terms', 'malformed-iris', 'flydev-iris', 'origins'])
  })
  it('all includes stale-thorpes', () => {
    expect(selectRulesets('all')).toEqual(RULESETS)
  })
  it('selects by id in table order', () => {
    expect(selectRulesets('flydev-iris, url-terms').map((r) => r.id)).toEqual(['url-terms', 'flydev-iris'])
  })
  it('throws on an unknown id', () => {
    expect(() => selectRulesets('url-terms,nope')).toThrow(/Unknown class: nope/)
  })
})

describe('stale-thorpes helpers (#322)', () => {
  it('parseCutoff takes an ISO date or a ms epoch', () => {
    expect(parseCutoff('2026-11-04')).toBe(Date.parse('2026-11-04'))
    expect(parseCutoff('1792196560561')).toBe(1792196560561)
    expect(parseCutoff(undefined)).toBeNull()
    expect(() => parseCutoff('soon')).toThrow()
  })
  it('candidate query skips soft-deleted pages and applies the cutoff and limit', () => {
    expect(staleCandidatesQuery()).not.toContain('HAVING')
    const q = staleCandidatesQuery({ cutoff: 1792196560561, limit: 50 })
    expect(q).toContain('FILTER NOT EXISTS { ?s octo:unavailable ?u }')
    expect(q).toContain('HAVING (MAX(?t) < 1792196560561)')
    expect(q).toContain('LIMIT 50')
  })

  const empty = { terms: new Set(), mentions: new Map() }
  const stored = { terms: new Set(['old']), mentions: new Map() }
  const noDiff = { thorpes: [], mentions: [], subtypes: [], relTerms: [], aliases: [], aliasClaims: [] }
  it.each([
    [{ status: 404 }, 'gone'],
    [{ status: 410 }, 'gone'],
    [{ status: 503 }, 'unreachable'],
    [{ error: new Error('timeout') }, 'unreachable'],
    [{ status: 200, fresh: empty, stored, diff: { ...noDiff, thorpes: ['old'] } }, 'suspect'],
    [{ status: 200, fresh: { terms: new Set(['new']), mentions: new Map() }, stored, diff: { ...noDiff, thorpes: ['old'] } }, 'stale'],
    [{ status: 200, fresh: { terms: new Set(['old']), mentions: new Map() }, stored, diff: noDiff }, 'clean'],
    [{ status: 200, fresh: empty, stored: empty, diff: noDiff }, 'clean'],
  ])('classifyHarvest(%o) -> %s', (input, expected) => {
    expect(classifyHarvest(input)).toBe(expected)
  })
  it('diffSize sums every retraction kind', () => {
    expect(diffSize({ thorpes: ['a'], mentions: ['b', 'c'], subtypes: [['b', 'Link']], relTerms: [], aliases: [], aliasClaims: ['d'] })).toBe(5)
  })
  it('freshPageState is exported from core and builds the reconcile dialect', () => {
    const f = freshPageState(['demo', { type: 'hashtag', uri: 'other' }, { type: 'link', uri: 'https://www.b.example/p/', terms: ['t'] }, { type: 'endorse', uri: 'https://c.example' }])
    expect([...f.terms]).toEqual(['demo', 'other'])
    const m = f.mentions.get(canonical('https://www.b.example/p/'))
    expect([...m.subtypes]).toEqual(['Link', 'Backlink'])
    expect([...m.terms]).toEqual(['t'])
    expect(f.mentions.size).toBe(1)
  })
})

describe('runPatternRuleset', () => {
  const stub = (nodes, counts = { triples: 3, reifiers: 1 }) => {
    const updates = []
    return {
      updates,
      queryArray: async (q) => q.startsWith('SELECT DISTINCT ?n')
        ? { results: { bindings: nodes.map((n) => ({ n: { value: n } })) } }
        : { results: { bindings: [{ count: { value: String(q.includes('COUNT(DISTINCT ?r)') ? counts.reifiers : counts.triples) } }] } },
      query: async (u) => { updates.push(u) },
    }
  }
  const rs = RULESETS.find((r) => r.id === 'url-terms')
  const quiet = () => {}

  it('dry run counts but never writes', async () => {
    const sparql = stub([`${I}~/https://x.example/demo`])
    const r = await runPatternRuleset(rs, { sparql, write: false, log: quiet })
    expect(r).toMatchObject({ before: 4, after: null })
    expect(sparql.updates).toHaveLength(0)
  })
  it('refuses to write when SPARQL returns a node the JS pattern rejects', async () => {
    const sparql = stub([`${I}~/demo`])
    const r = await runPatternRuleset(rs, { sparql, write: true, log: quiet })
    expect(r.details.disagree).toBe(1)
    expect(sparql.updates).toHaveLength(0)
  })
  it('write runs both retraction updates, then re-counts', async () => {
    const sparql = stub([`${I}~/https://x.example/demo`])
    const r = await runPatternRuleset(rs, { sparql, write: true, log: quiet })
    expect(sparql.updates).toEqual(retractUpdates(URL_TERM))
    expect(r.before).toBe(4)
    expect(r.after).toBe(4) // the stub never changes; a real store re-counts to 0
  })
  it('nothing matched issues no update', async () => {
    const sparql = stub([], { triples: 0, reifiers: 0 })
    const r = await runPatternRuleset(rs, { sparql, write: true, log: quiet })
    expect(r).toMatchObject({ before: 0, after: null })
    expect(sparql.updates).toHaveLength(0)
  })
})

describe('origins: doubled-scheme repair (#364 ruling)', () => {
  it.each([
    ['https://https://wwo25.fauxtrots.com', 'https://wwo25.fauxtrots.com'],
    ['https://https://256rem.xyz', 'https://256rem.xyz'],
    ['https://http://host.example', 'http://host.example'],
    ['http://https://host.example/', 'https://host.example/'],
    ['HTTPS://https://https://host.example', 'https://host.example'],
    ['https://host.example', 'https://host.example'],
    ['https://host.example/https://x', 'https://host.example/https://x'],
  ])('repairDoubledScheme(%s) -> %s', (uri, expected) => {
    expect(repairDoubledScheme(uri)).toBe(expected)
  })
  it.each([
    ['https://https://wwo25.fauxtrots.com', 'https://wwo25.fauxtrots.com'],
    ['https://https://256rem.xyz', 'https://256rem.xyz'],
    ['https://https://www.host.example/', 'https://host.example'],
    ['https://http://host.example', 'http://host.example'],
  ])('originTarget(%s) -> %s', (uri, expected) => {
    expect(originTarget(uri)).toBe(expected)
  })
  it('never returns a scheme-name host', () => {
    expect(() => originTarget('https://https')).toThrow(/scheme-name host/)
    expect(() => originTarget('https://https://')).toThrow()
  })
  it('plans doubled-scheme origins onto their real hosts, merging when the host exists', async () => {
    const origins = ['https://https://wwo25.fauxtrots.com', 'https://https://256rem.xyz', 'https://256rem.xyz', 'https://ok.example']
    const sparql = {
      queryArray: async (q) => q.includes('octo:Origin')
        ? { results: { bindings: origins.map((d) => ({ d: { value: d } })) } }
        : { results: { bindings: [{ n: { value: '1' } }] } },
    }
    const { nonCanonical } = await planCanonicalizeOrigins(sparql, { log: () => {} })
    expect(nonCanonical.map(({ uri, canonical, collides }) => ({ uri, canonical, collides }))).toEqual([
      { uri: 'https://https://wwo25.fauxtrots.com', canonical: 'https://wwo25.fauxtrots.com', collides: false },
      { uri: 'https://https://256rem.xyz', canonical: 'https://256rem.xyz', collides: true },
    ])
    for (const e of nonCanonical) expect(e.canonical).not.toMatch(/^https?:\/\/https?\/?$/)
  })
})
