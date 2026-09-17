import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve as res } from 'node:path'
import {
  createProfile,
  resolveProfile,
  createClient,
  createApi,
  DEFAULT_ROUTES,
  WHAT_VALUES,
  WHAT_GROUPS,
  WHAT_GROUP_BY_VALUE,
  GET_PARAMS,
  MATCH_VALUES,
} from 'octothorpes'

const here = dirname(fileURLToPath(import.meta.url))
const schema = JSON.parse(readFileSync(res(here, '../../packages/core/profile.schema.json'), 'utf8'))

const authored = {
  identity: { instance: 'https://example.test/', name: 'Example' },
  api: {
    handlers: { default: 'html' },
    linkTypes: [{ by: 'reviewed', subtype: 'Review' }],
  },
}

const profileOf = (overrides = {}) =>
  createProfile({ profile: { ...authored, ...overrides }, schema }).getProfile()

const profile = profileOf()

const resolved = (extra = {}) =>
  resolveProfile({
    profile,
    publisherNames: ['rss2', 'ics', 'rss2'],
    handlerNames: ['html', 'json'],
    harmonizerNames: ['default'],
    ...extra,
  })

describe('api.routes — projection of mount table x query grammar', () => {
  it('falls back to the SvelteKit relay shape when the adapter passes nothing', () => {
    const routes = resolved().api.routes
    expect(Object.keys(routes)).toEqual(Object.keys(DEFAULT_ROUTES))
    expect(routes.get.template).toBe('/get/{what}/{by}/{as}')
    expect(routes.profile.template).toBe('/profile.json')
  })

  it('takes a flat-route adapter table verbatim', () => {
    const routes = resolved({
      routes: { get: '/get?what={what}&by={by}', index: '/index', profile: '/profile.json' },
    }).api.routes
    expect(Object.keys(routes)).toEqual(['get', 'index', 'profile'])
    expect(routes.get.template).toBe('/get?what={what}&by={by}')
  })

  it('hangs the grammar off the get mount only — others are bare templates', () => {
    const routes = resolved().api.routes
    expect(Object.keys(routes.index)).toEqual(['template'])
    expect(Object.keys(routes.terms)).toEqual(['template'])
    expect(routes.get.what).toBeInstanceOf(Array)
  })

  it('`by` reflects a profile-declared link type alongside the builtins', () => {
    const { by } = resolved().api.routes.get
    expect(by).toContain('thorped')
    expect(by).toContain('bookmarked')
    expect(by).toContain('reviewed')
    // Same table, same order as api.linkTypes — they must not disagree.
    expect(by).toEqual(resolved().api.linkTypes.map((lt) => lt.by))
  })

  it('`as` is the publishers that actually registered, deduped and sorted', () => {
    expect(resolved().api.routes.get.as).toEqual(['ics', 'rss2'])
    expect(resolved({ publisherNames: [] }).api.routes.get.as).toEqual([])
  })

  it('`params` and `match` are the accepted query grammar, sorted', () => {
    const { params, match } = resolved().api.routes.get
    expect(params).toEqual([...GET_PARAMS])
    expect(params).toEqual([...params].sort())
    expect(params).toContain('s')
    expect(params).toContain('not-s')
    expect(match).toEqual([...MATCH_VALUES])
  })

  it('is deterministic — two calls project identical JSON', () => {
    expect(JSON.stringify(resolved().api.routes)).toBe(JSON.stringify(resolved().api.routes))
  })
})

describe('WHAT_VALUES is the same source api.js switches on', () => {
  it('flattens WHAT_GROUPS and agrees with the group lookup', () => {
    expect(WHAT_VALUES).toEqual(Object.values(WHAT_GROUPS).flat())
    for (const what of WHAT_VALUES) {
      expect(WHAT_GROUP_BY_VALUE[what]).toBeTypeOf('string')
    }
  })

  it('advertises exactly the `what` words api.get() accepts', async () => {
    // Stubbed SPARQL: every builder path returns an empty result set, so this
    // probes ADMISSION ('unknown what: ...' or not), never query content.
    const empty = async () => ({ results: { bindings: [] } })
    const api = createApi({
      instance: 'https://example.test/',
      queryArray: empty,
      queryBoolean: async () => false,
      insert: async () => {},
      query: async () => {},
    })

    const accepted = async (what) => {
      try {
        // A subject is supplied because several builders refuse a query with
        // no axis at all; that refusal is unrelated to `what` admission.
        await api.get(what, 'posted', { s: 'https://example.test/page' })
        return true
      } catch (e) {
        if (e.message.startsWith('unknown what:')) return false
        throw e
      }
    }

    for (const what of resolved().api.routes.get.what) {
      expect(await accepted(what), `${what} should be accepted`).toBe(true)
    }
    // A word that is NOT advertised is NOT accepted — the list is exhaustive,
    // not merely a subset. `mentions` is real in buildMultiPass's resultMode
    // switch but has never been a valid api.get `what`.
    for (const what of ['mentions', 'citations', 'bookmarks', 'nonsense']) {
      expect(await accepted(what), `${what} should be refused`).toBe(false)
    }
  })
})

describe('api.routes is projection-only', () => {
  it('is a schema error when authored', () => {
    expect(() =>
      createProfile({
        profile: { ...authored, api: { ...authored.api, routes: { get: '/get' } } },
        schema,
      }).getProfile()
    ).toThrow()
  })
})

describe('createClient({ routes })', () => {
  const client = (routes) =>
    createClient({
      instance: 'https://example.test/',
      sparql: { endpoint: 'http://localhost:9999/sparql' },
      profile,
      routes,
    })

  it('passes the adapter table through to the resolved profile', () => {
    const routes = client({ get: '/q/{what}/{by}', profile: '/p.json' }).resolvedProfile().api.routes
    expect(routes.get.template).toBe('/q/{what}/{by}')
    expect(Object.keys(routes)).toEqual(['get', 'profile'])
  })

  it('defaults to DEFAULT_ROUTES when none is passed', () => {
    expect(client().resolvedProfile().api.routes.get.template).toBe(DEFAULT_ROUTES.get)
  })

  it('rejects a malformed table at construction time', () => {
    expect(() => client(['/get'])).toThrow(/must be an object/)
    expect(() => client({ get: 42 })).toThrow(/non-empty URL template/)
    expect(() => client({ get: '' })).toThrow(/non-empty URL template/)
  })
})
