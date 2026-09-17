import { describe, it, expect, vi, beforeEach } from 'vitest'
import { _registrationFormState } from '../routes/register/+page.server.js'

// #217 wave 4a: /register no longer owns a policy. Its state DERIVES from
// policies.access.registration — the indexing gate enforced in core (Task 14) —
// so the form can never contradict the gate it advertises.

const access = { registration: 'registered', blocks: { domains: [], terms: [] }, whitelist: { domains: [] } }
vi.mock('$lib/profile.js', () => ({
  getProfile: () => ({
    identity: { instance: 'https://example.test/', name: 'Example' },
    policies: { indexing: { mode: 'request' }, access },
  }),
}))
vi.mock('$lib/sparql.js', () => ({
  queryBoolean: async () => false, queryArray: async () => ({ results: { bindings: [] } }), insert: async () => {},
}))
vi.mock('$lib/mail/send.js', () => ({ send: async () => true }))

const { load, actions } = await import('../routes/register/+page.server.js')

const submit = (domain = 'https://ok.test/') => actions.default({
  request: { formData: async () => new Map([['email', 'a@b.test'], ['domain', domain]]) },
})

describe('_registrationFormState', () => {
  it('registered: the form is active — registering is how you pass the gate', () => {
    expect(_registrationFormState('registered')).toBe('active')
  })

  it('open: the form is hidden — there is no gate to pass', () => {
    expect(_registrationFormState('open')).toBe('hidden')
  })

  it('closed: the form is disabled — membership is admin-managed', () => {
    expect(_registrationFormState('closed')).toBe('disabled')
  })

  it('defaults to active for an absent gate value', () => {
    expect(_registrationFormState(undefined)).toBe('active')
  })
})

describe('/register load() derives its state from the gate', () => {
  beforeEach(() => {
    access.registration = 'registered'
    access.blocks.domains.length = 0
    access.whitelist.domains.length = 0
  })

  it('surfaces both the gate and the derived form state', async () => {
    access.registration = 'closed'
    const data = await load({})
    expect(data.registration).toBe('closed')
    expect(data.formState).toBe('disabled')
  })

  it('does not invent a form-only policy field', async () => {
    const data = await load({})
    expect(data.registrationPolicy).toBeUndefined()
  })
})

describe('/register submissions follow the derived state', () => {
  beforeEach(() => {
    access.registration = 'registered'
    access.blocks.domains.length = 0
    access.whitelist.domains.length = 0
  })

  it('registered: the submission proceeds past the gate check', async () => {
    const res = await submit()
    expect(res?.data?.formUnavailable).toBeUndefined()
  })

  it('open: the action refuses, because the form should not have been shown', async () => {
    access.registration = 'open'
    const res = await submit()
    expect(res.status).toBe(403)
    expect(res.data.formUnavailable).toBe(true)
    expect(res.data.registration).toBe('open')
  })

  it('closed: the action refuses — the whitelist is admin-managed', async () => {
    access.registration = 'closed'
    const res = await submit()
    expect(res.status).toBe(403)
    expect(res.data.registration).toBe('closed')
  })

  it('the derived-state check runs before any network reachability check', async () => {
    access.registration = 'closed'
    const spy = vi.spyOn(globalThis, 'fetch')
    await submit('https://never-fetched.test/')
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('a malformed domain is still rejected under the registered gate', async () => {
    expect((await submit('not a url')).data.blocked).toBe(true)
  })

  it('reuses the core origin matchers rather than a local blocklist', async () => {
    // BLOCKED_HOSTS is gone; example.com moved into policies.access.blocks.domains.
    access.blocks.domains.push('spam.test')
    expect((await submit('https://sub.spam.test/')).data.blocked).toBe(true)
    expect((await submit('https://fine.test/')).data?.blocked).toBeUndefined()
  })
})
