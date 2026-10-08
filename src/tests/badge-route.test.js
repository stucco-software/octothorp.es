import { describe, it, expect, vi, beforeEach } from 'vitest'

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const bodyFor = (path) => {
  if (path.includes('_fail')) return 'fail'
  if (path.includes('_unregistered')) return 'unregistered'
  return 'success'
}
const okFetch = vi.fn(async (path) => new Response(bodyFor(String(path))))

vi.mock('$lib/profile.js', () => ({
  getProfile: () => ({
    identity: {
      instance: 'http://localhost:5173/',
      name: 'Test Server',
    },
    policies: {
      access: {
        badge: '/badge.png',
      },
    },
  }),
}))

vi.mock('octothorpes', async () => {
  const actual = await vi.importActual('octothorpes')
  return {
    ...actual,
    verifiedOrigin: vi.fn(),
  }
})

vi.mock('$lib/indexing.js', () => ({
  handler: vi.fn(),
}))

vi.mock('$lib/sparql.js', () => ({
  queryBoolean: vi.fn(),
}))

import { GET, _badgeFileName, _resetBadgeCache } from '../routes/badge/+server.js'
import { verifiedOrigin } from 'octothorpes'
import { handler } from '$lib/indexing.js'

const makeEvent = ({ uri = null, referer = null, harmonizer = null } = {}) => {
  const params = new URLSearchParams()
  if (uri) params.set('uri', uri)
  if (harmonizer) params.set('as', harmonizer)
  const url = new URL(`http://localhost:5173/badge?${params}`)
  const headers = new Headers()
  if (referer) headers.set('referer', referer)
  const request = new Request(url.toString(), { headers })
  return { request, url, fetch: okFetch }
}

const responseText = async (response) => {
  const buffer = await response.arrayBuffer()
  return Buffer.from(buffer).toString()
}

describe('Badge Route Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _resetBadgeCache()
    handler.mockResolvedValue(undefined)
  })

  describe('no valid URI', () => {
    it('should return fail badge when no uri param and no referer', async () => {
      const response = await GET(makeEvent())
      expect(await responseText(response)).toBe('fail')
    })

    it('should return fail badge when uri param is invalid and no referer', async () => {
      const response = await GET(makeEvent({ uri: 'not-a-url' }))
      expect(await responseText(response)).toBe('fail')
    })

    it('should not call verifiedOrigin when no valid URI', async () => {
      await GET(makeEvent())
      expect(verifiedOrigin).not.toHaveBeenCalled()
    })
  })

  describe('unverified origin', () => {
    it('should return unregistered badge when origin is not verified', async () => {
      verifiedOrigin.mockResolvedValue(false)
      const response = await GET(makeEvent({ uri: 'https://example.com/page' }))
      expect(await responseText(response)).toBe('unregistered')
    })

    it('should not call handler when origin is unverified', async () => {
      verifiedOrigin.mockResolvedValue(false)
      await GET(makeEvent({ uri: 'https://example.com/page' }))
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('verified origin', () => {
    it('should return success badge when origin is verified', async () => {
      verifiedOrigin.mockResolvedValue(true)
      const response = await GET(makeEvent({ uri: 'https://example.com/page' }))
      expect(await responseText(response)).toBe('success')
    })

    it('should call handler with the page URL for background indexing', async () => {
      verifiedOrigin.mockResolvedValue(true)
      await GET(makeEvent({ uri: 'https://example.com/page' }))
      expect(handler).toHaveBeenCalledWith(
        'https://example.com/page',
        'default',
        null,
        expect.objectContaining({ verifyOrigin: expect.any(Function) })
      )
    })

    it('should pass verifyOrigin that always returns true to bypass double-check', async () => {
      verifiedOrigin.mockResolvedValue(true)
      await GET(makeEvent({ uri: 'https://example.com/page' }))
      const config = handler.mock.calls[0][3]
      expect(await config.verifyOrigin()).toBe(true)
    })

    it('should forward ?as= harmonizer to handler', async () => {
      verifiedOrigin.mockResolvedValue(true)
      await GET(makeEvent({ uri: 'https://example.com/page', harmonizer: 'ghost' }))
      expect(handler).toHaveBeenCalledWith(
        'https://example.com/page',
        'ghost',
        null,
        expect.anything()
      )
    })

    it('should still return success badge even if handler throws', async () => {
      verifiedOrigin.mockResolvedValue(true)
      handler.mockRejectedValue(new Error('indexing failed'))
      const response = await GET(makeEvent({ uri: 'https://example.com/page' }))
      expect(await responseText(response)).toBe('success')
    })
  })

  describe('response headers', () => {
    it('should set Content-Type to image/png', async () => {
      verifiedOrigin.mockResolvedValue(true)
      const response = await GET(makeEvent({ uri: 'https://example.com/page' }))
      expect(response.headers.get('Content-Type')).toBe('image/png')
    })

    it('should set Access-Control-Allow-Origin to * (via hooks.server.js)', async () => {
      verifiedOrigin.mockResolvedValue(true)
      const { handle } = await import('../hooks.server.js')
      const event = makeEvent({ uri: 'https://example.com/page' })
      const response = await handle({ event, resolve: GET })
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(response.headers.get('Content-Type')).toBe('image/png')
    })
  })
})

describe('badge loading via event.fetch (Vercel bundle fix)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _resetBadgeCache()
    handler.mockResolvedValue(undefined)
  })

  it('route module does not import fs', () => {
    const src = readFileSync(fileURLToPath(new URL('../routes/badge/+server.js', import.meta.url)), 'utf8')
    expect(src).not.toMatch(/from ['"](node:)?fs['"]/)
    expect(src).not.toMatch(/readFileSync/)
  })

  it('fetches each variant by relative URL', async () => {
    verifiedOrigin.mockResolvedValue(false)
    await GET(makeEvent({ uri: 'https://example.com/page' }))
    expect(okFetch).toHaveBeenCalledWith('/badge_unregistered.png')
    await GET(makeEvent())
    expect(okFetch).toHaveBeenCalledWith('/badge_fail.png')
  })

  it('caches a variant after the first successful load', async () => {
    await GET(makeEvent())
    await GET(makeEvent())
    expect(okFetch).toHaveBeenCalledTimes(1)
  })

  it('returns a 404 (not a throw) when a variant fetch fails, and does not cache the failure', async () => {
    const badFetch = vi.fn(async () => new Response('nope', { status: 404 }))
    const response = await GET({ ...makeEvent(), fetch: badFetch })
    expect(response.status).toBe(404)
    const again = await GET(makeEvent())
    expect(await responseText(again)).toBe('fail')
  })

  it('returns a 502 when fetch rejects', async () => {
    const throwing = vi.fn(async () => { throw new Error('network') })
    const response = await GET({ ...makeEvent(), fetch: throwing })
    expect(response.status).toBe(502)
  })

  it('a missing variant does not break the others', async () => {
    verifiedOrigin.mockResolvedValue(true)
    const partial = vi.fn(async (p) => p.includes('_fail') ? new Response('x', { status: 404 }) : new Response(bodyFor(p)))
    expect((await GET({ ...makeEvent(), fetch: partial })).status).toBe(404)
    const ok = await GET({ ...makeEvent({ uri: 'https://example.com/page' }), fetch: partial })
    expect(await responseText(ok)).toBe('success')
  })
})

describe('#217 badge route reads the profile', () => {
  it('takes the basename of a profile badge path', () => {
    expect(_badgeFileName('/badge.png')).toBe('badge.png')
    expect(_badgeFileName('/img/custom-badge.png')).toBe('custom-badge.png')
  })

  it('accepts an absolute URL and still yields a static filename', () => {
    expect(_badgeFileName('https://example.test/badge.png')).toBe('badge.png')
  })

  it('falls back to badge.png when the policy is unset', () => {
    expect(_badgeFileName(null)).toBe('badge.png')
    expect(_badgeFileName('')).toBe('badge.png')
  })
})
