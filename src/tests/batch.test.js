import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const insertSpy = vi.fn().mockResolvedValue(true)
const querySpy = vi.fn().mockResolvedValue(true)
const queryBooleanSpy = vi.fn().mockResolvedValue(false)
const queryArraySpy = vi.fn().mockResolvedValue({ results: { bindings: [] } })

vi.mock('../../packages/core/sparqlClient.js', () => ({
  createSparqlClient: () => ({
    insert: insertSpy,
    query: querySpy,
    queryBoolean: queryBooleanSpy,
    queryArray: queryArraySpy,
  }),
}))

// Write mode delegates to the indexer's shared batch engine; spy on it
// pass-through so the real per-item loop (and rate memo) runs.
const ingestSpy = vi.fn().mockResolvedValue({})
const handlerSpy = vi.fn().mockResolvedValue({})
const trustedSpy = vi.fn()
vi.mock('../../packages/core/indexer.js', async (orig) => {
  const mod = await orig()
  return {
    ...mod,
    createIndexer: (deps) => {
      const real = mod.createIndexer(deps)
      trustedSpy.mockImplementation(real.indexBatchTrusted)
      return { ...real, ingestBlobject: ingestSpy, handler: handlerSpy, indexBatchTrusted: trustedSpy }
    },
  }
})

const { createClient } = await import('../../packages/core/client.js')

const page = (title, tag) => `<html><head><title>${title}</title></head><body><octo-thorpe>${tag}</octo-thorpe></body></html>`
const pages = {
  'https://a.example/one': page('One', 'alpha'),
  'https://b.example/two': page('Two', 'beta'),
}

const makeClient = (extra = {}) => createClient({ instance: 'https://relay.example/', sparql: { endpoint: 'http://sparql.invalid' }, ...extra })
// Active mode skips origin registration, so the real handler can run against the stubbed store.
const writeClient = () => makeClient({ indexingMode: 'active' })

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    if (url === 'https://down.example/x') throw new Error('ECONNREFUSED')
    const body = pages[url]
    if (!body) return new Response('nope', { status: 404 })
    return new Response(body, { status: 200, headers: { 'content-type': 'text/html' } })
  }))
})
afterEach(() => vi.unstubAllGlobals())

const handBlobject = { '@id': 'https://c.example/three', title: 'Three', date: 1700000000000, octothorpes: ['gamma'] }

describe('batchHarmonize', () => {
  it('return-only harmonizes mixed url / blobject items with zero writes', async () => {
    const op = makeClient()
    const res = await op.batchHarmonize([
      'https://a.example/one',
      { url: 'https://b.example/two' },
      { blobject: handBlobject },
    ])
    expect(res.map((r) => r.status)).toEqual(['ok', 'ok', 'ok'])
    expect(res[0].blobject['@id']).toBe('https://a.example/one')
    expect(res[0].blobject.title).toBe('One')
    expect(res[2].blobject).toBe(handBlobject)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(insertSpy).not.toHaveBeenCalled()
    expect(querySpy).not.toHaveBeenCalled()
    expect(ingestSpy).not.toHaveBeenCalled()
    expect(handlerSpy).not.toHaveBeenCalled()
  })

  it('write mode delegates to indexBatchTrusted with items, harmonizer, reconcile', async () => {
    const op = writeClient()
    const items = [{ url: 'https://a.example/one', harmonizer: 'openGraph' }, { blobject: handBlobject }]
    await op.batchHarmonize(items, { harmonizer: 'keywords', mode: 'write', reconcile: false })
    expect(trustedSpy).toHaveBeenCalledTimes(1)
    const [passedItems, opts, handlerConfig] = trustedSpy.mock.calls[0]
    expect(passedItems).toBe(items)
    expect(opts).toMatchObject({ harmonizer: 'keywords', reconcile: false })
    expect(handlerConfig).toMatchObject({ instance: 'https://relay.example/', policyMode: 'active', reconcile: false })
    expect(handlerSpy).not.toHaveBeenCalled()
  })

  it('write mode indexes urls and blobjects in order, keeping the result contract', async () => {
    const op = writeClient()
    const res = await op.batchHarmonize(['https://a.example/one', { blobject: handBlobject }], { mode: 'write' })
    expect(res).toEqual([
      { url: 'https://a.example/one', status: 'indexed' },
      { url: handBlobject['@id'], status: 'indexed', blobject: handBlobject },
    ])
    expect(insertSpy).toHaveBeenCalled()
  })

  it('a same-origin write batch over the rate limit fully indexes (one charge per origin)', async () => {
    const urls = Array.from({ length: 12 }, (_, i) => `https://rate.example/p${i}`)
    for (const u of urls) pages[u] = page(`P${u}`, 'rate')
    const op = writeClient()
    const res = await op.batchHarmonize(urls, { mode: 'write' })
    expect(res.map((r) => r.status)).toEqual(urls.map(() => 'indexed'))
  })

  it('one failing item does not sink the batch', async () => {
    const op = makeClient()
    const res = await op.batchHarmonize([
      'https://down.example/x',
      'https://missing.example/404',
      { nothing: true },
      'https://a.example/one',
    ])
    expect(res.map((r) => r.status)).toEqual(['error', 'error', 'error', 'ok'])
    expect(res[0].error).toMatch(/ECONNREFUSED/)
    expect(res[3].blobject.title).toBe('One')
  })

  it('write-mode handler failures are per-item too', async () => {
    const op = writeClient()
    const res = await op.batchHarmonize(['https://down.example/x', 'https://b.example/two'], { mode: 'write' })
    expect(res.map((r) => r.status)).toEqual(['error', 'indexed'])
    expect(res[0].error).toMatch(/ECONNREFUSED/)
  })
})

describe('batchPublish', () => {
  const blobjects = [
    { '@id': 'https://c.example/a', title: 'A', date: 1700000000000, description: 'first' },
    { '@id': 'https://c.example/b', title: 'B', date: 1700000100000 },
  ]

  it('renders a hand-made blobject array through a builtin publisher as one set', async () => {
    const op = makeClient()
    const res = await op.batchPublish(blobjects, 'rss2', { title: 'Batch', link: 'https://c.example/', description: 'd' })
    expect(res.status).toBe('ok')
    expect(res.count).toBe(2)
    expect(res.output).toContain('<title>A</title>')
    expect(res.output).toContain('https://c.example/b')
    expect(res.output).toContain('Batch')
  })

  it('perItem isolates a bad record', async () => {
    const op = makeClient()
    const pub = {
      resolver: { '@context': 'x', '@id': 'x', type: 'resolver', schema: { title: { from: 'title', required: true } } },
      contentType: 'text/plain',
      render: (items) => {
        if (items.length === 0) throw new Error('nothing to render')
        return items.map((i) => i.title).join(',')
      },
    }
    const res = await op.batchPublish([...blobjects, { '@id': 'https://c.example/untitled' }], pub, { perItem: true })
    expect(res.results.map((r) => r.status)).toEqual(['ok', 'ok', 'error'])
    expect(res.results[0].output).toBe('A')
  })
})
