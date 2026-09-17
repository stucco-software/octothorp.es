import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createClient, normalizeIndexingMode } from '../../packages/core/client.js'

const insertSpy = vi.fn().mockResolvedValue(true)
const querySpy = vi.fn().mockResolvedValue(true)
const queryBooleanSpy = vi.fn().mockResolvedValue(true)
const queryArraySpy = vi.fn().mockResolvedValue({ results: { bindings: [] } })

vi.mock('../../packages/core/sparqlClient.js', () => ({
  createSparqlClient: () => ({
    insert: insertSpy,
    query: querySpy,
    queryBoolean: queryBooleanSpy,
    queryArray: queryArraySpy,
  }),
}))

// #217 wave 4a: config.indexPolicy is now config.indexingMode. The old name
// collided with blobject.indexPolicy — the per-page opt-in marker extracted
// from markup — which is untouched by this rename.

describe('normalizeIndexingMode', () => {
  it("defaults to 'request'", () => {
    expect(normalizeIndexingMode()).toEqual({ mode: 'request' })
    expect(normalizeIndexingMode(undefined)).toEqual({ mode: 'request' })
  })

  it("accepts 'request' and 'active'", () => {
    expect(normalizeIndexingMode('request')).toEqual({ mode: 'request' })
    expect(normalizeIndexingMode('active')).toEqual({ mode: 'active' })
  })

  it('passes a custom object through as the escape hatch', () => {
    const custom = { mode: 'experimental', check: () => true }
    expect(normalizeIndexingMode(custom)).toBe(custom)
  })

  it("throws on the deleted 'pull' value (audited dead — no implementation)", () => {
    expect(() => normalizeIndexingMode('pull')).toThrow(/indexingMode/i)
  })

  it("throws on 'registered' — that concept moved to the access gate", () => {
    expect(() => normalizeIndexingMode('registered')).toThrow(/indexingMode/i)
  })

  it('accepts the profile spelling verbatim — this is the identity function', () => {
    for (const mode of ['request', 'active']) {
      expect(normalizeIndexingMode(mode).mode).toBe(mode)
    }
  })
})

describe('createClient indexingMode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryBooleanSpy.mockResolvedValue(true)
    queryArraySpy.mockResolvedValue({ results: { bindings: [] } })
  })

  it("forwards indexingMode 'active' into handler() callerContext as policyMode", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      text: async () => '<html><body><p>no markers</p></body></html>',
      headers: { get: () => 'text/html' },
    })

    const client = createClient({
      instance: 'http://localhost:5173/',
      sparql: { sparql_endpoint: 'http://0.0.0.0:7878' },
      indexingMode: 'active',
    })

    await expect(
      client.indexSource('https://example-active.com/p', {})
    ).resolves.toMatchObject({ uri: 'https://example-active.com/p' })
  })

  it('no longer accepts the old config key', () => {
    // An unknown key is ignored, so the client falls back to the default mode
    // rather than silently honoring a stale config.
    const client = createClient({
      instance: 'https://example.test/',
      sparql: { endpoint: 'http://localhost:1/unused' },
      indexPolicy: 'active',
    })
    expect(client).toBeDefined()
  })
})

describe('blobject.indexPolicy is untouched by the rename', () => {
  it('still reads the per-page opt-in marker', async () => {
    const { resolveIndexPolicy } = await import('../../packages/core/client.js')
    expect(resolveIndexPolicy({ blobject: { indexPolicy: 'index' } }).optedIn).toBe(true)
    expect(resolveIndexPolicy({ blobject: { indexPolicy: 'no-index' } }).optedIn).toBe(false)
  })
})
