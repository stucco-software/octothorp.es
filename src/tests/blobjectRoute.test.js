import { describe, it, expect, vi, beforeEach } from 'vitest'

// Route-level tests for POST /index with mode:'blobject' (no-auth tier, B6).
// The adapter is mocked; the gate's own behaviour is covered by
// blobjectSubmission.test.js. Here: body dispatch + error->status mapping.

const submitBlobject = vi.fn()
const handler = vi.fn(async () => {})
vi.mock('$lib/profile.js', () => ({ getProfile: () => ({ identity: { name: 'Test', instance: 'http://localhost:5173/' } }) }))
vi.mock('$lib/sparql.js', () => ({ queryBoolean: async () => false }))
vi.mock('$lib/indexing.js', () => ({
  handler: (...a) => handler(...a),
  submitBlobject: (...a) => submitBlobject(...a),
  parseRequestBody: async (req) => req.json(),
}))

const { POST, GET } = await import('../routes/(endpoints)/index/+server.js')

const body = { uri: 'at://x/y', blobject: { '@id': 'at://x/y' }, anchor: 'example.com', token: 't', mode: 'blobject' }
const post = (b, headers = {}) => POST({
  request: new Request('http://localhost:5173/index', {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(b),
  }),
})
const statusOf = async (p) => { try { return (await p).status } catch (e) { return e.status } }

beforeEach(() => { submitBlobject.mockReset(); handler.mockClear(); vi.spyOn(console, 'error').mockImplementation(() => {}) })

describe('POST /index mode:blobject', () => {
  it('200 {ok, uri} on success, passing anchor+token, no Origin header needed', async () => {
    submitBlobject.mockResolvedValue(undefined)
    const res = await post(body)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, uri: 'at://x/y' })
    expect(submitBlobject).toHaveBeenCalledWith(body.blobject, { anchor: 'example.com', token: 't' })
    expect(handler).not.toHaveBeenCalled()
  })

  it.each([
    ['This server does not accept blobject submissions (policies.access.submissions).', 403],
    ['Anchor is not registered on this server (submissions: "registered").', 403],
    ['Anchor is blocked or banned on this server.', 403],
    ['Anchor auth failed: token-mismatch', 403],
    ['Blobject submission needs a valid anchor host.', 400],
    ['Blobject submission needs an @id subject.', 400],
    ['Submission subject rejected: nope', 400],
    ['Submission rejected: invalid URI "x"', 400],
    ['Rate limit exceeded. Please try again later.', 429],
    ['boom', 500],
  ])('%s -> %i', async (msg, status) => {
    submitBlobject.mockRejectedValue(new Error(msg))
    expect(await statusOf(post(body))).toBe(status)
  })
})

describe('non-blobject requests unchanged', () => {
  it('POST without mode still requires Origin/Referer', async () => {
    expect(await statusOf(post({ uri: 'https://a.com/' }))).toBe(400)
    expect(submitBlobject).not.toHaveBeenCalled()
  })
  it('POST without mode runs the normal handler', async () => {
    const res = await post({ uri: 'https://a.com/' }, { origin: 'https://a.com' })
    expect(res.status).toBe(200)
    expect(handler).toHaveBeenCalled()
    expect(submitBlobject).not.toHaveBeenCalled()
  })
  it('GET runs the normal handler', async () => {
    const res = await GET({ request: new Request('http://localhost:5173/index?uri=https://a.com/') })
    expect(res.status).toBe(200)
    expect(submitBlobject).not.toHaveBeenCalled()
  })
})
