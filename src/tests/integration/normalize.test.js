import { describe, it, expect } from 'vitest'
import { normalize } from './normalize.js'

describe('normalize', () => {
  const opts = { instanceOrigin: 'http://localhost:5173' }

  it('blanks volatile date fields but keeps the key', () => {
    expect(normalize({ uri: 'x', date: 1782416538774 }, opts)).toEqual({ uri: 'x', date: '<DATE>' })
  })
  it('keeps postDate untouched', () => {
    expect(normalize({ postDate: 12345 }, opts)).toEqual({ postDate: 12345 })
  })
  it('leaves a null date as null', () => {
    expect(normalize({ date: null }, opts)).toEqual({ date: null })
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
    const input = { date: 1 }
    normalize(input, opts)
    expect(input.date).toBe(1)
  })
})
