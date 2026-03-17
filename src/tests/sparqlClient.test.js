import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSparqlClient } from '$lib/sparqlClient.js'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const config = {
  endpoint: 'http://localhost:7878',
  user: 'testuser',
  password: 'testpass',
}

describe('createSparqlClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return an object with queryArray, queryBoolean, query, and insert', () => {
    const client = createSparqlClient(config)
    expect(client).toHaveProperty('queryArray')
    expect(client).toHaveProperty('queryBoolean')
    expect(client).toHaveProperty('query')
    expect(client).toHaveProperty('insert')
    expect(typeof client.queryArray).toBe('function')
    expect(typeof client.queryBoolean).toBe('function')
    expect(typeof client.query).toBe('function')
    expect(typeof client.insert).toBe('function')
  })

  it('should send Authorization header with base64 credentials', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: { bindings: [] } }),
    })

    const client = createSparqlClient(config)
    await client.queryArray('SELECT ?s WHERE { ?s ?p ?o }')

    const call = mockFetch.mock.calls[0]
    const headers = call[1].headers
    expect(headers.get('Authorization')).toBe(
      'Basic ' + btoa('testuser:testpass')
    )
  })

  it('should send queries to the /query endpoint', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: { bindings: [] } }),
    })

    const client = createSparqlClient(config)
    await client.queryArray('SELECT ?s WHERE { ?s ?p ?o }')

    const call = mockFetch.mock.calls[0]
    expect(call[0]).toBe('http://localhost:7878/query')
  })

  it('should send inserts to the /update endpoint with INSERT DATA wrapper', async () => {
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('') })

    const client = createSparqlClient(config)
    await client.insert('<s> <p> <o> .')

    const call = mockFetch.mock.calls[0]
    expect(call[0]).toBe('http://localhost:7878/update')
    const body = call[1].body
    expect(body.get('update')).toContain('INSERT DATA')
    expect(body.get('update')).toContain('<s> <p> <o> .')
  })

  it('should send raw updates to the /update endpoint', async () => {
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('') })

    const client = createSparqlClient(config)
    await client.query('DELETE { ?s ?p ?o } WHERE { ?s ?p ?o }')

    const call = mockFetch.mock.calls[0]
    expect(call[0]).toBe('http://localhost:7878/update')
    const body = call[1].body
    expect(body.get('update')).toContain('DELETE')
  })

  it('should work without auth credentials', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: { bindings: [] } }),
    })

    const client = createSparqlClient({ endpoint: 'http://localhost:7878' })
    await client.queryArray('SELECT ?s WHERE { ?s ?p ?o }')

    const call = mockFetch.mock.calls[0]
    const headers = call[1].headers
    expect(headers.has('Authorization')).toBe(false)
  })

  it('should throw on failed queries', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      text: () => Promise.resolve('Bad query syntax'),
    })

    const client = createSparqlClient(config)
    await expect(client.queryArray('INVALID')).rejects.toThrow('SPARQL query failed')
  })
})
