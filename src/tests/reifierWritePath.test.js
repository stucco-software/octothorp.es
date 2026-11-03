import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createIndexer } from '../../packages/core/indexer.js'
import { canonical, mintReifierIri } from '../../packages/core/reifier.js'

// #270 write path: typed relationships are the base triple plus a named
// RDF 1.2 reifier (annotation form), keyed by mintReifierIri. Mocked SPARQL
// deps, mirroring src/tests/indexing.test.js. Spec:
// docs/plans/point7/2026-10-29-reifier-minting-spec.md

const instance = 'http://localhost:5173/'
const P = 'https://vocab.octothorp.es#octothorpes'
const OCTO = 'https://vocab.octothorp.es#'

const mockInsert = vi.fn()
const mockQuery = vi.fn()
const mockQueryBoolean = vi.fn()
const mockQueryArray = vi.fn()

const indexer = createIndexer({
  insert: mockInsert,
  query: mockQuery,
  queryBoolean: mockQueryBoolean,
  queryArray: mockQueryArray,
  instance,
})

const inserted = () => mockInsert.mock.calls.map((c) => c[0]).join('\n')
const updated = () => mockQuery.mock.calls.map((c) => c[0]).join('\n')
const mint = (s, o, subtype) => mintReifierIri({ subject: s, predicate: P, object: o, subtype: `${OCTO}${subtype}` })
const annotation = (s, o, r) => `<${s}> <${P}> <${o}> ~ <${r}> {|`

beforeEach(() => {
  vi.clearAllMocks()
  mockQueryBoolean.mockResolvedValue(false)
  mockQueryArray.mockResolvedValue({ results: { bindings: [] } })
  mockInsert.mockResolvedValue({})
  mockQuery.mockResolvedValue({})
})

describe('one spelling everywhere (#270 invariant)', () => {
  const messyS = 'https://WWW.Example.com/page/'
  const messyO = 'https://Other.com:443/a/../x/?b=2&a=1#'
  const s = 'https://example.com/page'
  const o = 'https://other.com/x?a=1&b=2'

  it('canonical() gives the expected spellings for the fixtures', () => {
    expect(canonical(messyS)).toBe(s)
    expect(canonical(messyO)).toBe(o)
  })

  it('base triple, triple term and minted IRI all use the canonical spelling', async () => {
    await indexer.handleMention(messyS, messyO, 'Bookmark')
    const r = await mint(s, o, 'Bookmark')
    const out = inserted()
    // Annotation form: base triple + named reifier in one statement. The
    // triple term rdf:reifies <<( s p o )>> is expanded from these same terms.
    expect(out).toContain(annotation(s, o, r))
    // The flat mention uses the same spelling.
    expect(out).toContain(`<${s}> octo:octothorpes <${o}>`)
    // The first-wins update targets the same reifier.
    expect(updated()).toContain(`<${r}> octo:created`)
    // No raw spelling leaks into any write.
    for (const raw of ['WWW.', 'Example.com', 'Other.com', ':443', '/../', 'b=2&a=1', 'page/>']) {
      expect(out).not.toContain(raw)
      expect(updated()).not.toContain(raw)
    }
  })

  it('reads (existence checks) use the canonical spelling too', async () => {
    await indexer.handleMention(messyS, messyO, 'Bookmark')
    const asks = mockQueryBoolean.mock.calls.map((c) => c[0]).join('\n')
    expect(asks).toContain(`<${o}> rdf:type`)
    expect(asks).toContain(`<${s}> octo:octothorpes <${o}>`)
    expect(asks).not.toContain('Other.com')
  })
})

describe('annotation form only (spec core test 10)', () => {
  const s = 'https://example.com/page'
  const o = 'https://other.com/page'

  it('never writes a << >>-subject statement and always asserts the base triple', async () => {
    await indexer.handleMention(s, o, 'Cite', ['gadgets'], { instance })
    const out = inserted()
    expect(out).not.toMatch(/<</)
    expect(updated()).not.toMatch(/<</)
    const r = await mint(s, o, 'Cite')
    // The annotation statement starts with the base triple itself.
    expect(out).toContain(annotation(s, o, r))
    expect(out).toContain(`rdf:type <${OCTO}Cite>`)
    expect(out).toContain(`octo:octothorpes <${instance}~/gadgets>`)
  })

  it('writes no blank-node reifier and no octo:url', async () => {
    await indexer.handleMention(s, o, 'Bookmark')
    const out = inserted()
    expect(out).not.toContain('_:')
    expect(out).not.toContain('octo:url')
    // Every annotation block names its reifier: an anonymous `{| |}` mints a
    // fresh blank node per insert and duplicates on re-index.
    expect(out).toContain('{|')
    expect(out).not.toMatch(/(?<!~ <[^>]+> )\{\|/)
  })

  it('no longer runs a relationship-existence ASK (extantBacklink is gone)', async () => {
    expect(indexer.extantBacklink).toBeUndefined()
    await indexer.handleMention(s, o, 'Bookmark')
    const asks = mockQueryBoolean.mock.calls.map((c) => c[0]).join('\n')
    expect(asks).not.toContain('_:backlink')
    // Webring check + mention check only.
    expect(mockQueryBoolean).toHaveBeenCalledTimes(2)
  })
})

describe('re-index creates no new reifiers (spec core test 7)', () => {
  const s = 'https://example.com/page'
  const o = 'https://other.com/page'

  it('relationship writes are identical across runs and carry no timestamp', async () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(2000)
    await indexer.handleMention(s, o, 'Bookmark', ['gadgets'], { instance })
    // Second run: mention and term now exist.
    mockQueryBoolean.mockImplementation(async (q) => !q.includes('Webring'))
    await indexer.handleMention(s, o, 'Bookmark', ['gadgets'], { instance })
    vi.restoreAllMocks()

    const r = await mint(s, o, 'Bookmark')
    const relLine = (payload) => payload.split('\n').find((l) => l.includes(`~ <${r}>`))
    const [first, second] = mockInsert.mock.calls.map((c) => c[0])
    // The annotation statement is byte-identical: re-inserting it is a
    // set-semantics no-op for both the base triple and the named reifier.
    expect(relLine(first)).toBeDefined()
    expect(relLine(first)).toBe(relLine(second))
    // Nothing time-varying is in the INSERT DATA relationship statement.
    expect(relLine(first)).not.toContain('octo:created')
    expect(relLine(first)).not.toContain('1000')
    // Second run's INSERT DATA has no timestamped triples at all.
    expect(second).not.toMatch(/\b(1000|2000)\b/)
  })

  it('octo:created and term usage are written first-wins, keyed on the reifier', async () => {
    await indexer.handleMention(s, o, 'Bookmark', ['gadgets'], { instance })
    const r = await mint(s, o, 'Bookmark')
    expect(mockQuery).toHaveBeenCalledTimes(1)
    const u = mockQuery.mock.calls[0][0]
    expect(u).toMatch(/INSERT\s*\{/)
    expect(u).not.toContain('INSERT DATA')
    expect(u).toContain(`<${r}> octo:created`)
    expect(u).toContain(`<${instance}~/gadgets> octo:used`)
    expect(u).toContain(`FILTER NOT EXISTS { <${r}> octo:created ?created }`)
    // usage is never written unconditionally any more
    expect(inserted()).not.toContain('octo:used')
  })
})

describe('subtype is in the key (#331)', () => {
  const s = 'https://example.com/page'
  const o = 'https://other.com/page'

  it('bookmark and cite on one pair yield two distinct reifiers', async () => {
    await indexer.handleMention(s, o, 'Bookmark')
    await indexer.handleMention(s, o, 'Cite')
    const rb = await mint(s, o, 'Bookmark')
    const rc = await mint(s, o, 'Cite')
    expect(rb).not.toBe(rc)
    const out = inserted()
    expect(out).toContain(`${annotation(s, o, rb)} rdf:type <${OCTO}Bookmark>`)
    expect(out).toContain(`${annotation(s, o, rc)} rdf:type <${OCTO}Cite>`)
  })
})

describe('#213 gating and promotion on the reifier model', () => {
  const s = 'https://example.com/page'
  const o = 'https://other.com/page'

  it('promoted cross-origin Link writes two correctly keyed reifiers', async () => {
    mockQueryBoolean
      .mockResolvedValueOnce(false) // extantPage (Webring check)
      .mockResolvedValueOnce(false) // extantMention
      .mockResolvedValueOnce(false) // extantTerm 'gadgets'
      .mockResolvedValueOnce(false) // originEndorsesOrigin
      .mockResolvedValueOnce(true)  // checkReciprocalMention
    await indexer.handleMention(s, o, 'Link', ['gadgets'], { instance })
    const rl = await mint(s, o, 'Link')
    const rb = await mint(s, o, 'Backlink')
    expect(rl).not.toBe(rb)
    expect(mockInsert).toHaveBeenCalledTimes(1)
    const out = inserted()
    expect(out).toContain(`${annotation(s, o, rl)} rdf:type <${OCTO}Link>`)
    expect(out).toContain(`${annotation(s, o, rb)} rdf:type <${OCTO}Backlink>`)
    // Terms ride on both, as they did on both blank nodes.
    expect(out.match(new RegExp(`octo:octothorpes <${instance}~/gadgets>`, 'g'))).toHaveLength(2)
    // One first-wins operation per reifier, in a single update request;
    // usage is recorded once (on the Link), not per reifier.
    expect(mockQuery).toHaveBeenCalledTimes(1)
    const u = mockQuery.mock.calls[0][0]
    expect(u).toContain(`FILTER NOT EXISTS { <${rl}> octo:created ?created }`)
    expect(u).toContain(`FILTER NOT EXISTS { <${rb}> octo:created ?created }`)
    expect(u.match(/octo:used/g)).toHaveLength(1)
  })

  it('withheld Backlink writes no reifier and no first-wins update; mention still written', async () => {
    await indexer.handleMention(s, o) // Backlink, gate reads all false
    expect(inserted()).toContain(`<${s}> octo:octothorpes <${o}>`)
    expect(inserted()).not.toContain(' ~ <')
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('same-origin Backlink is minted without gate reads', async () => {
    await indexer.handleMention(s, 'https://example.com/other')
    expect(mockQueryBoolean).toHaveBeenCalledTimes(2)
    const r = await mint(s, 'https://example.com/other', 'Backlink')
    expect(inserted()).toContain(annotation(s, 'https://example.com/other', r))
  })
})

describe('unusable link targets', () => {
  it('drops a statement whose object cannot be canonicalized, writing nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await indexer.handleMention('https://example.com/page', 'not a url', 'Bookmark')
    expect(mockInsert).not.toHaveBeenCalled()
    expect(mockQuery).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('createBacklink (standalone)', () => {
  it('writes the annotation form and a first-wins created update', async () => {
    await indexer.createBacklink('https://source.com/page/', 'https://target.com/page', 'Bookmark')
    const r = await mint('https://source.com/page', 'https://target.com/page', 'Bookmark')
    expect(inserted()).toContain(annotation('https://source.com/page', 'https://target.com/page', r))
    expect(updated()).toContain(`FILTER NOT EXISTS { <${r}> octo:created ?created }`)
  })
})
