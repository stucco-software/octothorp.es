import { describe, it, expect } from 'vitest'
import { buildMultiPass, capLimit, LIMIT_CAP, QueryError } from 'octothorpes'

const instance = 'https://test.example.com/'

describe('capLimit helper', () => {
  it('passes limits at or under the cap through as numbers', () => {
    expect(capLimit('400')).toBe('400')
    expect(capLimit('1')).toBe('1')
    expect(capLimit(undefined)).toBe('100') // default page size
  })

  it('exports the cap value for reuse (#266)', () => {
    expect(LIMIT_CAP).toBe(400)
  })

  it('rejects limits over the cap, naming the cap', () => {
    expect(() => capLimit('401')).toThrow(QueryError)
    try { capLimit('5000') } catch (e) {
      expect(e.message).toContain('400')
      expect(e.status).toBe(400)
    }
  })

  it('rejects no-limit and 0, naming the cap', () => {
    for (const v of ['no-limit', '0', 0]) {
      try {
        capLimit(v)
        throw new Error('expected a throw')
      } catch (e) {
        expect(e).toBeInstanceOf(QueryError)
        expect(e.message).toContain('400')
      }
    }
  })

  it('accepts a custom cap', () => {
    expect(capLimit('500', 1000)).toBe('500')
    expect(() => capLimit('1001', 1000)).toThrow(/1000/)
  })
})

describe('buildMultiPass limit cap on subject/object-less shapes', () => {
  it('clamps happen only when both s and o are absent: no-limit throws', () => {
    expect(() => buildMultiPass('everything', 'posted', { limit: 'no-limit' }, instance))
      .toThrow(QueryError)
  })

  it('limit over the cap throws on a subject/object-less shape', () => {
    expect(() => buildMultiPass('everything', 'linked', { limit: '9999' }, instance))
      .toThrow(/400/)
  })

  it('limit=0 throws on a subject/object-less shape', () => {
    expect(() => buildMultiPass('everything', 'posted', { limit: '0' }, instance))
      .toThrow(/400/)
  })

  it('a bounded limit under the cap passes on a subject/object-less shape', () => {
    const mp = buildMultiPass('everything', 'posted', { limit: '400' }, instance)
    expect(mp.filters.limitResults).toBe('400')
  })

  it('the default limit still applies untouched', () => {
    const mp = buildMultiPass('everything', 'posted', {}, instance)
    expect(mp.filters.limitResults).toBe('100')
  })

  it('no-limit keeps working when a subject bounds the query', () => {
    const mp = buildMultiPass('everything', 'posted', { s: `${instance}p`, limit: 'no-limit' }, instance)
    expect(mp.filters.limitResults).toBe('no-limit')
  })

  it('no-limit keeps working when an object bounds the query', () => {
    const mp = buildMultiPass('pages', 'thorped', { o: 'demo', limit: 'no-limit' }, instance)
    expect(mp.filters.limitResults).toBe('no-limit')
  })

  it('large limits keep working when a subject bounds the query', () => {
    const mp = buildMultiPass('everything', 'posted', { s: `${instance}p`, limit: '9999' }, instance)
    expect(mp.filters.limitResults).toBe('9999')
  })
})
