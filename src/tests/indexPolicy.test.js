import { describe, it, expect } from 'vitest'
import { resolveIndexPolicy, checkIndexingPolicy } from '../../packages/core/indexer.js'

// Robots directives resolve inside resolveIndexPolicy, which is the only place
// they are read. They bind CRAWLER-initiated requests only:
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

  it('refuses noindex and nofollow together, reporting the first token', () => {
    const r = resolveIndexPolicy({ blobject: { robots: ['noindex, nofollow'] }, callerContext: crawler })
    expect(r.refused).toBe('robots noindex')
    expect(r.optedIn).toBe(false)
  })

  it('is case-insensitive across a whole directive list', () => {
    expect(resolveIndexPolicy({ blobject: { robots: ['NOINDEX,NOFOLLOW'] }, callerContext: crawler }).refused)
      .toBe('robots noindex')
  })

  it('refuses when a later meta of several carries the directive', () => {
    expect(resolveIndexPolicy({
      blobject: { robots: ['index', 'follow', 'nofollow'] },
      callerContext: crawler,
    }).refused).toBe('robots nofollow')
  })

  it('tolerates a meta with no content attribute (empty string)', () => {
    // The harmonizer yields '' for `<meta name="robots">`; no tokens, no refusal.
    expect(resolveIndexPolicy({ blobject: { robots: [''] }, callerContext: crawler }).refused).toBe(null)
  })

  it('accepts a bare string as well as an array', () => {
    expect(resolveIndexPolicy({ blobject: { robots: 'noindex' }, callerContext: crawler }).refused)
      .toBe('robots noindex')
  })

  it('ignores non-string entries', () => {
    expect(resolveIndexPolicy({ blobject: { robots: [null, 42, {}] }, callerContext: crawler }).refused).toBe(null)
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
  it('takes second place to a robots refusal on the crawler path', () => {
    // Robots win the ordering: the refusal is reported, not the bare opt-out.
    const r = resolveIndexPolicy({
      blobject: { indexPolicy: 'no-index', robots: ['noindex'] },
      callerContext: crawler,
    })
    expect(r.refused).toBe('robots noindex')
    expect(r.optedIn).toBe(false)
  })

  it('is not opted in, crawler-initiated', () => {
    // A crawler indexes without opt-in, but no-index is an explicit opt-OUT,
    // so it binds. Not a refusal — the page is simply not opted in.
    const r = resolveIndexPolicy({ blobject: { indexPolicy: 'no-index' }, callerContext: crawler })
    expect(r.optedIn).toBe(false)
    expect(r.refused).toBe(null)
  })

  it('binds feed approval in request mode', () => {
    const r = resolveIndexPolicy({
      blobject: { indexPolicy: 'no-index' },
      callerContext: { policyMode: 'request', feedApproved: true },
    })
    expect(r.optedIn).toBe(false)
    expect(r.refused).toBe(null)
  })

  it('binds feed approval in active mode', () => {
    const r = resolveIndexPolicy({
      blobject: { indexPolicy: 'no-index' },
      callerContext: { policyMode: 'active', feedApproved: true },
    })
    expect(r.optedIn).toBe(false)
    expect(r.refused).toBe(null)
  })

  it('leaves feed approval alone when the page declares no octo-policy', () => {
    expect(resolveIndexPolicy({
      blobject: { title: 'no markers at all' },
      callerContext: { policyMode: 'request', feedApproved: true },
    }).optedIn).toBe(true)
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
