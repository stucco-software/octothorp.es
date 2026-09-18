import { describe, it, expect, vi } from 'vitest'

// The /index routes translate core's refusal messages into HTTP statuses.
// A page-level refusal ("Page forbids indexing (robots …)") is a refusal by
// the page, not an internal fault — it must map to 403 like "not opted in",
// not fall through to 500.

vi.mock('$lib/config.js', () => ({ instance: 'http://localhost:5173/' }))
vi.mock('$lib/profile.js', () => ({ getProfile: () => ({ identity: { name: 'Test' } }) }))
vi.mock('$lib/sparql.js', () => ({ queryBoolean: async () => false }))
vi.mock('$lib/indexing.js', () => ({ handler: async () => {}, parseRequestBody: async () => ({}) }))

const routes = {
  '/index': (await import('../routes/index/+server.js'))._mapErrorToStatus,
  '/indexwrapper': (await import('../routes/indexwrapper/+server.js'))._mapErrorToStatus,
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
