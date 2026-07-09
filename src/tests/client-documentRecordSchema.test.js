import { describe, it, expect, vi, beforeEach } from 'vitest'

// createClient (packages/core/index.js) builds its internal createIndexer(...)
// call directly from config, and its `get` surface calls into api.get(...).
// Mock both to inspect exactly what config/options createClient forwards,
// without needing a live SPARQL endpoint.
const createIndexerSpy = vi.fn(() => ({
  ingestBlobject: vi.fn(),
  handler: vi.fn(),
}))

const apiGetSpy = vi.fn().mockResolvedValue({ results: [] })
const createApiSpy = vi.fn(() => ({
  get: apiGetSpy,
  fast: {},
}))

vi.mock('../../packages/core/indexer.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, createIndexer: (...args) => createIndexerSpy(...args) }
})

vi.mock('../../packages/core/api.js', () => ({
  createApi: (...args) => createApiSpy(...args),
}))

describe('createClient documentRecordSchema forwarding (#240)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiGetSpy.mockResolvedValue({ results: [] })
  })

  it('forwards config.documentRecordSchema into the internal createIndexer call', async () => {
    const { createClient } = await import('../../packages/core/index.js')
    const schema = [{ predicate: 'octo:type', namespace: 'octo', range: 'string' }]

    createClient({
      instance: 'http://localhost:5173/',
      sparql: { sparql_endpoint: 'http://0.0.0.0:7878' },
      documentRecordSchema: schema,
    })

    expect(createIndexerSpy).toHaveBeenCalledTimes(1)
    expect(createIndexerSpy.mock.calls[0][0]).toMatchObject({ documentRecordSchema: schema })
  })

  it('leaves indexer construction unchanged when documentRecordSchema is not provided', async () => {
    const { createClient } = await import('../../packages/core/index.js')

    createClient({
      instance: 'http://localhost:5173/',
      sparql: { sparql_endpoint: 'http://0.0.0.0:7878' },
    })

    expect(createIndexerSpy).toHaveBeenCalledTimes(1)
    expect(createIndexerSpy.mock.calls[0][0].documentRecordSchema).toBeUndefined()
  })

  it('threads config.documentRecordSchema as the default for client.get reads', async () => {
    const { createClient } = await import('../../packages/core/index.js')
    const schema = [{ predicate: 'octo:type', namespace: 'octo', range: 'string' }]

    const op = createClient({
      instance: 'http://localhost:5173/',
      sparql: { sparql_endpoint: 'http://0.0.0.0:7878' },
      documentRecordSchema: schema,
    })

    await op.get({ what: 'everything', by: 'thorped', s: 'https://example.com/' })

    expect(apiGetSpy).toHaveBeenCalledTimes(1)
    const [, , options] = apiGetSpy.mock.calls[0]
    expect(options.documentRecordSchema).toBe(schema)
  })

  it('lets a per-call documentRecordSchema override the client-level default', async () => {
    const { createClient } = await import('../../packages/core/index.js')
    const clientSchema = [{ predicate: 'octo:type', namespace: 'octo', range: 'string' }]
    const callSchema = [{ predicate: 'octo:override', namespace: 'octo', range: 'string' }]

    const op = createClient({
      instance: 'http://localhost:5173/',
      sparql: { sparql_endpoint: 'http://0.0.0.0:7878' },
      documentRecordSchema: clientSchema,
    })

    await op.get({ what: 'everything', by: 'thorped', s: 'https://example.com/', documentRecordSchema: callSchema })

    const [, , options] = apiGetSpy.mock.calls[0]
    expect(options.documentRecordSchema).toBe(callSchema)
  })

  it('does not set a documentRecordSchema default on reads when client config omits it', async () => {
    const { createClient } = await import('../../packages/core/index.js')

    const op = createClient({
      instance: 'http://localhost:5173/',
      sparql: { sparql_endpoint: 'http://0.0.0.0:7878' },
    })

    await op.get({ what: 'everything', by: 'thorped', s: 'https://example.com/' })

    const [, , options] = apiGetSpy.mock.calls[0]
    expect(options.documentRecordSchema).toBeUndefined()
  })
})
