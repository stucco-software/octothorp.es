import { describe, it, expect } from 'vitest'
import { buildQueries } from './queries.js'

const manifest = { origin: 'https://nimdaghlian.github.io', urls: [
  'https://nimdaghlian.github.io/devdemo/demo-webring',
  'https://nimdaghlian.github.io/devdemo/link-types',
] }

describe('buildQueries', () => {
  const qs = buildQueries(manifest)

  it('returns query descriptors with name + path', () => {
    expect(qs.length).toBeGreaterThan(10)
    for (const q of qs) {
      expect(typeof q.name).toBe('string')
      expect(q.name).not.toMatch(/[/\s]/) // filesystem-safe
      expect(q.path.startsWith('/get/')).toBe(true)
      expect(q.path).toContain('/debug')
    }
  })

  it('names are unique', () => {
    const names = qs.map((q) => q.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('includes a completeness query referencing the origin', () => {
    const completeness = qs.find((q) => q.name.startsWith('completeness'))
    expect(completeness).toBeTruthy()
  })

  it('matrix queries use the devdemo host as subject', () => {
    const m = qs.find((q) => q.name.startsWith('matrix'))
    expect(decodeURIComponent(m.path)).toContain('nimdaghlian.github.io')
  })

  it('contains no curated-* descriptors (matrix.js is the single source of truth)', () => {
    const curated = qs.filter((q) => q.name.startsWith('curated-'))
    expect(curated).toHaveLength(0)
  })
})
