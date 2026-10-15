import { describe, it, expect, vi } from 'vitest'

const h = vi.hoisted(() => ({ config: {} }))
vi.mock('$lib/config.js', () => h.config)
vi.mock('../routes/domains/[uri]/domain.js', () => ({
  loadDomain: async (uri) => ({ domain: decodeURIComponent(uri), pages: [], thorpes: [] }),
}))

const load = async () => {
  vi.resetModules()
  return import('../routes/tlo-demo/+page.server.js')
}
const post = (uri) => ({ request: new Request('http://x/tlo-demo', { method: 'POST', body: new URLSearchParams({ uri }) }) })

describe('/tlo-demo route', () => {
  it('serves the page', async () => {
    const route = await load()
    expect(await route.load()).toMatchObject({ origin: 'https://tinylittleoffice.com', domain: 'https://tinylittleoffice.com' })
  })

  it('rejects non-TLO URLs server-side with 400 before touching the indexer', async () => {
    const route = await load()
    const res = await route.actions.default(post('https://example.com/'))
    expect(res.status).toBe(400)
    expect(res.data.error).toMatch(/tinylittleoffice/)
  })
})
