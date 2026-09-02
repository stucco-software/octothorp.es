import { describe, it, expect, vi } from 'vitest'

// #217 wave 5 final review: indexingAdapterDocumentRecord.test.js's fakeProfile
// points api.handlers.dir/api.harmonizers.dir at null, so it never exercises
// the discovery seam wired into src/lib/indexing.js (via $lib/handlers/index.js
// and $lib/harmonizers/index.js). This file uses a separate fakeProfile
// pointing at the real built static/ dirs so the adapter's discovery loops
// actually run, and asserts the site-discovered csv handler and anchors
// harmonizer land in the registries createIndexer receives.
const fakeProfile = {
  identity: { instance: 'https://example.test/' },
  api: {
    documentRecord: [],
    handlers: { dir: './static/handlers', default: 'html' },
    harmonizers: { dir: './static/harmonizers' },
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

describe('#217 indexing adapter discovery seam', () => {
  it('registers the site-discovered csv handler alongside the builtins', () => {
    expect(captured.handlerRegistry.listHandlers()).toContain('csv')
  })

  it('resolves the site-discovered anchors harmonizer', async () => {
    const harmonizer = await captured.getHarmonizer('anchors')
    expect(harmonizer).toBeTruthy()
  })
})
