import { describe, it, expect, vi } from 'vitest'

// §1a of docs/plans/weeks/2026-09-14-week.md, adapter half.
//
// The declared documentRecord is threaded profile -> adapter -> core in two
// places; the CHANGELOG records that the programmatic half (src/lib/op.js's
// createClient config) was silently dropped once. The old parity test caught
// that by rewriting the tracked octothorpes.json and diffing HTTP vs
// programmatic against a live server. Here the same regression is caught with
// a SAMPLE profile and no server: the real src/lib/profile.js loader resolves
// the fixture, and the real src/lib/op.js is observed handing that exact
// declaration to createClient.
//
// Whether a client-level documentRecordSchema then reaches the emitted SPARQL
// is core's business and is already asserted in
// client-documentRecordSchema-reachesGet.test.js — not repeated here.
// End-to-end HTTP coverage lives in the smoketest's /profile.json capture.

const FIXTURE = 'src/tests/fixtures/profiles/document-record.json'

const DECLARED = [
  { predicate: 'encodingFormat', range: 'literal' },
  { predicate: 'url', range: 'uri' },
  { predicate: 'contentSize', range: 'number' },
  { predicate: 'dateModified', range: 'timestamp' },
]

// The adapter's OP_PROFILE override, exercised through its explicit-path entry
// point so the test never mutates process.env under vitest's $env handling.
const { loadProfileFrom } = await import('$lib/profile.js')
const sampleProfile = loadProfileFrom(FIXTURE).getProfile()

describe('src/lib/profile.js loads a sample profile via the path override', () => {
  it('resolves the declared documentRecord verbatim', () => {
    expect(sampleProfile.api.documentRecord).toEqual(DECLARED)
  })

  it('resolves identity off the sample, not the repo profile', () => {
    expect(sampleProfile.identity.name).toBe('OP Test Profile (documentRecord)')
    expect(() => new URL(sampleProfile.identity.instance)).not.toThrow()
    expect(sampleProfile.identity.terms).toBe('http://localhost:5173/~/')
    expect(sampleProfile.policies.access.registration).toBe('open')
  })

  it('still fills defaults for everything the sample leaves out', () => {
    const minimal = loadProfileFrom('src/tests/fixtures/profiles/minimal.json').getProfile()
    expect(minimal.api.documentRecord).toEqual([])
    expect(minimal.api.handlers.default).toBe('html')
    expect(minimal.policies.access.registration).toBe('registered')
  })
})

describe('src/lib/op.js passes the profile documentRecord to createClient', () => {
  it('sets documentRecordSchema from profile.api.documentRecord (the #217 wiring gap)', async () => {
    vi.resetModules()
    vi.doMock('$lib/profile.js', () => ({ getProfile: () => sampleProfile }))
    const captured = {}
    vi.doMock('octothorpes', async (orig) => {
      const actual = await orig()
      return {
        ...actual,
        createClient: (config) => {
          Object.assign(captured, config)
          return actual.createClient(config)
        },
      }
    })

    await import('$lib/op.js')

    expect(captured.documentRecordSchema).toEqual(DECLARED)
    expect(captured.instance).toBe(sampleProfile.identity.instance)
    expect(captured.access).toEqual(sampleProfile.policies.access)
    expect(captured.indexingMode).toBe(sampleProfile.policies.indexing.mode)

    vi.doUnmock('$lib/profile.js')
    vi.doUnmock('octothorpes')
    vi.resetModules()
  })
})
