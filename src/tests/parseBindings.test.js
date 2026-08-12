import { describe, it, expect } from 'vitest'
import { parseBindings } from 'octothorpes'

// Minimal SPARQL binding shape: every value is { value: "..." }.
const v = (s) => ({ value: String(s) })
const binding = (o) => Object.fromEntries(Object.entries(o).map(([k, val]) => [k, v(val)]))

const A = 'https://demo.example/a'
const B = 'https://demo.example/b'
const X = 'https://demo.example/x'

describe('parseBindings pages mode — dual-role URIs (#260)', () => {
  // X is both a linker and a link target. A shared seenUris set emitted it once,
  // with whichever role it happened to be seen in first.
  const bindings = [
    binding({ s: A, o: X, title: 'A', ot: 'X as object' }),
    binding({ s: X, o: B, title: 'X as subject' }),
  ]

  it('emits a dual-role URI in both roles', () => {
    const out = parseBindings(bindings)
    const roles = out.filter((r) => r.uri === X).map((r) => r.role).sort()
    expect(roles).toEqual(['object', 'subject'])
  })

  it('gives each role its own enrichment', () => {
    const out = parseBindings(bindings)
    expect(out.find((r) => r.uri === X && r.role === 'object').title).toBe('X as object')
    expect(out.find((r) => r.uri === X && r.role === 'subject').title).toBe('X as subject')
  })

  it('is order-independent', () => {
    const forward = parseBindings(bindings)
    const reversed = parseBindings([...bindings].reverse())
    const key = (r) => `${r.role} ${r.uri} ${r.title}`
    expect(forward.map(key).sort()).toEqual(reversed.map(key).sort())
  })

  it('still dedupes within a role', () => {
    const out = parseBindings([
      binding({ s: A, o: X }),
      binding({ s: A, o: X }),
    ])
    expect(out.filter((r) => r.uri === A && r.role === 'subject')).toHaveLength(1)
    expect(out.filter((r) => r.uri === X && r.role === 'object')).toHaveLength(1)
  })
})

describe('parseBindings pages mode — object image (#259)', () => {
  it('reads the ?oimg binding that queryBuilders actually binds', () => {
    const out = parseBindings([binding({ s: A, o: X, oimg: 'https://demo.example/x.png' })])
    expect(out.find((r) => r.role === 'object').image).toBe('https://demo.example/x.png')
  })

  it('is null when the object has no image', () => {
    const out = parseBindings([binding({ s: A, o: X })])
    expect(out.find((r) => r.role === 'object').image).toBeNull()
  })

  it('leaves subject images on the ?image binding', () => {
    const out = parseBindings([binding({ s: A, o: X, image: 'https://demo.example/a.png' })])
    expect(out.find((r) => r.role === 'subject').image).toBe('https://demo.example/a.png')
  })
})

describe('parseBindings pages mode — object dates', () => {
  // Link targets are written by the indexer's mentionTriples, which emits
  // `<s> <o> now` but no octo:created — so a target that was never crawled in
  // its own right has no date of its own. The ?date binding on the row IS the
  // s->o assertion timestamp, i.e. when this link was first indexed. Dropping
  // it left every object row dateless, and the RSS publisher's `required`
  // pubDate then discarded the whole item, emptying link feeds.
  it('carries the assertion date of its relationship to the subject', () => {
    const out = parseBindings([binding({ s: A, o: X, date: 1700000000000 })])
    expect(out.find((r) => r.role === 'object').date).toBe(1700000000000)
  })

  it('is scoped to the querying subject, not the target globally', () => {
    // A and B both link X at different times. In a feed of links from B, X
    // carries B's assertion date.
    const fromB = parseBindings([binding({ s: B, o: X, date: 200 })])
    expect(fromB.find((r) => r.role === 'object').date).toBe(200)
    const fromA = parseBindings([binding({ s: A, o: X, date: 100 })])
    expect(fromA.find((r) => r.role === 'object').date).toBe(100)
  })

  it('is null, never NaN, when the row has no date', () => {
    const out = parseBindings([binding({ s: A, o: X })])
    expect(out.find((r) => r.role === 'object').date).toBeNull()
  })

  it('leaves the subject row reading its own ?date', () => {
    const out = parseBindings([binding({ s: A, o: X, date: 42 })])
    expect(out.find((r) => r.role === 'subject').date).toBe(42)
  })
})

describe('parseBindings terms mode — dedupe (#256)', () => {
  const term = (name, date) => binding({ o: `https://octothorp.es/~/${name}`, date })

  it('collapses a term thorped by many pages to one row', () => {
    const out = parseBindings([term('demo', 3), term('demo', 2), term('demo', 1)], 'terms')
    expect(out).toEqual([{ term: 'demo', date: 3 }])
  })

  it('keeps the most recent date (bindings arrive ordered by descending date)', () => {
    const out = parseBindings([term('demo', 300), term('demo', 100)], 'terms')
    expect(out[0].date).toBe(300)
  })

  it('preserves distinct terms and their order', () => {
    const out = parseBindings([term('demo', 3), term('rss', 2), term('demo', 1)], 'terms')
    expect(out.map((r) => r.term)).toEqual(['demo', 'rss'])
  })

  it('behaves identically under the thorpes alias', () => {
    const rows = [term('demo', 2), term('demo', 1)]
    expect(parseBindings(rows, 'thorpes')).toEqual(parseBindings(rows, 'terms'))
  })
})
