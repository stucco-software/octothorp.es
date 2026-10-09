import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('$lib/sparql.js', () => ({ queryArray: vi.fn() }))
vi.mock('$lib/op.js', () => ({ op: { get: vi.fn() } }))

import { siteNumMintQuery, mintSiteNum, originBySiteNum, createVerifiedOrigin, approveOrigin } from 'octothorpes'
import { queryArray } from '$lib/sparql.js'
import { op } from '$lib/op.js'
import { resolveSiteNum } from '../routes/domains/[uri]/domain.js'

describe('#191 siteNum minting', () => {
  const q = siteNumMintQuery('https://a.test')

  it('inserts MAX(existing)+1 as a string literal, defaulting to 1', () => {
    expect(q).toContain('insert { <https://a.test> octo:siteNum ?n . }')
    expect(q).toMatch(/str\(coalesce\(max\(<http:\/\/www\.w3\.org\/2001\/XMLSchema#integer>\(\?sn\)\), 0\) \+ 1\)/)
  })

  it('ignores non-numeric siteNums so one bad value cannot reset MAX', () => {
    expect(q).toContain('filter(regex(str(?sn), "^[0-9]+$"))')
  })

  it('is idempotent: no mint when the origin already has a number', () => {
    expect(q).toContain('filter not exists { <https://a.test> octo:siteNum ?existing . }')
  })

  it('only mints for a verified octo:Origin', () => {
    expect(q).toContain('<https://a.test> rdf:type <octo:Origin> ; octo:verified "true" .')
  })

  it('mintSiteNum issues the update in one round trip', async () => {
    const query = vi.fn()
    await mintSiteNum('https://a.test', { query })
    expect(query).toHaveBeenCalledOnce()
    expect(query.mock.calls[0][0]).toBe(q)
  })

  it('createVerifiedOrigin / approveOrigin mint when given query', async () => {
    const insert = vi.fn()
    const query = vi.fn()
    await createVerifiedOrigin('https://b.test', { insert, query })
    await approveOrigin('https://c.test', { insert, query })
    expect(query.mock.calls.map(c => c[0])).toEqual([siteNumMintQuery('https://b.test'), siteNumMintQuery('https://c.test')])
  })
})

describe('#191 originBySiteNum', () => {
  it('returns the origin for a known number', async () => {
    const qa = vi.fn().mockResolvedValue({ results: { bindings: [{ origin: { value: 'https://a.test' } }] } })
    expect(await originBySiteNum('4', { queryArray: qa })).toBe('https://a.test')
    expect(qa.mock.calls[0][0]).toContain('?origin octo:siteNum "4"')
  })

  it('returns null for an unknown number', async () => {
    const qa = vi.fn().mockResolvedValue({ results: { bindings: [] } })
    expect(await originBySiteNum(99, { queryArray: qa })).toBeNull()
  })

  it('rejects non-digit input without querying', async () => {
    const qa = vi.fn()
    expect(await originBySiteNum('4" } drop', { queryArray: qa })).toBeNull()
    expect(qa).not.toHaveBeenCalled()
  })
})

describe('#191 /domains/<n> route resolution', () => {
  beforeEach(() => vi.clearAllMocks())

  it('redirects digits to the canonical encoded-origin URL, keeping the query', async () => {
    queryArray.mockResolvedValue({ results: { bindings: [{ origin: { value: 'https://a.test' } }] } })
    const url = new URL('http://localhost/domains/4?offset=100')
    await expect(resolveSiteNum('4', url)).rejects.toMatchObject({
      status: 307,
      location: '/domains/https%3A%2F%2Fa.test?offset=100',
    })
  })

  it('404s an unknown number', async () => {
    queryArray.mockResolvedValue({ results: { bindings: [] } })
    await expect(resolveSiteNum('999', new URL('http://localhost/domains/999'))).rejects.toMatchObject({ status: 404 })
  })

  it('leaves non-digit params alone', async () => {
    await expect(resolveSiteNum('https%3A%2F%2Fa.test', new URL('http://localhost/domains/x'))).resolves.toBeUndefined()
    expect(queryArray).not.toHaveBeenCalled()
  })

  it('page load delegates to the existing handler for non-digit params', async () => {
    op.get.mockResolvedValue({ results: [] })
    const { load } = await import('../routes/domains/[uri]/+page.server.js')
    const data = await load({ params: { uri: encodeURIComponent('https://a.test') }, url: new URL('http://localhost/domains/x') })
    expect(data.domain).toBe('https://a.test')
    expect(queryArray).not.toHaveBeenCalled()
  })
})
