import { describe, it, expect, vi, beforeEach } from 'vitest'

// #321 stub: /request endpoint -> octo:requested write -> admin queue.
// Same mocking shape as admin.test.js: real core functions, fake SPARQL deps.

const h = vi.hoisted(() => ({
  config: { admin_secret: 's3cret' },
  access: { registration: 'registered', blocks: { domains: [] } },
  banned: new Set(),
  verified: new Set(),
  requested: new Set()
}))

vi.mock('$lib/config.js', () => h.config)
vi.mock('$lib/profile.js', () => ({
  getProfile: () => ({
    identity: { instance: 'http://localhost:5173/', name: 'test' },
    policies: { access: h.access }
  })
}))
vi.mock('$lib/sparql.js', () => {
  const has = (set, q) => [...set].some((o) => q.includes(`<${o}>`))
  return {
    queryBoolean: vi.fn(async (q) => q.includes('octo:banned') ? has(h.banned, q) : has(h.verified, q)),
    query: vi.fn(async () => true),
    queryArray: vi.fn(async () => ({
      results: { bindings: [...h.requested].map((o) => ({ origin: { value: o } })) }
    })),
    insert: vi.fn(async () => true)
  }
})

import { query, insert, queryArray } from '$lib/sparql.js'
import { requestRegistration, requestedOrigins, clearRegistrationRequest, approveOrigin, banOrigin } from 'octothorpes'
import { GET, POST, _parseRequestedOrigin } from '../routes/(endpoints)/request/+server.js'
import { GET as feed } from '../routes/(endpoints)/request/rss/+server.js'
import { load, actions } from '../routes/admin/+page.server.js'

const get = (uri) => GET({ request: { url: `http://localhost:5173/request${uri !== undefined ? `?uri=${encodeURIComponent(uri)}` : ''}` } })
const post = (body) => POST({
  request: {
    headers: { get: (k) => (k.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => body
  }
})
const form = (fields) => ({ request: { formData: async () => new Map(Object.entries(fields)) } })

// error() in SvelteKit 2 throws; normalize route calls to { status, body }.
const run = async (fn) => {
  try {
    const res = await fn()
    return { status: res.status, body: await res.json() }
  } catch (e) {
    return { status: e.status, body: e.body }
  }
}

let n = 0
// A fresh origin per test: the real checkIndexingRateLimit keeps module-level
// state, so reusing an origin across tests would cross-contaminate quotas.
const freshOrigin = () => `https://site${++n}.example`

beforeEach(() => {
  h.config.admin_secret = 's3cret'
  h.access.registration = 'registered'
  h.banned.clear()
  h.verified.clear()
  h.requested.clear()
  query.mockClear()
  insert.mockClear()
  queryArray.mockClear()
})

describe('core requestRegistration', () => {
  it('writes one deduped octo:requested triple on the origin', async () => {
    const origin = freshOrigin()
    const status = await requestRegistration(origin, {
      queryBoolean: async () => false,
      query
    })
    expect(status).toBe('requested')
    const update = query.mock.calls[0][0]
    expect(update).toContain(`<${origin}> octo:requested "true"`)
    expect(update).toContain(`<${origin}> rdf:type <octo:Origin>`)
    // Dedupe: insert is guarded by filter not exists over the origin variants.
    expect(update).toMatch(/filter not exists/)
    expect(update).toContain(`values ?origin`)
    expect(update).toContain('?origin octo:requested "true"')
  })

  it('refuses a banned origin without writing', async () => {
    const origin = freshOrigin()
    h.banned.add(origin)
    const status = await requestRegistration(origin, {
      queryBoolean: async (q) => q.includes('octo:banned') && q.includes(`<${origin}>`),
      query
    })
    expect(status).toBe('banned')
    expect(query).not.toHaveBeenCalled()
  })

  it('is a no-op for a verified origin', async () => {
    const origin = freshOrigin()
    const status = await requestRegistration(origin, {
      queryBoolean: async (q) => q.includes('octo:verified'),
      query
    })
    expect(status).toBe('already-verified')
    expect(query).not.toHaveBeenCalled()
  })
})

describe('GET/POST /request', () => {
  it('202 and a write on a fresh request (GET)', async () => {
    const origin = freshOrigin()
    const { status, body } = await run(() => get(`${origin}/some/page`))
    expect(status).toBe(202)
    expect(body).toMatchObject({ status: 'requested', origin })
    expect(query.mock.calls[0][0]).toContain(`<${origin}> octo:requested "true"`)
  })

  it('202 on a POST body uri', async () => {
    const origin = freshOrigin()
    const { status, body } = await run(() => post({ uri: `${origin}/page` }))
    expect(status).toBe(202)
    expect(body.origin).toBe(origin)
  })

  it('400 on a missing or invalid uri, no write', async () => {
    expect((await run(() => get())).status).toBe(400)
    expect((await run(() => get('not a url'))).status).toBe(400)
    expect((await run(() => get('ftp://x.example'))).status).toBe(400)
    expect((await run(() => post({}))).status).toBe(400)
    expect(query).not.toHaveBeenCalled()
  })

  it('403 for a banned origin, no write', async () => {
    const origin = freshOrigin()
    h.banned.add(origin)
    const { status } = await run(() => get(origin))
    expect(status).toBe(403)
    expect(query).not.toHaveBeenCalled()
  })

  it('200 no-op for an already-verified origin, no write', async () => {
    const origin = freshOrigin()
    h.verified.add(origin)
    const { status, body } = await run(() => get(origin))
    expect(status).toBe(200)
    expect(body.status).toBe('already-verified')
    expect(query).not.toHaveBeenCalled()
  })

  it('429 once the shared indexing rate limit is hit', async () => {
    const origin = freshOrigin()
    // MAX_INDEXING_REQUESTS is 10 in core's indexer; the 11th call inside the
    // window must refuse before touching the store.
    for (let i = 0; i < 10; i++) {
      expect((await run(() => get(`${origin}/p${i}`))).status).toBe(202)
    }
    query.mockClear()
    const { status } = await run(() => get(`${origin}/p-over`))
    expect(status).toBe(429)
    expect(query).not.toHaveBeenCalled()
  })
})

describe('acting on a request clears the triple', () => {
  it('approveOrigin deletes octo:requested after verifying', async () => {
    const origin = freshOrigin()
    await approveOrigin(origin, { insert, query })
    expect(insert.mock.calls[0][0]).toContain(`<${origin}> octo:verified "true"`)
    const deletes = query.mock.calls.map((c) => c[0]).filter((q) => q.includes('octo:requested'))
    expect(deletes).toHaveLength(1)
    expect(deletes[0]).toContain('delete { ?origin octo:requested ?r . }')
    expect(deletes[0]).toContain(`<${origin}>`)
  })

  it('banOrigin purges every origin triple (requested included)', async () => {
    const origin = freshOrigin()
    await banOrigin(origin, { query })
    const purge = query.mock.calls.map((c) => c[0]).find((q) => q.includes('?origin ?p ?o'))
    expect(purge).toContain('delete { ?origin ?p ?o . }')
    expect(purge).toContain(`<${origin}>`)
  })

  it('clearRegistrationRequest deletes on every variant spelling', async () => {
    await clearRegistrationRequest('https://www.site.example', { query })
    const del = query.mock.calls[0][0]
    expect(del).toContain('delete { ?origin octo:requested ?r . }')
    expect(del).toContain('<https://site.example>')
    expect(del).toContain('<https://www.site.example>')
  })

  it('admin dismiss action deletes the request triple only', async () => {
    const res = await actions.dismiss(form({ domain: 'https://site.example/x', secret: 's3cret' }))
    expect(res.message).toBe('Dismissed the request from https://site.example.')
    expect(query).toHaveBeenCalledOnce()
    expect(query.mock.calls[0][0]).toContain('octo:requested')
    expect(insert).not.toHaveBeenCalled()
  })

  it('admin dismiss is guarded like the other actions', async () => {
    expect((await actions.dismiss(form({ domain: 'https://x.example', secret: 'nope' }))).status).toBe(401)
    expect((await actions.dismiss(form({ domain: 'not a url', secret: 's3cret' }))).status).toBe(400)
    expect(query).not.toHaveBeenCalled()
  })
})

describe('admin queue + feed', () => {
  it('load lists requested origins', async () => {
    h.requested.add('https://pending.example')
    const data = await load()
    expect(data.requested).toEqual(['https://pending.example'])
  })

  it('requestedOrigins maps bindings to origin strings', async () => {
    h.requested.add('https://a.example').add('https://b.example')
    expect(await requestedOrigins({ queryArray })).toEqual(['https://a.example', 'https://b.example'])
  })

  it('rss feed carries one item per requested origin', async () => {
    h.requested.add('https://pending.example')
    const res = await feed()
    expect(res.headers.get('content-type')).toBe('application/rss+xml')
    const xml = await res.text()
    expect(xml).toContain('<link>https://pending.example</link>')
    expect(xml).toContain('Requested origins')
  })
})

describe('_parseRequestedOrigin', () => {
  it('canonicalizes to the origin and rejects non-http', () => {
    expect(_parseRequestedOrigin('https://www.site.example/a/page?q=1')).toBe('https://site.example')
    expect(_parseRequestedOrigin('ftp://site.example')).toBeNull()
    expect(_parseRequestedOrigin('nope')).toBeNull()
    expect(_parseRequestedOrigin(undefined)).toBeNull()
  })
})
