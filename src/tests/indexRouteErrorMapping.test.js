import { describe, it, expect, vi } from 'vitest'

// The /index route translates core's refusal messages into HTTP statuses.
// A page-level refusal ("Page forbids indexing (robots …)") is a refusal by
// the page, not an internal fault — it must map to 403 like "not opted in",
// not fall through to 500.

vi.mock('$lib/config.js', () => ({ instance: 'http://localhost:5173/' }))
vi.mock('$lib/profile.js', () => ({ getProfile: () => ({ identity: { name: 'Test' } }) }))
vi.mock('$lib/sparql.js', () => ({ queryBoolean: async () => false }))
vi.mock('$lib/indexing.js', () => ({ handler: async () => {}, parseRequestBody: async () => ({}) }))

const routes = {
  '/index': (await import('../routes/(endpoints)/index/+server.js'))._mapErrorToStatus,
}

for (const [name, mapErrorToStatus] of Object.entries(routes)) {
  describe(`${name} error mapping`, () => {
    it('maps "not opted in" to 403', () => {
      expect(mapErrorToStatus('Page has not opted in to indexing.')).toBe(403)
    })

    it('maps "forbids indexing" to 403', () => {
      expect(mapErrorToStatus('Page forbids indexing (robots noindex).')).toBe(403)
    })

    it('still maps an unrecognised message to 500', () => {
      expect(mapErrorToStatus('Something exploded')).toBe(500)
    })
  })
}

describe('CORS via hooks.server.js', async () => {
  const { handle, _corsFor } = await import('../hooks.server.js')
  const ev = (path, method = 'GET') => {
    const url = new URL(`http://localhost:5173${path}`)
    return { url, request: new Request(url, { method }) }
  }
  const ok = async () => new Response('ok', { status: 200 })

  it('answers /index preflight with 204 and main\'s header set', async () => {
    const res = await handle({ event: ev('/index', 'OPTIONS'), resolve: ok })
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS')
    expect(res.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type')
  })

  it('adds CORS to /index error responses', async () => {
    const res = await handle({ event: ev('/index'), resolve: async () => new Response('x', { status: 429 }) })
    expect(res.status).toBe(429)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('keeps per-route header sets', () => {
    expect(_corsFor('/get/everything/thorped')).toEqual({ 'Access-Control-Allow-Origin': '*' })
    expect(_corsFor('/domains')).toEqual({ 'Access-Control-Allow-Origin': '*' })
    expect(_corsFor('/~/demo')).toEqual({ 'Access-Control-Allow-Origin': '*' })
    expect(_corsFor('/badge')).toEqual({ 'Access-Control-Allow-Origin': '*' })
    expect(_corsFor('/domains/example.com')['Access-Control-Allow-Headers']).toBe('*')
    expect(_corsFor('/')).toBeNull()
    expect(_corsFor('/debug/core')).toBeNull()
  })

  it('leaves non-CORS routes untouched', async () => {
    const res = await handle({ event: ev('/about'), resolve: ok })
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
})
