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

  it('assembles full thorpe URLs from instance + terms + the declared names', () => {
    const p = createProfile({
      profile: { identity: { instance: 'https://x.test/', feeds: { thorpes: ['cats', 'dogs'] } } },
      schema,
    }).getProfile()
    expect(resolveProfile({ profile: p }).identity.feeds.thorpes).toEqual([
      'https://x.test/~/cats',
      'https://x.test/~/dogs',
    ])
  })

  it('expands against an authored terms prefix in preference to the default', () => {
    const p = createProfile({
      profile: {
        identity: { instance: 'https://x.test/', terms: 'https://x.test/tags/', feeds: { thorpes: ['cats'] } },
      },
      schema,
    }).getProfile()
    expect(resolveProfile({ profile: p }).identity.feeds.thorpes).toEqual(['https://x.test/tags/cats'])
  })

  it('expands for a raw profile that skipped the loader, using the derived default', () => {
    // resolveProfile is pure and public, so it derives terms itself rather
    // than assuming a loader ran — there is no un-expanded passthrough case.
    const raw = { identity: { instance: 'https://x.test/', feeds: { thorpes: ['cats'] } }, policies: { access: {} }, api: { handlers: {} }, vocabulary: {} }
    expect(resolveProfile({ profile: raw }).identity.feeds.thorpes).toEqual(['https://x.test/~/cats'])
  })

  it('drops the thorpes slot entirely when no names are declared', () => {
    const p = createProfile({
      profile: { identity: { instance: 'https://x.test/', feeds: { thorpes: [], multipass: '/m.json' } } },
      schema,
    }).getProfile()
    const feeds = resolveProfile({ profile: p }).identity.feeds
    expect('thorpes' in feeds).toBe(false)
    expect(feeds.multipass).toBe('https://x.test/m.json')
  })

  it('emits no feeds at all when none are declared', () => {
    const p = createProfile({ profile: { identity: { instance: 'https://x.test/' } }, schema }).getProfile()
    expect(resolveProfile({ profile: p }).identity.feeds).toEqual({})
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

// ---------------------------------------------------------------------------
// Instance normalization. A trailing-slash-less `instance` silently produced
// malformed term URIs (`https://x.test~/cats`) everywhere core interpolates it
// — queryBuilders' thorpePath, the harmonizer registry, the indexer base — so
// queries returned zero rows with no error. Normalization happens in the
// LOADER, because that is what feeds createClient; resolveProfile normalizes
// too, since it is pure and callable on a profile no loader touched.
// ---------------------------------------------------------------------------
describe('identity.instance — trailing slash normalization', () => {
  const build = (identity, env) =>
    createProfile({
      profile: { ...authored, identity: { ...authored.identity, ...identity } },
      schema,
      env,
    }).getProfile()

  it('appends a missing trailing slash to an authored instance', () => {
    expect(build({ instance: 'https://example.test' }).identity.instance).toBe('https://example.test/')
  })

  it('leaves an already-slashed instance alone', () => {
    expect(build({ instance: 'https://example.test/' }).identity.instance).toBe('https://example.test/')
  })

  it('normalizes a bare-origin env override, which is how the bug shipped', () => {
    const p = build({ instance: 'https://authored.test/' }, { instance: 'https://override.test' })
    expect(p.identity.instance).toBe('https://override.test/')
  })

  it('preserves a path-bearing instance and still normalizes it', () => {
    expect(build({ instance: 'https://example.test/relay' }).identity.instance).toBe(
      'https://example.test/relay/'
    )
  })

  it('yields exactly one slash in the minted term prefix', () => {
    const instance = build({ instance: 'https://example.test' }).identity.instance
    expect(`${instance}~/cats`).toBe('https://example.test/~/cats')
  })

  it('normalizes in the projection too, for profiles that skipped the loader', () => {
    const out = resolveProfile({
      profile: { ...profile, identity: { ...profile.identity, instance: 'https://raw.test' } },
    })
    expect(out.identity.instance).toBe('https://raw.test/')
  })
})

describe('identity.terms — absolutized like every other identity URL', () => {
  const resolveWith = (identity) =>
    resolveProfile({ profile: { ...profile, identity: { ...profile.identity, ...identity } } })

  it('resolves a relative terms prefix against instance', () => {
    expect(resolveWith({ instance: 'https://example.test/', terms: '~/' }).identity.terms).toBe(
      'https://example.test/~/'
    )
  })

  it('resolves a relative terms prefix against a normalized bare-origin instance', () => {
    expect(resolveWith({ instance: 'https://example.test', terms: '~/' }).identity.terms).toBe(
      'https://example.test/~/'
    )
  })

  it('passes an absolute terms through untouched, even when its origin differs', () => {
    // Deliberate: a future federation case may point terms at another origin,
    // so a divergent absolute value is authorial intent, not an error.
    expect(
      resolveWith({ instance: 'https://example.test/', terms: 'https://other.test/~/' }).identity.terms
    ).toBe('https://other.test/~/')
  })

  it('derives the convention default for a profile with no terms at all', () => {
    const { terms, ...rest } = profile.identity
    expect(resolveProfile({ profile: { ...profile, identity: rest } }).identity.terms).toBe(
      'https://example.test/~/'
    )
  })

  it('accepts a relative terms through the loader, and absolutizes it end to end', () => {
    // identity.terms was format:'uri', so a relative prefix was rejected at
    // load time and the absolutize path above was unreachable in practice.
    // It is uri-reference now — instance stays 'uri', since it must be absolute.
    const loaded = createProfile({
      profile: { ...authored, identity: { ...authored.identity, terms: '~/' } },
      schema,
      env: { instance: 'https://override.test' },
    }).getProfile()
    expect(resolveProfile({ profile: loaded }).identity.terms).toBe('https://override.test/~/')
  })

  it('still rejects a relative instance, which must be absolute', () => {
    expect(() =>
      createProfile({
        profile: { ...authored, identity: { ...authored.identity, instance: '/relay' } },
        schema,
      }).getProfile()
    ).toThrow(/schema validation/)
  })

  it('does not absolutize contact values, which are not URLs', () => {
    const out = resolveWith({ contact: { email: 'hi@example.test', fediverse: '@op@example.test' } })
    expect(out.identity.contact.email).toBe('hi@example.test')
    expect(out.identity.contact.fediverse).toBe('@op@example.test')
  })
})

describe('identity.terms — convention default', () => {
  const load = (identity, env) => {
    const { terms, ...base } = authored.identity
    return createProfile({
      profile: { ...authored, identity: { ...base, ...identity } },
      schema,
      env,
    }).getProfile()
  }

  it('defaults an undeclared terms to instance + "~/"', () => {
    expect(load({ instance: 'https://example.test/' }).identity.terms).toBe('https://example.test/~/')
  })

  it('derives from the NORMALIZED instance, so a bare origin still yields one slash', () => {
    expect(load({ instance: 'https://example.test' }).identity.terms).toBe('https://example.test/~/')
  })

  it('derives from the env override, not the authored instance', () => {
    const p = load({ instance: 'https://authored.test/' }, { instance: 'https://override.test' })
    expect(p.identity.terms).toBe('https://override.test/~/')
  })

  it('never overrides an authored terms, including a divergent origin', () => {
    expect(load({ terms: 'https://other.test/~/' }).identity.terms).toBe('https://other.test/~/')
  })

  it('matches what octothorpes new scaffolds for the same instance', async () => {
    const { scaffoldProfile } = await import('octothorpes')
    expect(load({ instance: 'https://example.test' }).identity.terms).toBe(
      scaffoldProfile({ instance: 'https://example.test', name: 'Example' }).identity.terms
    )
  })
})
