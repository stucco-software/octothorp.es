import { describe, it, expect, vi } from 'vitest'
import { tloDemoEnabled, indexTloLink } from '../lib/tloDemo.js'

const uri = `https://tinylittleoffice.com/write/#doc=${encodeURIComponent('# Hi {.title}\n\nBody #demo')}`

const deps = (over = {}) => ({
  isApproved: vi.fn(async () => true),
  isBanned: vi.fn(async () => false),
  checkRateLimit: vi.fn(() => true),
  recentlyIndexed: vi.fn(async () => false),
  recordIndexing: vi.fn(async () => {}),
  ingestBlobject: vi.fn(async () => {}),
  ...over,
})

describe('tloDemoEnabled (flag gating)', () => {
  it('is off when unset, empty, or falsey', () => {
    for (const v of [undefined, '', 'false', '0', 'no', 'off']) expect(tloDemoEnabled(v)).toBe(false)
  })
  it('is on for true/1/yes/on', () => {
    for (const v of ['true', '1', 'yes', 'on', 'TRUE']) expect(tloDemoEnabled(v)).toBe(true)
  })
})

describe('indexTloLink', () => {
  it('refuses everything when the flag is off', async () => {
    const d = deps()
    await expect(indexTloLink(uri, { enabled: false, ...d })).rejects.toThrow(/not enabled/)
    expect(d.ingestBlobject).not.toHaveBeenCalled()
  })

  it('rejects non-TLO URLs', async () => {
    await expect(indexTloLink('https://example.com/', { enabled: true, ...deps() }))
      .rejects.toThrow(/tinylittleoffice/)
  })

  it('refuses when tinylittleoffice.com is not an approved origin', async () => {
    const d = deps({ isApproved: vi.fn(async () => false) })
    await expect(indexTloLink(uri, { enabled: true, ...d })).rejects.toThrow(/not an approved origin/)
    expect(d.isApproved).toHaveBeenCalledWith('https://tinylittleoffice.com')
    expect(d.ingestBlobject).not.toHaveBeenCalled()
  })

  it('refuses when banned or rate-limited', async () => {
    await expect(indexTloLink(uri, { enabled: true, ...deps({ isBanned: vi.fn(async () => true) }) }))
      .rejects.toThrow(/banned/)
    await expect(indexTloLink(uri, { enabled: true, ...deps({ checkRateLimit: () => false }) }))
      .rejects.toThrow(/Rate limit/)
  })

  it('harmonizes without fetching and ingests the blobject under the full link', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const d = deps()
    const b = await indexTloLink(uri, { enabled: true, ...d })
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
    expect(b['@id']).toBe(uri)
    expect(d.recordIndexing).toHaveBeenCalledWith(uri)
    expect(d.ingestBlobject).toHaveBeenCalledWith(b)
    expect(b.title).toBe('Hi')
    expect(b.octothorpes).toEqual(['demo'])
  })
})
