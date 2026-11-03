import { describe, it, expect, vi } from 'vitest'

// #248: the /index route must report a deletion-trigger result explicitly,
// not as a successful index.
const handler = vi.fn()
vi.mock('$lib/profile.js', () => ({ getProfile: () => ({ identity: { instance: 'https://x.example/', name: 'x' } }) }))
vi.mock('$lib/sparql.js', () => ({ queryBoolean: vi.fn() }))
vi.mock('$lib/indexing.js', () => ({ handler: (...a) => handler(...a), submitBlobject: vi.fn(), parseRequestBody: vi.fn() }))

const { GET } = await import('../routes/(endpoints)/index/+server.js')
const call = (uri) => GET({ request: new Request(`http://localhost/index?uri=${encodeURIComponent(uri)}`) })

describe('/index deletion result', () => {
  it('returns 200 status:deleted for a soft deletion', async () => {
    handler.mockResolvedValueOnce({ deleted: true, mode: 'soft', reason: 'gone' })
    const res = await call('https://a.example/p')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ status: 'deleted', mode: 'soft', reason: 'gone' })
    expect(body.message).not.toMatch(/indexed successfully/)
  })
  it('still reports success for a normal index', async () => {
    handler.mockResolvedValueOnce(undefined)
    const body = await (await call('https://a.example/p')).json()
    expect(body.status).toBe('success')
  })
})
