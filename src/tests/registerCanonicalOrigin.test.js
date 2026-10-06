import { describe, it, expect, vi, beforeEach } from 'vitest'

// #275 at the /register seam: the submitted domain is stored in one canonical
// spelling, and the ban / verified lookups match any spelling of the same site.

const access = { registration: 'registered', blocks: { domains: [], terms: [] }, whitelist: { domains: [] } }
vi.mock('$lib/profile.js', () => ({
  getProfile: () => ({
    identity: { instance: 'https://example.test/', name: 'Example', contact: { email: 'admin@example.test' } },
    policies: { indexing: { mode: 'request' }, access },
  }),
}))

// The store: origins carrying octo:banned / octo:verified. An ASK matches when
// any origin it names carries the predicate it asks about.
const store = { banned: [], verified: [] }
const queryBoolean = vi.fn(async (q) => {
  const asked = [...q.matchAll(/<(https?:\/\/[^>]*)>/g)].map((m) => m[1])
  const list = q.includes('octo:banned') ? store.banned
    : q.includes('octo:verified') ? store.verified
    : []
  return asked.some((uri) => list.includes(uri))
})
vi.mock('$lib/sparql.js', () => ({
  queryBoolean: (q) => queryBoolean(q),
  queryArray: async () => ({ results: { bindings: [] } }),
  insert: async () => {},
}))
vi.mock('$lib/mail/send.js', () => ({ send: async () => true }))

const { actions } = await import('../routes/register/+page.server.js')

const submit = async (domain) => {
  try {
    return await actions.default({
      request: { formData: async () => new Map([['email', 'a@b.test'], ['domain', domain]]) },
    })
  } catch (e) {
    // SvelteKit's redirect() throws; surface it as the action's outcome.
    if (e?.status && e?.location) return { redirect: e.location, status: e.status }
    throw e
  }
}

describe('/register canonicalizes and matches origin variants', () => {
  beforeEach(() => {
    store.banned = []
    store.verified = []
    access.blocks.domains.length = 0
    queryBoolean.mockClear()
    globalThis.fetch = vi.fn().mockResolvedValue({ status: 200 })
  })

  it('a new www submission proceeds under the canonical spelling', async () => {
    const res = await submit('https://www.newsite.test/')
    expect(res.redirect).toBe('/register/verify?d=https://newsite.test&e=a@b.test')
  })

  it('a ban on www.foo.com covers a foo.com submission', async () => {
    store.banned = ['https://www.banned.test']
    const res = await submit('https://banned.test')
    expect(res.status).toBe(403)
    expect(res.data.banned).toBe(true)
  })

  it('a ban on foo.com covers a www.foo.com/ submission', async () => {
    store.banned = ['https://banned.test']
    const res = await submit('https://www.banned.test/')
    expect(res.data.banned).toBe(true)
  })

  it('an already-verified domain is recognized whatever the stored spelling', async () => {
    // Stored with no trailing slash, the way the indexer writes it -- the old
    // `<domain/>` lookup missed this.
    store.verified = ['https://verified.test']
    const res = await submit('https://verified.test/')
    expect(res.redirect).toBe('/domains#https://verified.test')
  })

  it('a legacy www/trailing-slash verified row is recognized from the bare spelling', async () => {
    store.verified = ['https://www.legacy.test/']
    const res = await submit('https://legacy.test')
    expect(res.redirect).toBe('/domains#https://legacy.test')
  })

  it('a configured block on www.foo.com covers foo.com', async () => {
    access.blocks.domains.push('www.spam.test')
    expect((await submit('https://spam.test/')).data.blocked).toBe(true)
  })

  it('a submission with no scheme is rejected rather than stored verbatim', async () => {
    expect((await submit('foo.test')).data.blocked).toBe(true)
  })

  it('the reachability check fetches the spelling that was submitted', async () => {
    // A site served only at www must not fail reachability because the bare
    // apex does not resolve.
    await submit('https://www.reach.test/')
    expect(globalThis.fetch.mock.calls[0][0]).toBe('https://www.reach.test')
  })
})
