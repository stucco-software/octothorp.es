import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('fs', () => ({
  readFileSync: vi.fn((path) => {
    if (path.includes('_fail')) return Buffer.from('fail')
    if (path.includes('_unregistered')) return Buffer.from('unregistered')
    return Buffer.from('success')
  })
}))

vi.mock('$env/static/private', () => ({
  instance: 'http://localhost:5173/',
  badge_image: 'badge.png',
  server_name: 'Test Server',
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

import { GET } from '../routes/badge/+server.js'
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
  return { request, url }
}

const responseText = async (response) => {
  const buffer = await response.arrayBuffer()
  return Buffer.from(buffer).toString()
}

describe('Badge Route Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

    it('should set Access-Control-Allow-Origin to *', async () => {
      verifiedOrigin.mockResolvedValue(true)
      const response = await GET(makeEvent({ uri: 'https://example.com/page' }))
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })
  })
})
