import { describe, it, expect, vi } from 'vitest'

// GET /harmonizer/[id] must serve from the same harmonizer registry the
// indexing path uses: builtins plus the site harmonizers discovered from
// api.harmonizers.dir (static/harmonizers). Before this fix the route built a
// builtins-only registry, so /harmonizer/sitemap 500'd, and the registry's
// not-found throw also turned unknown ids into 500s instead of 404s.
const fakeProfile = {
  identity: { instance: 'https://example.test/' },
  api: {
    documentRecord: [],
    handlers: { dir: './static/handlers', default: 'html' },
    harmonizers: { dir: './static/harmonizers' },
  },
  policies: {
    indexing: { mode: 'request' },
    access: {
      registration: 'registered',
      blocks: { domains: [], terms: [] },
      allows: { domains: [], terms: [] },
    },
  },
  vocabulary: { namespaces: [] },
}
vi.mock('$lib/profile.js', () => ({ getProfile: () => fakeProfile }))

const { GET } = await import('../routes/harmonizer/[id]/+server.js')

const get = (id) => GET({ params: { id } })

describe('GET /harmonizer/[id]', () => {
  it.each(['sitemap', 'csv', 'anchors'])('serves the site harmonizer %s', async (id) => {
    const res = await get(id)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.mode).toBeTruthy()
  })

  it('interpolates the instance into site harmonizers like builtins', async () => {
    const body = await (await get('sitemap')).json()
    expect(JSON.stringify(body)).not.toContain('{{instance}}')
  })

  it('still serves builtins', async () => {
    const res = await get('default')
    expect(res.status).toBe(200)
    expect((await res.json()).mode).toBe('html')
  })

  it('returns 404 for an unknown id', async () => {
    const res = await get('no-such-harmonizer')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Harmonizer not found' })
  })
})
