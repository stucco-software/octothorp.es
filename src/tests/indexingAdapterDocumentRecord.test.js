import { describe, it, expect, vi } from 'vitest'

// #242: mirrors src/tests/profileAdapter.test.js's smoke-test style, but for
// the write-side wiring. Confirms src/lib/indexing.js (the SvelteKit adapter)
// injects the profile's declared documentRecord schema into createIndexer, so
// the core write path (recordDocumentRecord, invoked from ingestBlobject) is
// no longer a no-op on the live HTTP routes. No logic under test here lives
// in this file — packages/core owns recordDocumentRecord itself (see
// src/tests/indexing.test.js / c14MemexRoundtrip.test.js for that).
const mockCreateIndexer = vi.fn(() => ({}))
vi.mock('octothorpes', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    createIndexer: (deps) => mockCreateIndexer(deps),
  }
})

describe('src/lib/indexing.js adapter — documentRecordSchema wiring', () => {
  it('passes the profile-declared documentRecord schema through to createIndexer', async () => {
    const { getProfile } = await import('$lib/profile.js')
    await import('$lib/indexing.js')

    expect(mockCreateIndexer).toHaveBeenCalledTimes(1)
    const deps = mockCreateIndexer.mock.calls[0][0]

    const expectedSchema = getProfile().vocabulary.documentRecord
    expect(deps.documentRecordSchema).toBeDefined()
    expect(Array.isArray(deps.documentRecordSchema)).toBe(true)
    expect(deps.documentRecordSchema.length).toBeGreaterThan(0)
    expect(deps.documentRecordSchema).toEqual(expectedSchema)
  })
})
