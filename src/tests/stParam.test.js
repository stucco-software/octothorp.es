import { describe, it, expect } from 'vitest'
import { buildMultiPass, QueryError, GET_PARAMS } from 'octothorpes'

// #200: ?st= names a relationship subtype directly, so harmonizer-defined
// link types (octo:Sameas, octo:Reply, ...) are queryable without a declared
// [by] alias. st applies only to GENERIC link [by] values (no subtype of
// their own); a conflicting [by] alias is rejected, per the #266/#313
// explicit-rejection convention.

const instance = 'https://x.test/'
const s = 'https://x.test/page'

const grab = (fn) => {
  try {
    fn()
  } catch (e) {
    return e
  }
  throw new Error('expected a throw')
}

describe('?st= subtype param (#200)', () => {
  it('sets filters.subtype on a generic link by', () => {
    const mp = buildMultiPass('pages', 'linked', { s, st: 'Sameas' }, instance)
    expect(mp.filters.subtype).toBe('Sameas')
  })

  it('normalizes case the way the write path does (resolveSubtype capitalizes)', () => {
    const mp = buildMultiPass('pages', 'linked', { s, st: 'sameas' }, instance)
    expect(mp.filters.subtype).toBe('Sameas')
  })

  it('leaves subtype alone when st is absent', () => {
    expect(buildMultiPass('pages', 'linked', { s }, instance).filters.subtype).toBe('')
    expect(buildMultiPass('pages', 'cited', { s }, instance).filters.subtype).toBe('Cite')
  })

  it('allows a redundant st that matches the by alias subtype', () => {
    const mp = buildMultiPass('pages', 'cited', { s, st: 'Cite' }, instance)
    expect(mp.filters.subtype).toBe('Cite')
  })

  it('rejects st conflicting with a typed by alias', () => {
    const e = grab(() => buildMultiPass('pages', 'cited', { s, st: 'Sameas' }, instance))
    expect(e).toBeInstanceOf(QueryError)
    expect(e.status).toBe(400)
    expect(e.message).toBe('st=Sameas conflicts with by=cited, which already fixes the subtype to Cite. Use a generic link by (linked) with st, or drop st.')
  })

  it('rejects st on term queries', () => {
    const e = grab(() => buildMultiPass('pages', 'thorped', { s, st: 'Sameas' }, instance))
    expect(e).toBeInstanceOf(QueryError)
    expect(e.message).toBe('st does not apply to by=thorped: subtypes only exist on link relationships. Use a link by such as linked.')
  })

  it('rejects st on posted and webring queries', () => {
    expect(grab(() => buildMultiPass('pages', 'posted', { s, st: 'Sameas' }, instance))).toBeInstanceOf(QueryError)
    expect(grab(() => buildMultiPass('pages', 'in-webring', { s, st: 'Sameas' }, instance))).toBeInstanceOf(QueryError)
  })

  it('rejects an st that is not a bare local name', () => {
    for (const bad of ['octo:Sameas', 'Same as', 'Same-as', '1Sameas', '']) {
      const e = grab(() => buildMultiPass('pages', 'linked', { s, st: bad }, instance))
      expect(e).toBeInstanceOf(QueryError)
      expect(e.message).toContain('is not a valid subtype name')
    }
  })

  it('st is advertised in GET_PARAMS', () => {
    expect(GET_PARAMS).toContain('st')
  })
})
