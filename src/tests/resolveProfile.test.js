import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve as res } from 'node:path'
import { createProfile, resolveProfile, expandTermUri, absolutize, createClient } from 'octothorpes'

const here = dirname(fileURLToPath(import.meta.url))
const schema = JSON.parse(readFileSync(res(here, '../../packages/core/profile.schema.json'), 'utf8'))

const authored = {
  identity: {
    instance: 'https://example.test/',
    name: 'Example',
    terms: 'https://example.test/~/',
    feeds: { thorpes: ['cats', 'dogs'], multipass: '/news.json' },
    images: { favicon: '/favicon.ico', avatar: 'https://cdn.test/avatar.png' },
  },
  policies: { access: { registration: 'open', badge: '/badge.png' } },
  api: {
    publishers: { dir: './src/lib/publishers' },
    handlers: { dir: './src/lib/handlers', default: 'html' },
    harmonizers: { dir: './src/lib/harmonizers' },
  },
  vocabulary: { namespaces: [{ prefix: 'skos', iri: 'http://www.w3.org/2004/02/skos/core#', import: true }] },
}

const profile = createProfile({ profile: authored, schema }).getProfile()
const resolved = () => resolveProfile({
  profile,
  publisherNames: ['rss2', 'ics', 'blarg', 'readable', 'rss2'],
  handlerNames: ['html', 'json', 'csv'],
  harmonizerNames: ['default', 'openGraph'],
})

describe('resolveProfile — discovery projection', () => {
  it('lists the union of builtin and discovered publishers, deduped and sorted', () => {
    expect(resolved().api.publishers.available).toEqual(['blarg', 'ics', 'readable', 'rss2'])
  })

  it('lists registered handler modes and keeps the default under handlers', () => {
    expect(resolved().api.handlers.available).toEqual(['html', 'json', 'csv'])
    expect(resolved().api.handlers.default).toBe('html')
  })

  it('lists registered harmonizers as a sibling block with no defaultHandler', () => {
    expect(resolved().api.harmonizers.available).toEqual(['default', 'openGraph'])
    expect(resolved().api.harmonizers.defaultHandler).toBeUndefined()
  })

  it('#217 wave 5: handlerNames and harmonizerNames reach the projection unmodified apart from dedup', () => {
    const out = resolveProfile({
      profile,
      handlerNames: ['html', 'csv', 'html', 'json'],
      harmonizerNames: ['default', 'anchors', 'default', 'csv'],
    })
    expect(out.api.handlers.available).toEqual(['html', 'csv', 'json'])
    expect(out.api.harmonizers.available).toEqual(['default', 'anchors', 'csv'])
  })

  it('drops every directory pointer from the public projection', () => {
    expect(resolved().api.publishers.dir).toBeUndefined()
    expect(resolved().api.publishers.named).toBeUndefined()
    expect(resolved().api.handlers.dir).toBeUndefined()
    expect(resolved().api.handlers.named).toBeUndefined()
    expect(resolved().api.harmonizers.dir).toBeUndefined()
    expect(resolved().api.harmonizers.named).toBeUndefined()
  })
})

describe('resolveProfile — policies pass through both axes', () => {
  it('surfaces indexing.mode and access.registration independently', () => {
    expect(resolved().policies.indexing.mode).toBe('request')
    expect(resolved().policies.access.registration).toBe('open')
  })

  it('surfaces the list modifiers so consumers can see the declared scope', () => {
    // Always the EXPANDED arrays — a path-form authored list is read at load
    // time and only its contents reach the projection.
    expect(resolved().policies.access.blocks).toEqual({ domains: [], terms: [] })
    expect(resolved().policies.access.whitelist).toEqual({ domains: [] })
  })

  it('surfaces a path-form blocklist as its expanded contents, never the path', () => {
    const p = createProfile({
      profile: {
        identity: { instance: 'https://example.test/' },
        policies: { access: { registration: 'open', blocks: { domains: './b.json', terms: './t.json' } } },
      },
      schema,
      readFile: (path) => (path.includes('t.json') ? '["someslur"]' : '["bad.test"]'),
    }).getProfile()
    const out = resolveProfile({ profile: p }).policies.access
    expect(out.blocks).toEqual({ domains: ['bad.test'], terms: ['someslur'] })
    expect(JSON.stringify(out)).not.toContain('.json')
  })
})

describe('resolveProfile — vocabulary', () => {
  it('surfaces the effective octo IRI', () => {
    expect(resolved().vocabulary.octo).toBe('https://vocab.octothorp.es#')
  })

  it('tags builtin and declared namespaces', () => {
    const ns = resolved().vocabulary.namespaces
    expect(ns.find((n) => n.prefix === 'rdf').source).toBe('builtin')
    expect(ns.find((n) => n.prefix === 'skos')).toEqual({
      prefix: 'skos', iri: 'http://www.w3.org/2004/02/skos/core#', import: true, source: 'declared',
    })
  })
})

describe('resolveProfile — URI expansion', () => {
  it('expands feed term-name arrays to term URIs', () => {
    expect(resolved().identity.feeds.thorpes)
      .toEqual(['https://example.test/~/cats', 'https://example.test/~/dogs'])
  })

  it('absolutizes a relative feed URL', () => {
    expect(resolved().identity.feeds.multipass).toBe('https://example.test/news.json')
  })

  it('absolutizes relative images and leaves absolute ones alone', () => {
    expect(resolved().identity.images.favicon).toBe('https://example.test/favicon.ico')
    expect(resolved().identity.images.avatar).toBe('https://cdn.test/avatar.png')
  })

  it('absolutizes the operational badge path', () => {
    expect(resolved().policies.access.badge).toBe('https://example.test/badge.png')
  })

  it('joins a terms prefix that lacks a trailing separator', () => {
    expect(expandTermUri('https://example.test/terms', 'cats')).toBe('https://example.test/terms/cats')
    expect(expandTermUri('https://example.test/~/', 'cats')).toBe('https://example.test/~/cats')
    expect(expandTermUri('https://example.test/v#', 'cats')).toBe('https://example.test/v#cats')
  })

  it('leaves term-name arrays alone when identity.terms is unset', () => {
    const p = createProfile({
      profile: { identity: { instance: 'https://x.test/', feeds: { thorpes: ['cats'] } } },
      schema,
    }).getProfile()
    expect(resolveProfile({ profile: p }).identity.feeds.thorpes).toEqual(['cats'])
  })

  it('absolutize() is a no-op for absolute URLs and nullish input', () => {
    expect(absolutize('https://a.test/x', 'https://b.test/')).toBe('https://a.test/x')
    expect(absolutize(null, 'https://b.test/')).toBeNull()
  })
})

describe('resolveProfile — purity', () => {
  it('does not mutate the loaded profile', () => {
    const snapshot = JSON.parse(JSON.stringify(profile))
    resolved()
    expect(profile).toEqual(snapshot)
  })

  it('carries no secret-shaped keys', () => {
    const keys = []
    const walk = (n) => {
      if (Array.isArray(n)) return n.forEach(walk)
      if (n && typeof n === 'object') for (const [k, v] of Object.entries(n)) { keys.push(k); walk(v) }
    }
    walk(resolved())
    expect(keys.some((k) => /key|secret|token|password|credential/i.test(k))).toBe(false)
  })
})

describe('client.resolvedProfile()', () => {
  const mk = (extra = {}) => createClient({
    instance: 'https://example.test/',
    sparql: { endpoint: 'http://localhost:1/unused' },
    profile,
    publishers: { blarg: { meta: { name: 'blarg' }, render: () => '' } },
    ...extra,
  })

  it('includes core builtin publishers and the injected ones', () => {
    const available = mk().resolvedProfile().api.publishers.available
    expect(available).toContain('blarg')
    expect(available).toContain('rss2')
  })

  it('includes registered harmonizer names', () => {
    expect(mk().resolvedProfile().api.harmonizers.available).toContain('default')
  })

  it('includes builtin handler modes under api.handlers.available', () => {
    expect(mk().resolvedProfile().api.handlers.available).toContain('html')
  })

  it('is a stable getter — same value, no I/O per call', () => {
    const client = mk()
    expect(client.resolvedProfile()).toEqual(client.resolvedProfile())
  })

  it('throws a clear error when the client was built without a profile', () => {
    const client = createClient({ instance: 'https://example.test/', sparql: { endpoint: 'http://localhost:1/x' } })
    expect(() => client.resolvedProfile()).toThrow(/profile/i)
  })
})
