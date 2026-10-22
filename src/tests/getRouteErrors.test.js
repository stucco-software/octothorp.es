import { describe, it, expect, vi } from 'vitest'
import { createApi, createClient, QueryError, isQueryError } from 'octothorpes'
import { queryErrorResponse } from '../lib/queryErrorResponse.js'

const instance = 'https://test.example.com/'
const empty = async () => ({ results: { bindings: [] } })

const api = () => createApi({
  instance,
  queryArray: empty,
  queryBoolean: async () => false,
  insert: async () => {},
  query: async () => {},
})

const grab = async (fn) => {
  try {
    await fn()
  } catch (e) {
    return e
  }
  throw new Error('expected a throw')
}

describe('core query validation errors', () => {
  it('unknown what', async () => {
    const e = await grab(() => api().get('nosuchwhat', 'posted', { s: `${instance}p` }))
    expect(e).toBeInstanceOf(QueryError)
    expect(e.message).toBe('unknown what: nosuchwhat')
    expect(e.status).toBe(400)
  })

  it('unknown by', async () => {
    const e = await grab(() => api().get('pages', 'nosuchby', { s: `${instance}p` }))
    expect(e).toBeInstanceOf(QueryError)
    expect(e.message).toBe('unknown by: nosuchby')
    expect(e.status).toBe(400)
  })

  it('unknown match', async () => {
    const e = await grab(() => api().get('pages', 'thorped', { s: `${instance}p`, match: 'nosuchmode' }))
    expect(e).toBeInstanceOf(QueryError)
    expect(e.message).toBe('unknown match: nosuchmode')
    expect(e.status).toBe(400)
  })

  it('unbounded query', async () => {
    const e = await grab(() => api().get('everything', 'posted', {}))
    expect(e).toBeInstanceOf(QueryError)
    expect(e.message).toBe('valid query refused as unbounded: add s, o, or rt to bound it')
    expect(e.status).toBe(400)
  })

  it('rejects s= on domains/posted (#266)', async () => {
    const e = await grab(() => api().get('domains', 'posted', { s: 'example.com' }))
    expect(e).toBeInstanceOf(QueryError)
    expect(e.message).toBe('s is not a filter on domains/posted: it lists every domain posted to this relay. Drop s and not-s, or use pages/posted to filter by subject.')
    expect(e.status).toBe(400)
  })

  it('rejects not-s on domains/posted (#266)', async () => {
    const e = await grab(() => api().get('domains', 'posted', { notS: 'example.com' }))
    expect(e).toBeInstanceOf(QueryError)
    expect(e.status).toBe(400)
  })

  it('domains/posted without s stays valid and is capped (#266/#313)', async () => {
    const { multiPass } = await api().get('domains', 'posted', { as: 'multipass' })
    expect(multiPass.filters.limitResults).toBe('100') // default page size under the cap
    const e = await grab(() => api().get('domains', 'posted', { limit: 'no-limit' }))
    expect(e).toBeInstanceOf(QueryError)
    expect(e.message).toContain('400') // names the #313 cap
  })

  it('domains/in-webring keeps s (resolved byParent, not a filter rejection)', async () => {
    const out = await api()
      .get('domains', 'in-webring', { s: `${instance}ring` })
      .then(() => 'ok', (e) => e.message)
    expect(out).toBe('ok')
  })

  it('leaves subtype-only queries alone', async () => {
    // A built-in link type's subtype bounds the query on its own (#236), so a
    // subject-less `pages/cited` must NOT hit the unbounded guard.
    const out = await api().get('pages', 'cited', {}).then(() => 'ok', (e) => e.message)
    expect(out).toBe('ok')
  })
})

describe('unknown publisher', () => {
  const client = () => createClient({
    instance,
    sparql: { endpoint: 'https://sparql.test/' },
  })

  it('throws a 404 QueryError for an unregistered as', async () => {
    const e = await grab(() => client().get({ what: 'everything', by: 'posted', as: 'nosuchpublisher', s: `${instance}p` }))
    expect(e).toBeInstanceOf(QueryError)
    expect(e.message).toBe('unknown publisher: nosuchpublisher')
    expect(e.status).toBe(404)
  })

  it('still resolves built-in publishers', () => {
    const c = client()
    expect(c.publisher.getPublisher('rss')).toBeTruthy()
    expect(c.publisher.getPublisher('rss2')).toBeTruthy()
    expect(c.publisher.getPublisher('ics')).toBeTruthy()
  })
})

describe('queryErrorResponse', () => {
  it('maps a QueryError to a 4xx JSON body', async () => {
    const res = queryErrorResponse(new QueryError('unknown by: nope'))
    expect(res.status).toBe(400)
    expect(res.headers.get('content-type')).toBe('application/json')
    // CORS is added by hooks.server.js (covered in indexRouteErrorMapping.test.js)
    expect(await res.json()).toEqual({ error: 'unknown by: nope' })
  })

  it('honours a custom status', () => {
    expect(queryErrorResponse(new QueryError('unknown publisher: x', { status: 404 })).status).toBe(404)
  })

  it('rethrows anything that is not a QueryError', () => {
    const boom = new TypeError('genuine bug')
    expect(() => queryErrorResponse(boom)).toThrow(boom)
  })

  it('isQueryError accepts any error carrying a status', () => {
    const e = Object.assign(new Error('x'), { status: 418 })
    expect(isQueryError(e)).toBe(true)
    expect(isQueryError(new Error('x'))).toBe(false)
  })
})
