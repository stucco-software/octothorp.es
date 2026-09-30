import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getHarmonizer } from '$lib/getHarmonizer.js'
import { createIndexer } from '../../packages/core/indexer.js'
import { createHandlerRegistry } from '../../packages/core/handlerRegistry.js'
import htmlHandler from '../../packages/core/handlers/html/handler.js'
import { createClientEndorsed } from '$lib/endorsers/clientEndorsed.js'

// Endorsement gate against the LIVE devdemo pages, with a Bear-shaped access
// config supplied in-test (the smoketest target can't exercise this: its origin
// is already registered and its profile has no endorsement sources). Harness
// follows src/tests/indexerEndorsement.test.js but uses the real HTML handler
// and the real network fetch. Skips cleanly when the pages are unreachable.

const MARKER_PAGE = 'https://nimdaghlian.github.io/devdemo/custom-endorsement-marker'
const CONTROL_PAGE = 'https://nimdaghlian.github.io/devdemo/indexing-policy'
const ORIGIN = 'https://nimdaghlian.github.io'
const instance = 'http://localhost:5173/'

const reachable = await (async () => {
  try {
    const res = await fetch(MARKER_PAGE, { signal: AbortSignal.timeout(5000) })
    return res.ok
  } catch { return false }
})()

if (!reachable) console.warn('[endorsementLive] Skipping live tests: devdemo unreachable')

const mockInsert = vi.fn()
const mockQuery = vi.fn()
const mockQueryBoolean = vi.fn()
const mockQueryArray = vi.fn()

const makeIndexer = () => {
  const reg = createHandlerRegistry()
  reg.register('html', htmlHandler)
  reg.setDefault('html')
  return createIndexer({
    insert: mockInsert,
    query: mockQuery,
    queryBoolean: mockQueryBoolean,
    queryArray: mockQueryArray,
    instance,
    handlerRegistry: reg,
    getHarmonizer,
    access: { registration: 'registered', endorsement: { sources: ['client-endorsed'] } },
    endorsers: [createClientEndorsed({ marker: 'test-marker-123' })],
  })
}

const config = {
  instance,
  serverName: instance,
  queryBoolean: mockQueryBoolean,
  verifyOrigin: async () => false,
}

const inserted = () => mockInsert.mock.calls.map((c) => c[0]).join('\n')

describe.skipIf(!reachable)('endorsement gate against live devdemo pages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryBoolean.mockResolvedValue(false)
    mockQueryArray.mockResolvedValue({ results: { bindings: [] } })
  })

  it('admits the marker page without registering its origin', async () => {
    await makeIndexer().handler(MARKER_PAGE, 'default', null, config)
    const out = inserted()
    expect(out).toContain(`<${MARKER_PAGE}>`)
    expect(out).not.toContain(`<${ORIGIN}> octo:verified`)
    expect(out).not.toContain(`<${ORIGIN}> rdf:type <octo:Origin>`)
  }, 20000)

  it('denies an unmarked page from the same unregistered origin', async () => {
    await expect(makeIndexer().handler(CONTROL_PAGE, 'default', null, config))
      .rejects.toThrow(/not registered/i)
    expect(mockInsert).not.toHaveBeenCalled()
  }, 20000)

  it('refuses the marker page for robots noindex when crawler-initiated', async () => {
    await expect(makeIndexer().handler(MARKER_PAGE, 'default', null, {
      ...config,
      policyMode: 'active',
    })).rejects.toThrow(/robots noindex/i)
    expect(mockInsert).not.toHaveBeenCalled()
  }, 20000)
})
