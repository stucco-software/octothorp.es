import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createIndexer } from '../../packages/core/indexer.js'
import { JSDOM } from 'jsdom'

// #217 wave 4 stage 4, at the indexer seam: createClient hands its injected
// endorsers to createIndexer, and handler() builds the endorsement argument
// for the gate out of the EFFECTIVE access block plus the page it already
// fetched. These tests mirror the wiring style of src/tests/accessGate.test.js
// — stub handler registry, stubbed global fetch, mocked SPARQL deps.

const mockInsert = vi.fn()
const mockQuery = vi.fn()
const mockQueryBoolean = vi.fn()
const mockQueryArray = vi.fn()
const instance = 'http://localhost:5173/'

// The distinctive string only ever exists in the RAW body: no blobject field
// carries it, which is the whole reason `content` is part of the contract.
const MARKER = "<meta content='client-endorsed-9f3c'>"
const pageUri = 'https://bear-endorsed.test/page'

// The real HTML handler exports `parse`; the stub does too, so the indexer
// caches a Document on the source object the way it does in production.
const parse = (content) => new JSDOM(content, { contentType: 'text/html' }).window.document

const stubRegistry = (harmonize) => ({
  getHandler: (mode) => mode === 'html'
    ? { mode: 'html', contentTypes: ['text/html'], harmonize, parse }
    : null,
  getHandlerForContentType: (ct) => ct?.startsWith('text/html')
    ? { mode: 'html', contentTypes: ['text/html'], harmonize, parse }
    : null,
})

const makeIndexer = ({ sources, endorsers, octothorpes = ['cats'] }) => {
  const harmonize = vi.fn(async () => ({
    '@id': pageUri,
    title: 'Bear post',
    indexPolicy: 'index',
    octothorpes,
  }))
  return createIndexer({
    insert: mockInsert,
    query: mockQuery,
    queryBoolean: mockQueryBoolean,
    queryArray: mockQueryArray,
    instance,
    handlerRegistry: stubRegistry(harmonize),
    access: { registration: 'registered', endorsement: { sources } },
    endorsers,
  })
}

const inserted = () => mockInsert.mock.calls.map((c) => c[0]).join('\n')

describe('indexer: injected endorsers reach the gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryBoolean.mockResolvedValue(false)
    mockQueryArray.mockResolvedValue({ results: { bindings: [] } })
    globalThis.fetch = vi.fn().mockResolvedValue({
      text: async () => `<html><head>${MARKER}</head><body>hi</body></html>`,
      headers: { get: () => 'text/html' },
    })
  })

  const config = {
    instance,
    serverName: instance,
    queryBoolean: mockQueryBoolean,
    verifyOrigin: async () => false,
  }

  it('admits an unregistered origin whose fetched page carries the marker', async () => {
    const endorse = vi.fn(({ content }) => content.includes('client-endorsed-9f3c'))
    const indexer = makeIndexer({
      sources: ['client-endorsed'],
      endorsers: [{ name: 'client-endorsed', endorse }],
    })

    await indexer.handler(pageUri, 'default', null, config)

    expect(endorse).toHaveBeenCalledOnce()
    const arg = endorse.mock.calls[0][0]
    expect(arg.origin).toBe('https://bear-endorsed.test')
    expect(arg.content).toContain(MARKER)
    expect(arg.contentType).toContain('text/html')
    // Non-opted-in path: the policy probe's blobject is passed along.
    expect(arg.blobject).toMatchObject({ '@id': pageUri })
    // The HTML path hands over the already-parsed document (task 4), so an
    // endorser never has to parse the page a second time.
    expect(typeof arg.document?.querySelectorAll).toBe('function')
    // ...and indexing actually proceeded.
    expect(inserted()).toContain('~/cats')
  })

  it('never calls the endorser when sources is empty, and denies as unregistered', async () => {
    const endorse = vi.fn(() => true)
    const indexer = makeIndexer({
      sources: [],
      endorsers: [{ name: 'client-endorsed', endorse }],
    })

    await expect(indexer.handler(pageUri, 'default', null, config))
      .rejects.toThrow(/not registered/i)
    expect(endorse).not.toHaveBeenCalled()
  })

  it('honours a per-call access override that turns the stage on', async () => {
    const endorse = vi.fn(() => true)
    const indexer = makeIndexer({
      sources: [],
      endorsers: [{ name: 'client-endorsed', endorse }],
    })

    await indexer.handler(pageUri, 'default', null, {
      ...config,
      access: { registration: 'registered', endorsement: { sources: ['client-endorsed'] } },
    })
    expect(endorse).toHaveBeenCalledOnce()
  })
})

// An endorsed admission is per-request (see checkAccessGate stage 4), so the
// recording path must not quietly promote the origin: writing octo:verified /
// rdf:type octo:Origin would let every later unmarked page from that origin
// pass datastore verification. octo:hasPart and page triples are still written.
describe('indexer: an endorsed admission does not register its origin', () => {
  const origin = 'https://bear-endorsed.test'
  const octothorpes = ['cats', { type: 'link', uri: 'https://elsewhere.test/p' }]

  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryBoolean.mockResolvedValue(false)
    mockQueryArray.mockResolvedValue({ results: { bindings: [] } })
    globalThis.fetch = vi.fn().mockResolvedValue({
      text: async () => `<html><head>${MARKER}</head><body>hi</body></html>`,
      headers: { get: () => 'text/html' },
    })
  })

  const config = (verified) => ({
    instance,
    serverName: instance,
    queryBoolean: mockQueryBoolean,
    verifyOrigin: async () => verified,
  })

  it('endorsed: writes hasPart but not verified / Origin', async () => {
    const indexer = makeIndexer({
      sources: ['client-endorsed'],
      endorsers: [{ name: 'client-endorsed', endorse: () => true }],
      octothorpes,
    })
    await indexer.handler(pageUri, 'default', null, config(false))

    const out = inserted()
    expect(out).toContain('~/cats')
    expect(out).toContain('<https://elsewhere.test/p>')
    expect(out).toContain(`<${origin}> octo:hasPart <${pageUri}>`)
    expect(out).not.toContain(`<${origin}> octo:verified`)
    expect(out).not.toContain(`<${origin}> rdf:type <octo:Origin>`)
  })

  it('registered: still writes verified / Origin', async () => {
    const endorse = vi.fn(() => true)
    const indexer = makeIndexer({
      sources: ['client-endorsed'],
      endorsers: [{ name: 'client-endorsed', endorse }],
      octothorpes,
    })
    await indexer.handler(pageUri, 'default', null, config(true))

    expect(endorse).not.toHaveBeenCalled()
    const out = inserted()
    expect(out).toContain(`<${origin}> octo:hasPart <${pageUri}>`)
    expect(out).toContain(`<${origin}> octo:verified "true"`)
    expect(out).toContain(`<${origin}> rdf:type <octo:Origin>`)
  })
})
