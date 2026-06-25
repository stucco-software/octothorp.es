import { describe, it, expect } from 'vitest'
import { normalize } from './normalize.js'

describe('normalize', () => {
  const opts = { instanceOrigin: 'http://localhost:5173' }

  it('drops volatile created-derived date fields entirely', () => {
    expect(normalize({ uri: 'x', date: 1782416538774, created: 1, indexed: 2 }, opts)).toEqual({ uri: 'x' })
  })
  it('keeps postDate untouched (the source-controlled date we rely on)', () => {
    expect(normalize({ uri: 'x', date: 999, postDate: 12345 }, opts)).toEqual({ uri: 'x', postDate: 12345 })
  })
  it('keeps a null postDate as null', () => {
    expect(normalize({ postDate: null }, opts)).toEqual({ postDate: null })
  })
  it('replaces the instance origin in string values', () => {
    expect(normalize({ uri: 'http://localhost:5173/~/demo' }, opts)).toEqual({ uri: '{INSTANCE}/~/demo' })
  })
  it('does NOT rewrite non-instance subject urls', () => {
    expect(normalize({ uri: 'https://nimdaghlian.github.io/devdemo/x' }, opts).uri)
      .toBe('https://nimdaghlian.github.io/devdemo/x')
  })
  it('sorts arrays of records by uri/@id', () => {
    const out = normalize([{ uri: 'b' }, { uri: 'a' }], opts)
    expect(out.map(r => r.uri)).toEqual(['a', 'b'])
  })
  it('sorts nested string arrays (e.g. octothorpes)', () => {
    const out = normalize([{ uri: 'a', octothorpes: ['z', 'a'] }], opts)
    expect(out[0].octothorpes).toEqual(['a', 'z'])
  })
  it('is a deep copy (does not mutate input)', () => {
    const input = { postDate: 1 }
    normalize(input, opts)
    expect(input.postDate).toBe(1)
  })
})
