import { describe, it, expect } from 'vitest'
import { resolveIndexPolicy, checkIndexingPolicy } from '../../packages/core/indexer.js'

// Robots directives now resolve inside resolveIndexPolicy (replacing the old
// packages/core/robots.js module). They bind CRAWLER-initiated requests only:
// policyMode 'active' without a policyCheck. Owner-initiated requests ignore
// them, because a robots meta addresses search engines, not a relay the site
// itself asked to index the page.
const crawler = { policyMode: 'active' }

describe('resolveIndexPolicy: robots refusal (crawler-initiated)', () => {
  it('refuses noindex', () => {
    const r = resolveIndexPolicy({ blobject: { robots: ['noindex'] }, callerContext: crawler })
    expect(r.refused).toBe('robots noindex')
    expect(r.optedIn).toBe(false)
  })

  it('refuses nofollow', () => {
    expect(resolveIndexPolicy({ blobject: { robots: ['nofollow'] }, callerContext: crawler }).refused)
      .toBe('robots nofollow')
  })

  it('refuses none, case-insensitively', () => {
    expect(resolveIndexPolicy({ blobject: { robots: ['NONE'] }, callerContext: crawler }).refused)
      .toBe('robots none')
  })

  it('does not refuse index, follow', () => {
    const r = resolveIndexPolicy({ blobject: { robots: ['index, follow'] }, callerContext: crawler })
    expect(r.refused).toBe(null)
    expect(r.optedIn).toBe(true)
  })

  it('reports the first refusing token in document order', () => {
    expect(resolveIndexPolicy({ blobject: { robots: ['noindex,nofollow'] }, callerContext: crawler }).refused)
      .toBe('robots noindex')
  })

  it('reports the first refusing meta when the directives are split across two metas', () => {
    expect(resolveIndexPolicy({ blobject: { robots: ['follow', 'noindex'] }, callerContext: crawler }).refused)
      .toBe('robots noindex')
  })

  it('matches whole tokens only', () => {
    expect(resolveIndexPolicy({ blobject: { robots: ['noindexing', 'unnoindex'] }, callerContext: crawler }).refused)
      .toBe(null)
  })

  it('tolerates a missing robots field', () => {
    const r = resolveIndexPolicy({ blobject: { indexPolicy: 'index' }, callerContext: crawler })
    expect(r.refused).toBe(null)
    expect(r.optedIn).toBe(true)
  })

  it('tolerates a blobject-less call', () => {
    expect(resolveIndexPolicy({ callerContext: crawler }).refused).toBe(null)
    expect(resolveIndexPolicy().refused).toBe(null)
  })
})

describe('resolveIndexPolicy: owner-initiated requests ignore robots', () => {
  const blobject = { robots: ['noindex, nofollow'], indexPolicy: 'index' }

  it('no caller context at all', () => {
    const r = resolveIndexPolicy({ blobject })
    expect(r.refused).toBe(null)
    expect(r.optedIn).toBe(true)
  })

  it("policyMode 'request'", () => {
    const r = resolveIndexPolicy({ blobject, callerContext: { policyMode: 'request' } })
    expect(r.refused).toBe(null)
    expect(r.optedIn).toBe(true)
  })

  it("policyMode 'active' WITH a policyCheck (an owner asking under active mode)", () => {
    const r = resolveIndexPolicy({ blobject, callerContext: { policyMode: 'active', policyCheck: true } })
    expect(r.refused).toBe(null)
    expect(r.optedIn).toBe(true)
  })

  it('still requires opt-in: no markers means not opted in', () => {
    const r = resolveIndexPolicy({ blobject: { robots: ['noindex'] }, callerContext: { policyMode: 'request' } })
    expect(r.refused).toBe(null)
    expect(r.optedIn).toBe(false)
  })

  it('implicit opt-in via octothorpes still works with robots present', () => {
    const r = resolveIndexPolicy({
      blobject: { robots: ['noindex, nofollow'], octothorpes: ['cats'] },
      callerContext: { policyMode: 'request' },
    })
    expect(r.optedIn).toBe(true)
  })
})

describe("resolveIndexPolicy: octo-policy 'no-index'", () => {
  it('is not opted in, crawler-initiated', () => {
    // Crawler-initiated grants opt-in by caller context, so no-index is moot
    // there; what must not happen is a refusal.
    expect(resolveIndexPolicy({ blobject: { indexPolicy: 'no-index' }, callerContext: crawler }).refused).toBe(null)
  })

  it('is not opted in, owner-initiated', () => {
    const r = resolveIndexPolicy({ blobject: { indexPolicy: 'no-index' }, callerContext: { policyMode: 'request' } })
    expect(r.optedIn).toBe(false)
    expect(r.refused).toBe(null)
  })
})

describe('resolveIndexPolicy: harmonizer passthrough', () => {
  it('returns a page-declared harmonizer', () => {
    expect(resolveIndexPolicy({ blobject: { indexPolicy: 'index', indexHarmonizer: 'openGraph' } }).harmonizer)
      .toBe('openGraph')
  })

  it('checkIndexingPolicy never refuses', () => {
    const r = checkIndexingPolicy({ robots: ['noindex, nofollow'], indexPolicy: 'index' }, 'http://localhost:5173/')
    expect(r.refused).toBe(null)
    expect(r.optedIn).toBe(true)
  })
})
