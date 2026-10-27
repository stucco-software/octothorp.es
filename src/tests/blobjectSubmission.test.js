import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createIndexer } from '../../packages/core/indexer.js'

// No-auth client tier, Task B4: the blobject submission gate. A client
// harmonizes locally and submits blobject JSON with { anchor, token }; the
// relay gates (knob -> anchor auth -> subject restriction), scopes opaque
// IRIs under the anchor, and writes `<anchor> octo:claims <scopedIri>`.

const instance = 'http://localhost:5173/'
const mockInsert = vi.fn()
const mockQuery = vi.fn()
const mockQueryArray = vi.fn()

let anchorSeq = 0
const freshAnchor = () => `notes${++anchorSeq}.example.test`

const wellKnown = (token = 'tok') => vi.fn(async () => ({
  ok: true,
  json: async () => ({ submissionToken: token }),
}))

const makeIndexer = ({ queryBoolean = vi.fn(async () => false), access, submissions = 'open', cooldown = 0 } = {}) =>
  createIndexer({
    insert: mockInsert,
    query: mockQuery,
    queryBoolean,
    queryArray: mockQueryArray,
    instance,
    access: { allows: { schemes: ['obsidian'] }, ...access },
    submissions,
    cooldown,
  })

const inserted = () => [...mockInsert.mock.calls, ...mockQuery.mock.calls].map((c) => c[0]).join('\n')

const blob = (extra = {}) => ({
  '@id': 'obsidian://open?vault=v&file=a',
  title: 'A note',
  octothorpes: [
    { type: 'link', uri: 'https://rentry.co/x' },
    { type: 'bookmark', uri: 'zotero://select/items/1' },
    'cats',
  ],
  ...extra,
})

beforeEach(() => {
  vi.clearAllMocks()
  mockQueryArray.mockResolvedValue({ results: { bindings: [] } })
})

describe('gate 1: submissions knob', () => {
  it('"never" rejects before any fetch or write', async () => {
    const fetchImpl = wellKnown()
    const indexer = makeIndexer({ submissions: 'never' })
    await expect(indexer.submitBlobject(blob(), { anchor: freshAnchor(), token: 'tok', fetchImpl }))
      .rejects.toThrow(/submissions/)
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('defaults to "never" when nothing is configured', async () => {
    const fetchImpl = wellKnown()
    const indexer = makeIndexer({ submissions: null })
    await expect(indexer.submitBlobject(blob(), { anchor: freshAnchor(), token: 'tok', fetchImpl }))
      .rejects.toThrow(/submissions/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('"registered" requires the anchor to be a verified octo:Origin, before any fetch', async () => {
    const fetchImpl = wellKnown()
    const anchor = freshAnchor()
    const queryBoolean = vi.fn(async () => false)
    const indexer = makeIndexer({ submissions: 'registered', queryBoolean })
    await expect(indexer.submitBlobject(blob(), { anchor, token: 'tok', fetchImpl }))
      .rejects.toThrow(/not registered/)
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('"registered" admits a verified anchor', async () => {
    const queryBoolean = vi.fn(async (q) => q.includes('octo:verified'))
    const indexer = makeIndexer({ submissions: 'registered', queryBoolean })
    await indexer.submitBlobject(blob(), { anchor: freshAnchor(), token: 'tok', fetchImpl: wellKnown() })
    expect(inserted()).toContain('octo:claims')
  })
})

describe('gate 2: anchor auth', () => {
  it('rejects a wrong token and writes nothing', async () => {
    const indexer = makeIndexer()
    await expect(indexer.submitBlobject(blob(), { anchor: freshAnchor(), token: 'nope', fetchImpl: wellKnown('tok') }))
      .rejects.toThrow(/token-mismatch/)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('rejects an unreachable anchor', async () => {
    const indexer = makeIndexer()
    const fetchImpl = vi.fn(async () => { throw new Error('down') })
    await expect(indexer.submitBlobject(blob(), { anchor: freshAnchor(), token: 'tok', fetchImpl }))
      .rejects.toThrow(/unreachable/)
  })

  it('rejects a malformed anchor before any fetch', async () => {
    const fetchImpl = wellKnown()
    const indexer = makeIndexer()
    await expect(indexer.submitBlobject(blob(), { anchor: 'a.test/><x', token: 'tok', fetchImpl }))
      .rejects.toThrow(/anchor/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('normalizes the anchor to lowercase (one cache entry, lowercase fetch URL)', async () => {
    const fetchImpl = wellKnown()
    const indexer = makeIndexer({ cooldown: 300 })
    const anchor = freshAnchor()
    await indexer.submitBlobject(blob(), { anchor: anchor.toUpperCase(), token: 'tok', fetchImpl })
    expect(fetchImpl.mock.calls[0][0]).toBe(`https://${anchor}/.well-known/octothorpes`)
    await indexer.submitBlobject(blob(), { anchor, token: 'tok', fetchImpl })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe('gate 3: subject restriction', () => {
  it('rejects a fetchable http(s) subject (whole submission), writing nothing', async () => {
    const indexer = makeIndexer()
    await expect(indexer.submitBlobject(blob({ '@id': 'https://evil.test/page' }), { anchor: freshAnchor(), token: 'tok', fetchImpl: wellKnown() }))
      .rejects.toThrow(/http/)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('rejects an undeclared scheme', async () => {
    const indexer = makeIndexer()
    await expect(indexer.submitBlobject(blob({ '@id': 'zotero://select/items/9' }), { anchor: freshAnchor(), token: 'tok', fetchImpl: wellKnown() }))
      .rejects.toThrow(/not declared/)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('rejects an unscopeable subject (mailto:x) with a clear error, not a crash', async () => {
    const indexer = makeIndexer({ access: { allows: { schemes: ['mailto'] } } })
    await expect(indexer.submitBlobject(blob({ '@id': 'mailto:me@example.test' }), { anchor: freshAnchor(), token: 'tok', fetchImpl: wellKnown() }))
      .rejects.toThrow(/scope/)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('rejects a subject with a lone surrogate', async () => {
    const indexer = makeIndexer()
    await expect(indexer.submitBlobject(blob({ '@id': 'obsidian://open?x=\uD800' }), { anchor: freshAnchor(), token: 'tok', fetchImpl: wellKnown() }))
      .rejects.toThrow(/scope/)
    expect(mockInsert).not.toHaveBeenCalled()
  })
})

describe('scoping and writes', () => {
  it('writes the claims triple and relationship triples under scoped IRIs', async () => {
    const anchor = freshAnchor()
    const indexer = makeIndexer()
    await indexer.submitBlobject(blob(), { anchor, token: 'tok', fetchImpl: wellKnown() })
    const out = inserted()
    const subj = `https://${anchor}/.op/obsidian/open%3Fvault%3Dv%26file%3Da`
    expect(out).toContain(`<https://${anchor}> octo:claims <${subj}>`)
    expect(out).toContain(`<${subj}> octo:octothorpes <https://rentry.co/x>`)
    // object may be any IRI: opaque objects are scoped too and claimed
    const obj = `https://${anchor}/.op/zotero/select/items/1`
    expect(out).toContain(`<${subj}> octo:octothorpes <${obj}>`)
    expect(out).toContain(`<https://${anchor}> octo:claims <${obj}>`)
    expect(out).toContain('rdf:type <octo:Bookmark>')
  })

  it('no raw opaque IRI appears in any written triple', async () => {
    const indexer = makeIndexer()
    await indexer.submitBlobject(blob(), { anchor: freshAnchor(), token: 'tok', fetchImpl: wellKnown() })
    const out = inserted()
    expect(out).not.toMatch(/obsidian:\/\//)
    expect(out).not.toMatch(/zotero:\/\//)
  })

  it('does not mint the anchor as a verified origin or hasPart edge', async () => {
    const indexer = makeIndexer()
    await indexer.submitBlobject(blob(), { anchor: freshAnchor(), token: 'tok', fetchImpl: wellKnown() })
    const out = inserted()
    expect(out).not.toContain('octo:verified')
    expect(out).not.toContain('octo:hasPart')
    expect(out).not.toContain('<octo:Origin>')
  })

  it('an unscopeable object rejects the whole submission', async () => {
    const indexer = makeIndexer()
    await expect(indexer.submitBlobject(blob({ octothorpes: [{ type: 'link', uri: 'mailto:x@y.test' }] }), { anchor: freshAnchor(), token: 'tok', fetchImpl: wellKnown() }))
      .rejects.toThrow(/scope/)
    expect(mockInsert).not.toHaveBeenCalled()
  })
})

describe('blocks and rate', () => {
  it('blocks.terms drops the term statement', async () => {
    const indexer = makeIndexer({ access: { blocks: { terms: ['cats'] } } })
    await indexer.submitBlobject(blob(), { anchor: freshAnchor(), token: 'tok', fetchImpl: wellKnown() })
    expect(inserted()).not.toContain('/~/cats')
  })

  it('blocks.domains rejects a blocked anchor before any fetch', async () => {
    const fetchImpl = wellKnown()
    const indexer = makeIndexer({ access: { blocks: { domains: ['blocked.test'] } } })
    await expect(indexer.submitBlobject(blob(), { anchor: 'notes.blocked.test', token: 'tok', fetchImpl }))
      .rejects.toThrow(/blocked/i)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('the rate bucket applies per anchor', async () => {
    const anchor = freshAnchor()
    const indexer = makeIndexer()
    const fetchImpl = wellKnown()
    for (let i = 0; i < 10; i++) {
      await indexer.submitBlobject(blob(), { anchor, token: 'tok', fetchImpl })
    }
    await expect(indexer.submitBlobject(blob(), { anchor, token: 'tok', fetchImpl }))
      .rejects.toThrow(/Rate limit/)
  })
})
