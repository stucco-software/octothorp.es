import { describe, it, expect, vi } from 'vitest'
import { createRemoteClient } from 'octothorpes'

const json = (body, ok = true, status = 200) => ({ ok, status, json: async () => body })
const profile = (mode = 'request', submissions = 'registered') =>
  json({ policies: { indexing: { mode }, access: { submissions } } })

describe('createRemoteClient construction', () => {
  it('requires a relay', () => {
    expect(() => createRemoteClient({})).toThrow(/relay/)
  })
  it.each(['sparql_endpoint', 'sparql', 'endpoint', 'user', 'password', 'sparql_user', 'sparql_password'])(
    'rejects SPARQL config key %s with a capability error', (key) => {
      expect(() => createRemoteClient({ relay: 'https://r.example', [key]: 'x' })).toThrow(/credential-free|SPARQL/)
    })
})

describe('error detail', () => {
  it('includes the relay response body in thrown errors', async () => {
    const c = createRemoteClient({ relay: 'https://r.example', fetchImpl: async () => ({ ok: false, status: 403, text: async () => 'Anchor authentication failed.' }) })
    await expect(c.get('everything', 'posted')).rejects.toThrow(/403.*Anchor authentication failed\./)
  })
})

describe('requests', () => {
  const relay = 'https://r.example/'
  it('get() builds /get/what/by with query params', async () => {
    const fetchImpl = vi.fn(async () => json({ results: [1] }))
    const c = createRemoteClient({ relay, fetchImpl })
    const out = await c.get('everything', 'thorped', { o: 'cats,dogs', limit: 5, match: 'exact', skip: undefined })
    expect(out).toEqual({ results: [1] })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://r.example/get/everything/thorped?o=cats%2Cdogs&limit=5&match=exact')
  })
  it('get() throws on non-ok response', async () => {
    const c = createRemoteClient({ relay, fetchImpl: async () => json({}, false, 500) })
    await expect(c.get('everything', 'posted')).rejects.toThrow(/500/)
  })
  it('indexRequest() GETs /index?uri=', async () => {
    const fetchImpl = vi.fn(async () => json({ ok: true }))
    const c = createRemoteClient({ relay, fetchImpl })
    await c.indexRequest('https://site.example/page?a=1')
    expect(fetchImpl.mock.calls[0][0]).toBe('https://r.example/index?uri=' + encodeURIComponent('https://site.example/page?a=1'))
  })
  it('submitBlobject() POSTs JSON to /index with mode blobject', async () => {
    const fetchImpl = vi.fn(async () => json({ ok: true }))
    const c = createRemoteClient({ relay, anchor: 'anchor.example', token: 'tok', fetchImpl })
    const blobject = { '@id': 'mem://x', title: 'T' }
    await c.submitBlobject(blobject)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://r.example/index')
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual({ blobject, anchor: 'anchor.example', token: 'tok', mode: 'blobject' })
  })
  it('submitBlobject() includes uri when given', async () => {
    const fetchImpl = vi.fn(async () => json({}))
    const c = createRemoteClient({ relay, anchor: 'a.example', token: 't', fetchImpl })
    await c.submitBlobject({ title: 'T' }, { uri: 'mem://y' })
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).uri).toBe('mem://y')
  })
  it('submitBlobject() requires anchor and token', async () => {
    const c = createRemoteClient({ relay, fetchImpl: vi.fn() })
    await expect(c.submitBlobject({})).rejects.toThrow(/anchor/)
  })
})

describe('handshake', () => {
  const relay = 'https://r.example'
  const run = (opts, fetchImpl) => createRemoteClient({ relay, fetchImpl, ...opts }).handshake()

  it('fetches {relay}/profile.json', async () => {
    const fetchImpl = vi.fn(async () => profile())
    await run({}, fetchImpl)
    expect(fetchImpl.mock.calls[0][0]).toBe('https://r.example/profile.json')
  })
  it('active/active ok', async () => {
    expect(await run({ mode: 'active' }, async () => profile('active'))).toEqual({ ok: true, failures: [] })
  })
  it('client active vs relay request fails', async () => {
    const r = await run({ mode: 'active' }, async () => profile('request'))
    expect(r.ok).toBe(false)
    expect(r.failures.join(' ')).toMatch(/mode/)
  })
  it('client request vs relay active fails', async () => {
    expect((await run({}, async () => profile('active'))).ok).toBe(false)
  })
  it('request/request ok (default mode)', async () => {
    expect((await run({}, async () => profile('request'))).ok).toBe(true)
  })
  it('token with submissions never fails', async () => {
    const r = await run({ token: 't', anchor: 'a.example' }, async () => profile('request', 'never'))
    expect(r.ok).toBe(false)
    expect(r.failures.join(' ')).toMatch(/submissions/)
  })
  it('submissions never without token is fine', async () => {
    expect((await run({}, async () => profile('request', 'never'))).ok).toBe(true)
  })
  it('unreachable profile.json fails closed', async () => {
    const r = await run({}, async () => { throw new Error('ECONNREFUSED') })
    expect(r.ok).toBe(false)
    expect(r.failures[0]).toMatch(/ECONNREFUSED/)
  })
  it('http error fails closed', async () => {
    expect((await run({}, async () => json({}, false, 404))).ok).toBe(false)
  })
  it('invalid profile fails closed', async () => {
    const r = await run({}, async () => json({ nope: true }))
    expect(r.ok).toBe(false)
  })
  it('non-JSON body fails closed', async () => {
    const r = await run({}, async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad json') } }))
    expect(r.ok).toBe(false)
  })
})
