import { describe, it, expect, vi, beforeEach } from 'vitest'

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

describe('createClient policy threading', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryBooleanSpy.mockResolvedValue(true)
    queryArraySpy.mockResolvedValue({ results: { bindings: [] } })
  })

  it("forwards Client policyMode 'active' into handler() callerContext", async () => {
    const { createClient } = await import('../../packages/core/index.js')

    globalThis.fetch = vi.fn().mockResolvedValue({
      text: async () => '<html><body><p>no markers</p></body></html>',
      headers: { get: () => 'text/html' },
    })

    const client = createClient({
      instance: 'http://localhost:5173/',
      sparql: { sparql_endpoint: 'http://0.0.0.0:7878' },
      indexPolicy: 'active',
    })

    await expect(
      client.indexSource('https://example-active.com/p', {})
    ).resolves.toMatchObject({ uri: 'https://example-active.com/p' })
  })
})
