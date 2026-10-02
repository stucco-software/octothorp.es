import { describe, it, expect, vi, afterEach } from 'vitest'

// #217 wave 4 stage 4, adapter half. src/lib/op.js injected the client-endorsed
// endorser into createClient, but src/lib/indexing.js — the adapter the /index
// route actually uses — built its own indexer without `endorsers`, so the gate
// denied every unregistered origin even when the page carried the marker.
// Both adapters must hand core the SAME endorser array, built once.

const captureFactory = (name, captured) => async (orig) => {
  const actual = await orig()
  return {
    ...actual,
    [name]: (config) => {
      Object.assign(captured, config)
      return actual[name](config)
    },
  }
}

afterEach(() => {
  vi.doUnmock('octothorpes')
  vi.resetModules()
})

describe('src/lib/indexing.js passes injected endorsers to createIndexer', () => {
  it('hands createIndexer the shared endorser array', async () => {
    vi.resetModules()
    const captured = {}
    vi.doMock('octothorpes', captureFactory('createIndexer', captured))

    await import('$lib/indexing.js')
    const { endorsers } = await import('$lib/endorsers/index.js')

    expect(captured.endorsers).toBe(endorsers)
    expect(captured.endorsers.map((e) => e.name)).toContain('client-endorsed')
  })

  it('op.js and indexing.js share one endorser array', async () => {
    vi.resetModules()
    const indexerCfg = {}
    const clientCfg = {}
    vi.doMock('octothorpes', async (orig) => {
      const actual = await orig()
      return {
        ...actual,
        createIndexer: (c) => { Object.assign(indexerCfg, c); return actual.createIndexer(c) },
        createClient: (c) => { Object.assign(clientCfg, c); return actual.createClient(c) },
      }
    })

    await import('$lib/indexing.js')
    await import('$lib/op.js')

    expect(clientCfg.endorsers).toBeDefined()
    expect(indexerCfg.endorsers).toBe(clientCfg.endorsers)
  })
})
