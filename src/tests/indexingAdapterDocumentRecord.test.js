import { describe, it, expect, vi } from 'vitest'

// #217: mirrors src/tests/profileAdapter.test.js's smoke-test style, but for
// the write-side wiring. Confirms src/lib/indexing.js (the SvelteKit adapter)
// injects the profile's declared api.documentRecord schema and
// api.handlers.default into createIndexer, so the adapter is reading the
// nested profile shape rather than $lib/config.js's flat .env-derived
// values. No logic under test here lives in this file — packages/core owns
// createIndexer/recordDocumentRecord itself.
const fakeProfile = {
  identity: { instance: 'https://example.test/' },
  api: {
    documentRecord: [{ predicate: 'encodingFormat', range: 'literal' }],
    handlers: { dir: null, default: 'markdown' },
    harmonizers: { dir: null },
  },
  policies: {
    indexing: { mode: 'request' },
    access: {
      registration: 'registered',
      blocks: { domains: [], terms: [] },
      whitelist: { domains: [] },
    },
  },
  vocabulary: { namespaces: [] },
}
vi.mock('$lib/profile.js', () => ({ getProfile: () => fakeProfile }))

const captured = {}
vi.mock('octothorpes', async (orig) => {
  const actual = await orig()
  return {
    ...actual,
    createIndexer: (config) => { Object.assign(captured, config); return actual.createIndexer(config) },
  }
})

await import('$lib/indexing.js')

describe('#217 indexing adapter reads the profile', () => {
  it('passes api.documentRecord as documentRecordSchema', () => {
    expect(captured.documentRecordSchema).toEqual(fakeProfile.api.documentRecord)
  })

  it('uses api.handlers.default for the handler registry default, not .env', () => {
    const def = captured.handlerRegistry.getDefault?.()
    expect(def?.mode ?? def ?? captured.handlerRegistry.default).toBe('markdown')
  })

  // documentRecord predicates became octo-only, so the indexer no longer
  // resolves anything against a namespace list and the dep was removed. The
  // adapter must not resurrect it: namespaces still belong to the SPARQL
  // prologue and createClient config, not to createIndexer.
  it('does not pass a namespace list into the indexer', () => {
    expect(captured.namespaces).toBeUndefined()
  })

  it('passes the profile indexing mode straight through — no translation', () => {
    expect(captured.indexingMode).toBe('request')
  })

  it('passes the access gate separately from the indexing mode', () => {
    expect(captured.access.registration).toBe('registered')
  })
})
