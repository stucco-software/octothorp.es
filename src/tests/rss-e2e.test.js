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

describe('end-to-end: RSS feed via indexSource', () => {
  beforeEach(() => {
    insertSpy.mockClear()
    queryBooleanSpy.mockResolvedValue(true)
    queryArraySpy.mockResolvedValue({ results: { bindings: [] } })
  })

  it('indexes an RSS feed without per-item opt-in markers', async () => {
    const { createClient } = await import('../../packages/core/index.js')

    const rss = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>E2E Feed</title>
    <link>https://e2e.example.com/feed</link>
    <description>e2e</description>
    <item>
      <title>i1</title>
      <link>https://e2e.example.com/i1</link>
    </item>
  </channel>
</rss>`

    globalThis.fetch = vi.fn().mockResolvedValue({
      text: async () => rss,
      headers: { get: () => 'application/rss+xml' },
    })

    const client = createClient({
      instance: 'http://localhost:5173/',
      sparql: { sparql_endpoint: 'http://0.0.0.0:7878' },
      indexPolicy: 'active',
    })

    const result = await client.indexSource('https://e2e.example.com/feed', {
      harmonizer: 'rss',
    })
    expect(result.uri).toBe('https://e2e.example.com/feed')

    // Verify the SPARQL insert captured the item link as an octothorpe relationship.
    const allInsertText = insertSpy.mock.calls.map(c => c[0]).join('\n')
    expect(allInsertText).toContain('https://e2e.example.com/i1')
  })
})
