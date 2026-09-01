import { describe, it, expect, vi, beforeEach } from 'vitest'

// createClient (packages/core/client.js) builds its internal createIndexer(...)
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
    const { createClient } = await import('../../packages/core/client.js')
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
    const { createClient } = await import('../../packages/core/client.js')

    createClient({
      instance: 'http://localhost:5173/',
      sparql: { sparql_endpoint: 'http://0.0.0.0:7878' },
    })

    expect(createIndexerSpy).toHaveBeenCalledTimes(1)
    expect(createIndexerSpy.mock.calls[0][0].documentRecordSchema).toBeUndefined()
  })

  it('threads config.documentRecordSchema as the default for client.get reads', async () => {
    const { createClient } = await import('../../packages/core/client.js')
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
    const { createClient } = await import('../../packages/core/client.js')
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
    const { createClient } = await import('../../packages/core/client.js')

    const op = createClient({
      instance: 'http://localhost:5173/',
      sparql: { sparql_endpoint: 'http://0.0.0.0:7878' },
    })

    await op.get({ what: 'everything', by: 'thorped', s: 'https://example.com/' })

    const [, , options] = apiGetSpy.mock.calls[0]
    expect(options.documentRecordSchema).toBeUndefined()
  })
})

// #217 gap-audit bug: op.js never passed documentRecordSchema to createClient,
// so a programmatic op.get() lost documentRecord projection entirely — only the
// /get route's per-call injection worked. This proves the client-level default.

const fakeProfile = {
  identity: { instance: 'https://example.test/' },
  api: {
    documentRecord: [{ predicate: 'encodingFormat', namespace: 'schema', range: 'literal' }],
    handlers: { dir: null, default: 'html' },
    harmonizers: { dir: null },
  },
  policies: {
    indexing: { mode: 'request' },
    access: {
      registration: 'registered',
      blocks: { domains: [], terms: [] },
      whitelist: { domains: [] },
    },
  },
  vocabulary: { namespaces: [] },
}
vi.mock('$lib/profile.js', () => ({ getProfile: () => fakeProfile }))

// Note: 'octothorpes' resolves to the same module as the relative
// '../../packages/core/client.js' import used by the #240 suite above, so any
// createClient() call anywhere in this file — including ones that happen
// during test execution, after this file's top-level await has already run —
// goes through this mock. Only capture the first call: that's op.js's own
// module-load-time call, which is what these assertions are about.
const captured = {}
vi.mock('octothorpes', async (orig) => {
  const actual = await orig()
  return {
    ...actual,
    createClient: (config) => {
      if (captured.instance === undefined) Object.assign(captured, config)
      return actual.createClient(config)
    },
  }
})

await import('$lib/op.js')

describe('#217 op.js builds createClient config from the profile', () => {
  it('passes documentRecordSchema so programmatic op.get() still projects', () => {
    expect(captured.documentRecordSchema).toEqual(fakeProfile.api.documentRecord)
  })

  it('passes the profile instance', () => {
    expect(captured.instance).toBe('https://example.test/')
  })

  it('passes defaultHandler from api.handlers.default', () => {
    expect(captured.defaultHandler).toBe('html')
  })

  it('passes the two policy axes separately and unmixed', () => {
    // indexingMode = what triggers indexing; access.registration = what gate.
    expect(captured.indexingMode).toBe('request')
    expect(captured.access).toEqual({
      registration: 'registered',
      blocks: { domains: [], terms: [] },
      whitelist: { domains: [] },
    })
  })

  it('passes the effective namespaces', () => {
    expect(captured.namespaces.map((n) => n.prefix)).toContain('schema')
  })
})

// The core-level "documentRecordSchema reaches get()" assertion lives in
// client-documentRecordSchema-reachesGet.test.js. It needs the REAL
// packages/core/{indexer,api}.js, and the #240 suite above mocks both for
// this whole file — vi.doUnmock + vi.resetModules cannot undo that mid-file
// once the 'octothorpes' wrapper mock (used by the #217 suite above) has
// already captured a real module instance via orig(), so a separate file
// keeps that suite honest instead of accidentally re-exercising the mocked
// createApi.
