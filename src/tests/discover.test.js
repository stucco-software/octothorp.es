import { describe, it, expect, vi } from 'vitest'

// We'll test the exported helper functions from the discover module
// For now, test the param parsing logic that the endpoint will use
import { parseDateStrings } from 'octothorpes'

describe('/discover param parsing', () => {
  it('should parse limit with default of 50', () => {
    const url = new URL('http://localhost/discover')
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200)
    expect(limit).toBe(50)
  })

  it('should cap limit at 200', () => {
    const url = new URL('http://localhost/discover?limit=999')
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200)
    expect(limit).toBe(200)
  })

  it('should default offset to 0', () => {
    const url = new URL('http://localhost/discover')
    const offset = parseInt(url.searchParams.get('offset') || '0')
    expect(offset).toBe(0)
  })

  it('should parse when=recent into a date range', () => {
    const range = parseDateStrings('recent')
    expect(range).toHaveProperty('after')
    expect(range.after).toBeGreaterThan(0)
    expect(range.after).toBeLessThan(Date.now())
  })

  it('should return empty object for no date filter', () => {
    const range = parseDateStrings('')
    expect(range).toEqual({})
  })
})
