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
    expect(e.message).toBe('query needs s, o, or rt')
    expect(e.status).toBe(400)
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
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
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
