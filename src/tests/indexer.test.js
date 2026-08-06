import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createIndexer } from '../../packages/core/indexer.js'

const mockInsert = vi.fn()
const mockQuery = vi.fn()
const mockQueryBoolean = vi.fn()
const mockQueryArray = vi.fn()
const mockHarmonizeSource = vi.fn()

const instance = 'http://localhost:5173/'

const makeIndexer = () => createIndexer({
  insert: mockInsert,
  query: mockQuery,
  queryBoolean: mockQueryBoolean,
  queryArray: mockQueryArray,
  harmonizeSource: mockHarmonizeSource,
  instance,
})

describe('createIndexer', () => {
  beforeEach(() => vi.clearAllMocks())

  it('should return handler and helper functions', () => {
    const indexer = makeIndexer()
    expect(typeof indexer.handler).toBe('function')
    expect(typeof indexer.handleThorpe).toBe('function')
    expect(typeof indexer.checkIndexingRateLimit).toBe('function')
    expect(typeof indexer.resolveSubtype).toBe('function')
  })

  it('should enforce rate limiting per origin', () => {
    const indexer = makeIndexer()
    expect(indexer.checkIndexingRateLimit('https://example-ratelimit-test.com')).toBe(true)
  })

  it('should allow local harmonizer IDs', () => {
    const indexer = makeIndexer()
    expect(indexer.isHarmonizerAllowed('default', 'https://example.com', { instance })).toBe(true)
  })
})

describe('createBacklink - source-anchored storage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('should anchor blank node on source and point url to target', async () => {
    const indexer = makeIndexer()
    mockInsert.mockResolvedValue(true)

    await indexer.createBacklink(
      'https://source.com/page',
      'https://target.com/page',
      'Bookmark',
      [],
      { instance: 'http://localhost:5173/' }
    )

    const insertCall = mockInsert.mock.calls[0][0]
    // Blank node anchored on source
    expect(insertCall).toContain('<https://source.com/page> octo:octothorpes _:backlink')
    // URL points to target
    expect(insertCall).toContain('_:backlink octo:url <https://target.com/page>')
    // Should NOT have target as the anchor
    expect(insertCall).not.toContain('<https://target.com/page> octo:octothorpes _:backlink')
  })

  it('should include relationship terms on the blank node', async () => {
    const indexer = makeIndexer()
    mockInsert.mockResolvedValue(true)

    await indexer.createBacklink(
      'https://source.com/page',
      'https://target.com/page',
      'Bookmark',
      ['gadgets', 'bikes'],
      { instance: 'http://localhost:5173/' }
    )

    const insertCall = mockInsert.mock.calls[0][0]
    expect(insertCall).toContain('<http://localhost:5173/~/gadgets>')
    expect(insertCall).toContain('<http://localhost:5173/~/bikes>')
    expect(insertCall).toContain('_:backlink rdf:type <octo:Bookmark>')
  })
})

describe('extantBacklink - source-anchored', () => {
  beforeEach(() => vi.clearAllMocks())

  it('should check for source-anchored backlink existence', async () => {
    const indexer = makeIndexer()
    mockQueryBoolean.mockResolvedValue(true)

    await indexer.extantBacklink('https://source.com/page', 'https://target.com/page')

    const query = mockQueryBoolean.mock.calls[0][0]
    // Source is the anchor
    expect(query).toContain('<https://source.com/page> octo:octothorpes _:backlink')
    // URL points to target
    expect(query).toContain('_:backlink octo:url <https://target.com/page>')
  })
})

// #262: ingestBlobject used to await one handleMention per octothorpe, each
// costing ~2 SPARQL round trips. On production (ASK ~1-2s) that hit the 15s
// function ceiling after ~7 links and truncated the write with no error, so a
// 156-link page recorded 7 and never converged on retry. Round trips must stay
// bounded regardless of how many octothorpes a page carries.
describe('#262 ingestBlobject - round trips do not scale with octothorpe count', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInsert.mockResolvedValue(true)
    mockQuery.mockResolvedValue(true)
    mockQueryBoolean.mockResolvedValue(false)
    mockQueryArray.mockResolvedValue({ results: { bindings: [] } })
  })

  const roundTrips = () =>
    mockInsert.mock.calls.length +
    mockQuery.mock.calls.length +
    mockQueryBoolean.mock.calls.length +
    mockQueryArray.mock.calls.length

  const linkBlob = (n) => ({
    '@id': 'https://source.com/page',
    octothorpes: Array.from({ length: n }, (_, i) => ({
      type: 'link',
      uri: `https://example.com/page-${i}`,
    })),
  })

  it('keeps round trips flat as link count grows', async () => {
    const indexer = makeIndexer()

    await indexer.ingestBlobject(linkBlob(5), { instance })
    const few = roundTrips()

    vi.clearAllMocks()
    mockInsert.mockResolvedValue(true)
    mockQuery.mockResolvedValue(true)
    mockQueryBoolean.mockResolvedValue(false)
    mockQueryArray.mockResolvedValue({ results: { bindings: [] } })

    await indexer.ingestBlobject(linkBlob(80), { instance })
    const many = roundTrips()

    // 16x the links must not mean materially more round trips.
    expect(many).toBeLessThanOrEqual(few + 2)
  })

  it('writes every link even when there are many', async () => {
    const indexer = makeIndexer()
    await indexer.ingestBlobject(linkBlob(80), { instance })

    const written = mockInsert.mock.calls.map((c) => c[0]).join('\n')
    for (let i = 0; i < 80; i++) {
      expect(written).toContain(`<https://example.com/page-${i}>`)
    }
  })

  // Webring targets were left per-object on the first pass of #262 on the
  // assumption they stay rare. That assumption is not enforced anywhere, and at
  // 2 round trips each they would wedge at ~7 exactly like the original bug.
  it('keeps round trips flat when every target is a webring', async () => {
    const ringBlob = (n) => ({
      '@id': 'https://source.com/page',
      octothorpes: Array.from({ length: n }, (_, i) => ({
        type: 'link',
        uri: `https://ring-${i}.com`,
      })),
    })
    const allRings = (n) => {
      const uris = Array.from({ length: n }, (_, i) => `https://ring-${i}.com`)
      mockQueryArray.mockImplementation(async (q) => {
        if (q.includes('octo:Webring')) {
          return { results: { bindings: uris.map((u) => ({ probe: { value: u } })) } }
        }
        if (q.includes('octo:hasPart')) {
          return { results: { bindings: [{ domain: { value: 'https://source.com' } }] } }
        }
        // every ring links back, so membership writes are exercised too
        return { results: { bindings: uris.map((u) => ({ probe: { value: u } })) } }
      })
    }

    const indexer = makeIndexer()
    allRings(5)
    await indexer.ingestBlobject(ringBlob(5), { instance })
    const few = roundTrips()

    vi.clearAllMocks()
    mockInsert.mockResolvedValue(true)
    mockQuery.mockResolvedValue(true)
    mockQueryBoolean.mockResolvedValue(false)
    allRings(50)

    await indexer.ingestBlobject(ringBlob(50), { instance })
    expect(roundTrips()).toBeLessThanOrEqual(few + 2)
  })

  it('keeps round trips flat as hashtag count grows', async () => {
    const indexer = makeIndexer()
    const tagBlob = (n) => ({
      '@id': 'https://source.com/page',
      octothorpes: Array.from({ length: n }, (_, i) => `tag${i}`),
    })

    await indexer.ingestBlobject(tagBlob(5), { instance })
    const few = roundTrips()

    vi.clearAllMocks()
    mockInsert.mockResolvedValue(true)
    mockQuery.mockResolvedValue(true)
    mockQueryBoolean.mockResolvedValue(false)
    mockQueryArray.mockResolvedValue({ results: { bindings: [] } })

    await indexer.ingestBlobject(tagBlob(80), { instance })
    expect(roundTrips()).toBeLessThanOrEqual(few + 2)
  })
})
