import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ config: { tlo_demo: undefined } }))
vi.mock('$lib/config.js', () => h.config)

const load = async () => {
  vi.resetModules()
  return import('../routes/tlo-demo/+page.server.js')
}
const post = (uri) => ({ request: new Request('http://x/tlo-demo', { method: 'POST', body: new URLSearchParams({ uri }) }) })

describe('/tlo-demo flag gating', () => {
  beforeEach(() => { h.config.tlo_demo = undefined })

  it('404s the page and the action when tlo_demo is unset', async () => {
    const route = await load()
    expect(() => route.load()).toThrow(expect.objectContaining({ status: 404 }))
    await expect(route.actions.default(post('https://tinylittleoffice.com/write/#doc=x')))
      .rejects.toMatchObject({ status: 404 })
  })

  it('404s when tlo_demo=false', async () => {
    h.config.tlo_demo = 'false'
    const route = await load()
    expect(() => route.load()).toThrow(expect.objectContaining({ status: 404 }))
  })

  it('serves the page when tlo_demo=true', async () => {
    h.config.tlo_demo = 'true'
    const route = await load()
    expect(route.load()).toEqual({ origin: 'https://tinylittleoffice.com' })
  })

  it('rejects non-TLO URLs server-side with 400 before touching the indexer', async () => {
    h.config.tlo_demo = 'true'
    const route = await load()
    const res = await route.actions.default(post('https://example.com/'))
    expect(res.status).toBe(400)
    expect(res.data.error).toMatch(/tinylittleoffice/)
  })
})
