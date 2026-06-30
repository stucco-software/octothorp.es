import { describe, it, expect } from 'vitest'
import { buildQueries } from './queries.js'

const manifest = { origin: 'https://nimdaghlian.github.io', urls: [
  'https://nimdaghlian.github.io/devdemo/demo-webring',
  'https://nimdaghlian.github.io/devdemo/link-types',
] }

describe('buildQueries smoke tier (default)', () => {
  const qs = buildQueries(manifest)

  it('returns one query per what/by combo plus completeness', () => {
    // 19 combos (whats×bys minus domains-only-posted restriction) + 1 completeness
    expect(qs.length).toBeGreaterThan(10)
    expect(qs.length).toBeLessThan(30)
  })

  it('smoke queries have no extras in their names (no -recent, -1000, etc.)', () => {
    const matrixQs = qs.filter((q) => q.name.startsWith('matrix-'))
    for (const q of matrixQs) {
      expect(q.name).not.toMatch(/-(recent|before|after|all|1000|demo)$/)
    }
  })

  it('returns query descriptors with name + path', () => {
    for (const q of qs) {
      expect(typeof q.name).toBe('string')
      expect(q.name).not.toMatch(/[/\s]/) // filesystem-safe
      expect(q.path.startsWith('/get/')).toBe(true)
    }
  })

  it('matrix queries use /debug format; rss queries use /rss format', () => {
    for (const q of qs) {
      if (q.name.startsWith('matrix-') || q.name.startsWith('linkterms-') || q.name.startsWith('completeness-')) {
        expect(q.path).toContain('/debug')
      } else if (q.name.startsWith('rss-')) {
        expect(q.path).toContain('/rss')
        expect(q.format).toBe('xml')
      }
    }
  })

  it('names are unique', () => {
    const names = qs.map((q) => q.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('includes a completeness query', () => {
    expect(qs.find((q) => q.name.startsWith('completeness'))).toBeTruthy()
  })

  it('matrix queries use the devdemo host as subject', () => {
    const m = qs.find((q) => q.name.startsWith('matrix'))
    expect(decodeURIComponent(m.path)).toContain('nimdaghlian.github.io')
  })
})

describe('buildQueries full tier', () => {
  const qs = buildQueries(manifest, { tier: 'full' })

  it('returns substantially more queries than smoke', () => {
    const smoke = buildQueries(manifest)
    expect(qs.length).toBeGreaterThan(smoke.length * 3)
  })

  it('includes extras variations (date filters, limit, rt)', () => {
    const names = qs.map((q) => q.name)
    expect(names.some((n) => n.endsWith('-recent'))).toBe(true)
    expect(names.some((n) => n.endsWith('-1000'))).toBe(true)
    expect(names.some((n) => n.endsWith('-demo'))).toBe(true)
  })

  it('names are unique', () => {
    const names = qs.map((q) => q.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('contains no curated-* descriptors (matrix.js is the single source of truth)', () => {
    expect(qs.filter((q) => q.name.startsWith('curated-'))).toHaveLength(0)
  })
})
