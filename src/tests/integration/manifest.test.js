import { describe, it, expect } from 'vitest'
import { loadManifest } from './manifest.js'

describe('loadManifest', () => {
  const m = loadManifest()

  it('derives the devdemo origin', () => {
    expect(m.origin).toBe('https://nimdaghlian.github.io')
  })
  it('returns only devdemo http(s) urls', () => {
    expect(m.urls.length).toBeGreaterThan(5)
    for (const u of m.urls) {
      expect(new URL(u).origin).toBe('https://nimdaghlian.github.io')
    }
  })
  it('dedupes urls', () => {
    expect(new Set(m.urls).size).toBe(m.urls.length)
  })
  it('is sorted for stable output', () => {
    const sorted = [...m.urls].sort()
    expect(m.urls).toEqual(sorted)
  })
})
