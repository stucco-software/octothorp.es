import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createIndexer } from '../../packages/core/indexer.js'

const mockInsert = vi.fn()
const mockQuery = vi.fn()
const mockQueryBoolean = vi.fn()
const mockQueryArray = vi.fn()
const mockHarmonizeSource = vi.fn()

const instance = 'http://localhost:5173/'

const makeIndexer = () => createIndexer({
  insert: mockInsert,
  query: mockQuery,
  queryBoolean: mockQueryBoolean,
  queryArray: mockQueryArray,
  harmonizeSource: mockHarmonizeSource,
  instance,
})

describe('createIndexer', () => {
  beforeEach(() => vi.clearAllMocks())

  it('should return handler and helper functions', () => {
    const indexer = makeIndexer()
    expect(typeof indexer.handler).toBe('function')
    expect(typeof indexer.handleThorpe).toBe('function')
    expect(typeof indexer.checkIndexingRateLimit).toBe('function')
    expect(typeof indexer.resolveSubtype).toBe('function')
  })

  it('should enforce rate limiting per origin', () => {
    const indexer = makeIndexer()
    expect(indexer.checkIndexingRateLimit('https://example-ratelimit-test.com')).toBe(true)
  })

  it('should allow local harmonizer IDs', () => {
    const indexer = makeIndexer()
    expect(indexer.isHarmonizerAllowed('default', 'https://example.com', { instance })).toBe(true)
  })
})
