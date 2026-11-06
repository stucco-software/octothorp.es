import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHash } from 'node:crypto'
import { createIndexer, checkIndexingRateLimit } from '../../packages/core/indexer.js'

// #180: POST /index/batch. The route is driven directly; $lib/indexing.js is
// mocked to hand it either a spy (route-shape tests) or a REAL core indexer
// built over mocked SPARQL (end-to-end gate tests).

const instance = 'https://relay.example/'
const current = { indexBatch: null }

// Store doubles. Origins are verified, nothing is banned, nothing was indexed
// unless listed in `recent`.
const banned = new Set()
const recent = new Set()
const queryBoolean = vi.fn(async (q) => {
  q = String(q)
  if (q.includes('octo:banned')) return [...banned].some((h) => q.includes(h))
  return q.includes('octo:verified')
})
const queryArray = vi.fn(async (q) => {
  q = String(q)
  const hit = [...recent].find((u) => q.includes(`<${u}> octo:indexed ?t`))
  return { results: { bindings: hit ? [{ t: { value: String(Date.now()) } }] : [] } }
})
const insert = vi.fn(async () => true)
const query = vi.fn(async () => true)

vi.mock('$lib/profile.js', () => ({ getProfile: () => ({ identity: { instance: 'https://relay.example/', name: 'relay' } }) }))
vi.mock('$lib/sparql.js', () => ({ queryBoolean: (...a) => queryBoolean(...a) }))
vi.mock('$lib/indexing.js', () => ({
  indexBatch: (...a) => current.indexBatch(...a),
  handler: vi.fn(),
  submitBlobject: vi.fn(),
  parseRequestBody: vi.fn(),
}))

const { POST } = await import('../routes/(endpoints)/index/batch/+server.js')

// Defaults to the relay's own Origin (exempt from the per-URL same-origin
// check) since URL batches require an Origin/Referer; rawPost sends none.
const rawPost = (body, headers = {}) => POST({
  request: new Request('http://localhost/index/batch', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }),
})
const post = (body, headers = {}) => rawPost(body, { origin: instance, ...headers })

// SvelteKit's error() throws an HttpError; normalize to a status.
const statusOf = async (p) => {
  try { return (await p).status } catch (e) { return e.status }
}

describe('route shape (indexBatch spied)', () => {
  const spy = vi.fn()
  beforeEach(() => { spy.mockReset(); current.indexBatch = spy })

  it('maps core statuses, passes warnings through, and summarizes', async () => {
    spy.mockResolvedValue([
      { url: 'https://a.example/1', status: 'indexed' },
      { url: 'https://a.example/2', status: 'indexed', warnings: ['alias claim withheld'] },
      { url: 'https://a.example/3', status: 'warning', error: 'This page has been recently indexed.' },
      { url: 'https://a.example/4', status: 'error', error: 'Page has not opted in to indexing.' },
      { url: 'https://a.example/5', status: 'deleted', mode: 'soft', reason: 'gone' },
      { url: 'obsidian://x', status: 'error', error: 'Anchor auth failed: token-mismatch' },
    ])
    const res = await post({ urls: ['https://a.example/1'] })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.results).toEqual([
      { url: 'https://a.example/1', status: 'indexed' },
      { url: 'https://a.example/2', status: 'indexed', warnings: ['alias claim withheld'] },
      { url: 'https://a.example/3', status: 'skipped', reason: 'This page has been recently indexed.' },
      { url: 'https://a.example/4', status: 'failed', error: 'Page has not opted in to indexing.' },
      { url: 'https://a.example/5', status: 'skipped', reason: 'Page was unavailable and has been marked unavailable', deleted: { mode: 'soft', reason: 'gone' } },
      { url: 'obsidian://x', status: 'failed', error: 'Anchor authentication failed.' },
    ])
    expect(body.summary).toEqual({ indexed: 2, skipped: 2, failed: 2 })
    expect(body.reconcile).toBe(true)
    expect(body.note).toMatch(/asynchronously/)
  })

  it('forwards harmonizer, reconcile, anchor/token and the Origin header', async () => {
    spy.mockResolvedValue([])
    const urls = ['https://a.example/1', { url: 'https://a.example/2', harmonizer: 'custom' }]
    const blobjects = [{ '@id': 'obsidian://open?vault=v&file=a', octothorpes: [] }]
    const res = await post({ urls, blobjects, harmonizer: 'keywords', reconcile: false, anchor: 'notes.example', token: 't' }, { origin: 'https://a.example' })
    expect((await res.json()).reconcile).toBe(false)
    expect(spy).toHaveBeenCalledWith(
      { urls, blobjects, harmonizer: 'keywords', reconcile: false, anchor: 'notes.example', token: 't', requestingOrigin: 'https://a.example' },
      expect.objectContaining({ instance }),
    )
  })

  it('defaults harmonizer to "default" and reconcile to true', async () => {
    spy.mockResolvedValue([])
    await post({ urls: ['https://a.example/1'] })
    expect(spy.mock.calls[0][0]).toMatchObject({ harmonizer: 'default', reconcile: true, blobjects: [] })
  })

  it.each([
    ['empty body', ''],
    ['malformed JSON', '{nope'],
    ['non-object body', '[1,2]'],
    ['neither array', {}],
    ['both arrays empty', { urls: [], blobjects: [] }],
    ['urls not an array', { urls: 'https://a.example/1' }],
    ['non-boolean reconcile', { urls: ['https://a.example/1'], reconcile: 'no' }],
  ])('400 for %s, before core runs', async (_, body) => {
    expect(await statusOf(post(body))).toBe(400)
    expect(spy).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------

const tokenHash = (t) => createHash('sha256').update(t).digest('hex')
const page = '<html><head><title>P</title></head><body><octo-thorpe>cats</octo-thorpe></body></html>'

let seq = 0
const host = (name) => `${name}${++seq}.batch.example`

const registry = {
  getHandler: (mode) => (mode === 'html' ? htmlHandler : null),
  getHandlerForContentType: (ct) => (ct?.startsWith('text/html') ? htmlHandler : null),
}
const htmlHandler = {
  mode: 'html',
  contentTypes: ['text/html'],
  harmonize: async () => ({ '@id': 'source', title: 'P', octothorpes: ['cats'] }),
}

let deleter
const build = ({ submissions = 'open', maxBatchSize } = {}) => {
  deleter = {
    reconcilePage: vi.fn(async () => {}),
    readPageState: vi.fn(async () => null),
    handleDeadPage: vi.fn(async () => ({ outcome: 'ignored' })),
    restorePage: vi.fn(async () => {}),
  }
  const indexer = createIndexer({
    insert, query, queryBoolean, queryArray, instance,
    handlerRegistry: registry,
    access: { allows: { schemes: ['obsidian'] } },
    submissions, maxBatchSize, deleter, cooldown: 300,
  })
  current.indexBatch = indexer.indexBatch
}

// Pages, the anchor well-known, and a host that refuses connections.
let pages
const stubFetch = () => {
  globalThis.fetch = vi.fn(async (url) => {
    url = String(url)
    if (url.includes('://down')) throw new Error('ECONNREFUSED')
    if (url.endsWith('/.well-known/octothorpes')) {
      return new Response(JSON.stringify({ submissionTokenHash: tokenHash('tok') }), { status: 200 })
    }
    if (pages.has(url)) return new Response(page, { status: 200, headers: { 'content-type': 'text/html' } })
    return new Response('nope', { status: 404 })
  })
}
const realFetch = globalThis.fetch

const note = (anchor, file) => ({ '@id': `obsidian://open?vault=v&file=${file}`, title: file, octothorpes: ['cats'] })

describe('end to end through core indexBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    banned.clear(); recent.clear()
    pages = new Set()
    stubFetch()
  })
  afterEach(() => { globalThis.fetch = realFetch })

  const urlsOn = (h, n) => Array.from({ length: n }, (_, i) => {
    const u = `https://${h}/p${i}`
    pages.add(u)
    return u
  })

  it('indexes mixed urls + blobjects in one 200', async () => {
    build()
    const anchor = host('notes')
    const urls = urlsOn(host('site'), 2)
    const res = await post({ urls, blobjects: [note(anchor, 'a'), note(anchor, 'b')], anchor, token: 'tok' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.results.map((r) => r.status)).toEqual(['indexed', 'indexed', 'indexed', 'indexed'])
    expect(body.results.map((r) => r.url)).toEqual([...urls, note(anchor, 'a')['@id'], note(anchor, 'b')['@id']])
    expect(body.summary).toEqual({ indexed: 4, skipped: 0, failed: 0 })
  })

  it('refuses an over-cap batch with 400 before any item runs', async () => {
    build({ maxBatchSize: 3 })
    const anchor = host('notes')
    const res = post({ urls: urlsOn(host('site'), 2), blobjects: [note(anchor, 'a'), note(anchor, 'b')], anchor, token: 'tok' })
    expect(await statusOf(res)).toBe(400)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('defaults the cap to 100', async () => {
    build()
    expect(await statusOf(post({ urls: Array.from({ length: 101 }, (_, i) => `https://x.example/${i}`) }))).toBe(400)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('reconcile:false reaches the blobject path; urls still reconcile', async () => {
    build()
    const anchor = host('notes')
    const [u] = urlsOn(host('site'), 1)
    const body = await (await post({ urls: [u], blobjects: [note(anchor, 'a')], anchor, token: 'tok', reconcile: false })).json()
    expect(body.summary.indexed).toBe(2)
    expect(body.reconcile).toBe(false)
    const reconciled = deleter.reconcilePage.mock.calls.map((c) => c[0])
    expect(reconciled).toEqual([u])
  })

  it('reconciles blobjects by default', async () => {
    build()
    const anchor = host('notes')
    await post({ blobjects: [note(anchor, 'a')], anchor, token: 'tok' })
    expect(deleter.reconcilePage).toHaveBeenCalledTimes(1)
  })

  it('isolates per-item failures', async () => {
    build()
    const site = host('site')
    const [ok1, ok2] = urlsOn(site, 2)
    const bad = `https://${host('down')}/x`
    const body = await (await post({ urls: [ok1, bad, ok2, 'not a url'] })).json()
    expect(body.results.map((r) => r.status)).toEqual(['indexed', 'failed', 'indexed', 'failed'])
    expect(body.results[1].error).toMatch(/ECONNREFUSED/)
    expect(body.summary).toEqual({ indexed: 2, skipped: 0, failed: 2 })
  })

  it('maps cooldown and rate refusals to skipped, gate denials to failed', async () => {
    build()
    const fresh = urlsOn(host('site'), 1)[0]
    const [cooled] = urlsOn(host('site'), 1); recent.add(cooled)
    const bannedHost = host('banned'); banned.add(bannedHost)
    const [isBanned] = urlsOn(bannedHost, 1)
    const limitedHost = host('limited')
    for (let i = 0; i < 10; i++) checkIndexingRateLimit(`https://${limitedHost}`)
    const [limited] = urlsOn(limitedHost, 1)

    const body = await (await post({ urls: [fresh, cooled, isBanned, limited] })).json()
    expect(body.results).toEqual([
      { url: fresh, status: 'indexed' },
      { url: cooled, status: 'skipped', reason: 'This page has been recently indexed.' },
      { url: isBanned, status: 'failed', error: 'Origin is banned from this server.' },
      { url: limited, status: 'skipped', reason: 'Rate limit exceeded. Please try again later.' },
    ])
  })

  it('charges the rate bucket once per origin per batch, not per item', async () => {
    build()
    // 12 pages on one origin: more than the 10/minute per-origin bucket.
    const body = await (await post({ urls: urlsOn(host('site'), 12) })).json()
    expect(body.summary).toEqual({ indexed: 12, skipped: 0, failed: 0 })
  })

  it('submissions off + urls present: urls run, each blobject fails, still 200', async () => {
    build({ submissions: 'never' })
    const anchor = host('notes')
    const [u] = urlsOn(host('site'), 1)
    const res = await post({ urls: [u], blobjects: [note(anchor, 'a'), note(anchor, 'b')], anchor, token: 'tok' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.results.map((r) => r.status)).toEqual(['indexed', 'failed', 'failed'])
    expect(body.results[1].error).toMatch(/does not accept blobject submissions/)
  })

  it('urls without Origin/Referer: 400 before any item runs', async () => {
    build()
    const res = rawPost({ urls: urlsOn(host('site'), 1) })
    expect(await statusOf(res)).toBe(400)
    await res.catch((e) => expect(e.body.message).toBe('Origin or Referer header required.'))
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('mixed urls + blobjects without Origin/Referer: 400', async () => {
    build()
    const anchor = host('notes')
    expect(await statusOf(rawPost({ urls: urlsOn(host('site'), 1), blobjects: [note(anchor, 'a')], anchor, token: 'tok' }))).toBe(400)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('blobjects-only without Origin/Referer is still processed (anchor auth)', async () => {
    build()
    const anchor = host('notes')
    const res = await rawPost({ blobjects: [note(anchor, 'a')], anchor, token: 'tok' })
    expect(res.status).toBe(200)
    expect((await res.json()).summary).toEqual({ indexed: 1, skipped: 0, failed: 0 })
  })

  it('submissions off + blobjects only: whole-set 403', async () => {
    build({ submissions: 'never' })
    const anchor = host('notes')
    expect(await statusOf(post({ blobjects: [note(anchor, 'a')], anchor, token: 'tok' }))).toBe(403)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})
