import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isExcluded, banOrigin, unbanOrigin, approveOrigin, createVerifiedOrigin } from 'octothorpes'
import { createIndexer } from '../../packages/core/indexer.js'
import { _mapErrorToStatus } from '../routes/(endpoints)/index/+server.js'

// #310: one exclusion check over two sources (profile blocklist, runtime ban).

const banAsk = (bannedSpellings) => vi.fn(async (q) =>
  q.includes('octo:banned') && bannedSpellings.some((o) => q.includes(`<${o}>`)))

describe('isExcluded', () => {
  it('neither source', async () => {
    const queryBoolean = banAsk([])
    expect(await isExcluded('https://ok.test', { blockedDomains: ['bad.test'], queryBoolean }))
      .toEqual({ excluded: false, sources: [] })
  })

  it('profile only', async () => {
    const queryBoolean = banAsk([])
    expect(await isExcluded('https://bad.test', { blockedDomains: ['bad.test'], queryBoolean }))
      .toEqual({ excluded: true, sources: ['profile'] })
  })

  it('ban only', async () => {
    const queryBoolean = banAsk(['https://spam.test'])
    expect(await isExcluded('https://spam.test', { blockedDomains: [], queryBoolean }))
      .toEqual({ excluded: true, sources: ['ban'] })
  })

  it('both', async () => {
    const queryBoolean = banAsk(['https://spam.test'])
    expect(await isExcluded('https://spam.test', { blockedDomains: ['spam.test'], queryBoolean }))
      .toEqual({ excluded: true, sources: ['profile', 'ban'] })
  })

  it('profile www entry covers the bare origin', async () => {
    const res = await isExcluded('https://foo.test', { blockedDomains: ['www.foo.test'], queryBoolean: banAsk([]) })
    expect(res.sources).toEqual(['profile'])
  })

  it('ban on the www spelling covers the bare origin (any-variant ASK)', async () => {
    const queryBoolean = banAsk(['https://www.foo.test'])
    const res = await isExcluded('https://foo.test', { queryBoolean })
    expect(res.sources).toEqual(['ban'])
  })
})

describe('ban / unban / approve writes', () => {
  it('banOrigin purges pages, blank nodes, orphan terms, then tombstones', async () => {
    const calls = []
    const query = vi.fn(async (q) => { calls.push(q) })
    await banOrigin('https://spam.test', { query })
    expect(calls).toHaveLength(4)
    expect(calls[0]).toContain('octo:hasPart')
    expect(calls[0]).toContain('isBlank(?bn)')
    expect(calls[0]).toContain('<https://www.spam.test>')
    expect(calls[1]).toContain('<octo:Term>')
    expect(calls[1]).toContain('not exists')
    expect(calls[3]).toContain('<https://spam.test> octo:banned "true"')
  })

  it('unbanOrigin deletes only the tombstone triple', async () => {
    const query = vi.fn()
    await unbanOrigin('https://spam.test', { query })
    expect(query).toHaveBeenCalledOnce()
    const q = query.mock.calls[0][0]
    expect(q).toContain('delete { ?origin octo:banned ?b . }')
    expect(q).not.toMatch(/\?origin \?p \?o/)
  })

  it('approveOrigin / createVerifiedOrigin write octo:verified', async () => {
    const insert = vi.fn()
    await approveOrigin('https://a.test', { insert })
    await createVerifiedOrigin('https://b.test', { insert })
    expect(insert.mock.calls[0][0]).toContain('<https://a.test> octo:verified "true"')
    expect(insert.mock.calls[1][0]).toContain('<https://b.test> rdf:type <octo:Origin>')
  })
})

describe('indexing gate refuses banned origins in every mode', () => {
  const instance = 'http://localhost:5173/'
  const pageUri = 'https://banned.test/page'
  const harmonize = vi.fn(async () => ({ '@id': pageUri, title: 'T', indexPolicy: 'index', octothorpes: ['cats'] }))
  const registry = {
    getHandler: (m) => m === 'html' ? { mode: 'html', contentTypes: ['text/html'], harmonize } : null,
    getHandlerForContentType: () => ({ mode: 'html', contentTypes: ['text/html'], harmonize }),
  }

  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({ text: async () => '<html></html>', headers: { get: () => 'text/html' } })
  })

  for (const access of [
    { registration: 'open' },
    { registration: 'registered' },
    { registration: 'closed', whitelist: { domains: ['https://banned.test'] } },
  ]) {
    it(`${access.registration}: 403-mapped ban refusal`, async () => {
      const queryBoolean = banAsk(['https://banned.test'])
      const insert = vi.fn()
      const indexer = createIndexer({
        insert, query: vi.fn(), queryBoolean,
        queryArray: vi.fn().mockResolvedValue({ results: { bindings: [] } }),
        instance, handlerRegistry: registry, access,
      })
      const err = await indexer.handler(pageUri, 'default', null, {
        instance, queryBoolean, verifyOrigin: async () => true,
      }).catch((e) => e)
      expect(err.message).toMatch(/is banned/)
      expect(_mapErrorToStatus(err.message)).toBe(403)
      expect(insert).not.toHaveBeenCalled()
    })
  }
})
