import { describe, it, expect, vi } from 'vitest'
import Ajv from 'ajv'
import { createIndexer } from '../../packages/core/indexer.js'

// Records the deps createClient hands its internal indexer while leaving the
// real implementation in place, so the recentlyIndexed cases above still
// exercise core.
const createIndexerSpy = vi.fn()
vi.mock('../../packages/core/indexer.js', async (orig) => {
  const actual = await orig()
  return {
    ...actual,
    createIndexer: (...args) => {
      createIndexerSpy(...args)
      return actual.createIndexer(...args)
    },
  }
})
import { PROFILE_DEFAULTS, createProfile } from '../../packages/core/profile.js'
import schema from '../../packages/core/profile.schema.json' with { type: 'json' }

// #217: policies.indexing.frequency (string, unused) was replaced by
// policies.indexing.cooldown — integer SECONDS, min 0, default 300 — which is
// the re-index cooldown in every indexing mode and, later, the crawler's
// re-check interval. 0 means no wait at all.

const validateIndexing = (indexing) => {
  const ajv = new Ajv({ allErrors: true })
  const validate = ajv.compile(schema)
  return validate({
    identity: { instance: 'http://localhost:5173/' },
    policies: { indexing },
  })
}

describe('profile schema — policies.indexing.cooldown', () => {
  it('accepts 0', () => {
    expect(validateIndexing({ mode: 'request', cooldown: 0 })).toBe(true)
  })

  it('accepts 300', () => {
    expect(validateIndexing({ mode: 'request', cooldown: 300 })).toBe(true)
  })

  it('rejects a negative cooldown', () => {
    expect(validateIndexing({ mode: 'request', cooldown: -1 })).toBe(false)
  })

  it('rejects a non-integer cooldown', () => {
    expect(validateIndexing({ mode: 'request', cooldown: 1.5 })).toBe(false)
    expect(validateIndexing({ mode: 'request', cooldown: '300' })).toBe(false)
  })

  it('rejects the removed frequency key', () => {
    expect(validateIndexing({ mode: 'request', frequency: 'hourly' })).toBe(false)
  })

  it('declares integer/minimum/default in the schema itself', () => {
    const cooldown = schema.properties.policies.properties.indexing.properties.cooldown
    expect(cooldown).toMatchObject({ type: 'integer', minimum: 0, default: 300 })
    expect(schema.properties.policies.properties.indexing.properties.frequency).toBeUndefined()
  })
})

describe('profile defaults — policies.indexing.cooldown', () => {
  it('defaults to 300 seconds', () => {
    expect(PROFILE_DEFAULTS.policies.indexing).toEqual({ mode: 'request', cooldown: 300 })
  })

  it('resolves to 300 when the authored profile omits it', () => {
    const resolved = createProfile({
      profile: { identity: { instance: 'http://localhost:5173/' } },
      schema,
    }).getProfile()
    expect(resolved.policies.indexing.cooldown).toBe(300)
  })

  it('lets an authored value win', () => {
    const resolved = createProfile({
      profile: { identity: { instance: 'http://localhost:5173/' }, policies: { indexing: { cooldown: 0 } } },
      schema,
    }).getProfile()
    expect(resolved.policies.indexing.cooldown).toBe(0)
  })
})

describe('recentlyIndexed honors the injected cooldown', () => {
  const makeIndexer = (cooldown, mostRecent) => {
    const queryArray = vi.fn().mockResolvedValue({
      results: { bindings: [{ t: { value: String(mostRecent) } }] },
    })
    const indexer = createIndexer({
      insert: vi.fn(),
      query: vi.fn(),
      queryBoolean: vi.fn(),
      queryArray,
      instance: 'http://localhost:5173/',
      cooldown,
    })
    return { indexer, queryArray }
  }

  it('is true inside the window', async () => {
    const { indexer } = makeIndexer(300, Date.now() - 60_000)
    expect(await indexer.recentlyIndexed('http://x.test/a')).toBe(true)
  })

  it('is false outside the window', async () => {
    const { indexer } = makeIndexer(300, Date.now() - 600_000)
    expect(await indexer.recentlyIndexed('http://x.test/a')).toBe(false)
  })

  it('uses the injected value, not a hardcoded 5 minutes', async () => {
    // 60s ago: inside a 300s cooldown, outside a 30s one.
    const recent = Date.now() - 60_000
    expect(await makeIndexer(30, recent).indexer.recentlyIndexed('http://x.test/a')).toBe(false)
    expect(await makeIndexer(3000, recent).indexer.recentlyIndexed('http://x.test/a')).toBe(true)
  })

  it('defaults to 300 seconds when no cooldown dep is injected', async () => {
    const { indexer } = makeIndexer(undefined, Date.now() - 60_000)
    expect(await indexer.recentlyIndexed('http://x.test/a')).toBe(true)
  })

  it('short-circuits at 0 without querying', async () => {
    const { indexer, queryArray } = makeIndexer(0, Date.now())
    expect(await indexer.recentlyIndexed('http://x.test/a')).toBe(false)
    expect(queryArray).not.toHaveBeenCalled()
  })
})


describe('createClient forwards config.cooldown to the indexer', () => {
  const baseConfig = {
    instance: 'http://localhost:5173/',
    sparql: { endpoint: 'http://localhost:3030/ds', user: 'u', password: 'p' },
  }

  it('passes an explicit cooldown through', async () => {
    createIndexerSpy.mockClear()
    const { createClient } = await import('../../packages/core/client.js')
    await createClient({ ...baseConfig, cooldown: 42 })
    expect(createIndexerSpy.mock.calls[0][0]).toMatchObject({ cooldown: 42 })
  })

  it('passes 0 through rather than falling back to the default', async () => {
    createIndexerSpy.mockClear()
    const { createClient } = await import('../../packages/core/client.js')
    await createClient({ ...baseConfig, cooldown: 0 })
    expect(createIndexerSpy.mock.calls[0][0].cooldown).toBe(0)
  })

  it('defaults to 300 when config.cooldown is absent', async () => {
    createIndexerSpy.mockClear()
    const { createClient } = await import('../../packages/core/client.js')
    await createClient(baseConfig)
    expect(createIndexerSpy.mock.calls[0][0].cooldown).toBe(300)
  })
})
