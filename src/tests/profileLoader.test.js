import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createProfile, PROFILE_DEFAULTS, OCTO_VOCABULARY_IRI } from 'octothorpes'

// #217 Rev 2 loader. Framework-agnostic: schema, profile object and env are all
// injected. This suite NEVER reads the committed octothorpes.json — it owns its
// fixtures so the committed file can be re-authored without breaking the loader.

const here = dirname(fileURLToPath(import.meta.url))
const schema = JSON.parse(
  readFileSync(resolve(here, '../../packages/core/profile.schema.json'), 'utf8')
)

const fixture = () => ({
  identity: {
    instance: 'https://authored.test/',
    name: 'Fixture Relay',
    terms: 'https://authored.test/~/',
    feeds: { thorpes: ['cats'] },
  },
  policies: { access: { registration: 'closed', whitelist: { domains: ['https://friend.test'] } } },
  api: { publishers: { dir: './src/lib/publishers' } },
  vocabulary: {
    namespaces: [{ prefix: 'skos', iri: 'http://www.w3.org/2004/02/skos/core#', import: true }],
  },
})

const load = (profile, env, readFile) => createProfile({ profile, schema, env, readFile }).getProfile()

// #217 task-2 note: several "defaults filling" checks below exercise a bare
// `{}` authored profile with no env. createProfile requires SOME instance
// (either authored or env — see "instance precedence" below and the
// `identity.instance` contract in the task brief), so those calls need an
// env-supplied instance to reach the defaults-filling assertions at all. The
// instance value itself is incidental to what each of those tests checks.
const withInstance = { instance: 'https://x.test/' }

describe('createProfile — defaults filling', () => {
  it('an empty authored profile still yields a fully populated object', () => {
    const p = load({}, withInstance)
    expect(p.identity.feeds).toEqual({})
    expect(p.identity.images).toEqual({})
    expect(p.identity.contact).toEqual({})
    expect(p.policies.commercial).toBe(false)
    expect(p.policies.labels).toEqual([])
    expect(p.policies.indexing.mode).toBe('request')
    expect(p.policies.access.registration).toBe('registered')
    expect(p.policies.access.blocks).toEqual({ domains: [], terms: [] })
    expect(p.policies.access.whitelist).toEqual({ domains: [] })
    expect(p.api.linkTypes).toEqual([])
    expect(p.api.documentRecord).toEqual([])
    expect(p.api.publishers.named).toEqual([])
    expect(p.api.handlers.default).toBe('html')
    expect(p.api.handlers.named).toEqual([])
    expect(p.api.harmonizers.named).toEqual([])
    expect(p.vocabulary.namespaces).toEqual([])
  })

  it('defaults the two policy axes independently', () => {
    // Defaulting one axis must never imply anything about the other.
    const p = load({ policies: { indexing: { mode: 'active' } } }, withInstance)
    expect(p.policies.indexing.mode).toBe('active')
    expect(p.policies.access.registration).toBe('registered')

    const q = load({ policies: { access: { registration: 'open' } } }, withInstance)
    expect(q.policies.indexing.mode).toBe('request')
    expect(q.policies.access.registration).toBe('open')
  })

  it('no longer carries a defaultHandler under api.harmonizers', () => {
    expect(load({}, withInstance).api.harmonizers.defaultHandler).toBeUndefined()
  })

  it('vocabulary.octo defaults to the canonical vocabulary IRI', () => {
    expect(load({}, withInstance).vocabulary.octo).toBe('https://vocab.octothorp.es#')
    expect(OCTO_VOCABULARY_IRI).toBe('https://vocab.octothorp.es#')
  })

  it('an authored vocabulary.octo overrides the default (forking vocabulary identity)', () => {
    const p = load({ vocabulary: { octo: 'https://fork.test/vocab#' } }, withInstance)
    expect(p.vocabulary.octo).toBe('https://fork.test/vocab#')
  })

  it('authored values survive defaults merging', () => {
    const p = load(fixture())
    expect(p.identity.name).toBe('Fixture Relay')
    expect(p.policies.access.registration).toBe('closed')
    expect(p.policies.access.whitelist).toEqual({ domains: ['https://friend.test'] })
    expect(p.identity.feeds.thorpes).toEqual(['cats'])
    expect(p.vocabulary.namespaces).toHaveLength(1)
    expect(p.vocabulary.namespaces[0].import).toBe(true)
  })

  it('fills the per-item `import` default on declared namespaces', () => {
    const p = load({ vocabulary: { namespaces: [{ prefix: 'ex', iri: 'https://ex.test/' }] } }, withInstance)
    expect(p.vocabulary.namespaces[0].import).toBe(false)
  })

  it('does not mutate the injected profile object', () => {
    const authored = fixture()
    const snapshot = JSON.parse(JSON.stringify(authored))
    load(authored)
    expect(authored).toEqual(snapshot)
  })

  it('PROFILE_DEFAULTS is not shared by reference with the result', () => {
    const p = load({}, withInstance)
    p.policies.access.blocks.domains.push('mutated.test')
    expect(PROFILE_DEFAULTS.policies.access.blocks.domains).toEqual([])
    expect(load({}, withInstance).policies.access.blocks.domains).toEqual([])
  })

  it('getProfile() is stable across calls', () => {
    const { getProfile } = createProfile({ profile: fixture(), schema })
    expect(getProfile()).toBe(getProfile())
  })
})

describe('createProfile — blocklist expansion', () => {
  const withAccess = (access) => ({ identity: { instance: 'https://x.test/' }, policies: { access } })

  it('passes an array-form blocklist through untouched', () => {
    const p = load(withAccess({ blocks: { domains: ['bad.test'], terms: ['someslur'] } }))
    expect(p.policies.access.blocks.domains).toEqual(['bad.test'])
    expect(p.policies.access.blocks.terms).toEqual(['someslur'])
  })

  it('expands a path-form blocklist by reading and parsing the file', () => {
    const readFile = vi.fn(() => JSON.stringify(['bad.test', 'worse.test']))
    const p = load(withAccess({ blocks: { domains: './blocklists/domains.json' } }), {}, readFile)
    expect(readFile).toHaveBeenCalledWith('./blocklists/domains.json')
    expect(p.policies.access.blocks.domains).toEqual(['bad.test', 'worse.test'])
  })

  it('expands every array-or-path slot, including whitelist.domains', () => {
    const readFile = vi.fn((path) =>
      JSON.stringify(path.includes('terms') ? ['someslur'] : ['https://friend.test'])
    )
    const p = load(
      withAccess({
        registration: 'closed',
        blocks: { terms: './blocklists/terms.json' },
        whitelist: { domains: './blocklists/allow.json' },
      }),
      {},
      readFile
    )
    expect(p.policies.access.blocks.terms).toEqual(['someslur'])
    expect(p.policies.access.whitelist.domains).toEqual(['https://friend.test'])
  })

  it('surfaces the expanded array, never the path', () => {
    const p = load(withAccess({ blocks: { domains: './b.json' } }), {}, () => '["bad.test"]')
    expect(typeof p.policies.access.blocks.domains).not.toBe('string')
  })

  it('throws when a declared blocklist file is missing — never a silent empty list', () => {
    const readFile = () => { throw new Error('ENOENT: no such file or directory') }
    expect(() => load(withAccess({ blocks: { domains: './missing.json' } }), {}, readFile))
      .toThrow(/blocks\.domains|missing\.json/i)
  })

  it('throws when a blocklist file is unparseable', () => {
    expect(() => load(withAccess({ blocks: { terms: './bad.json' } }), {}, () => '{nope'))
      .toThrow(/blocks\.terms|bad\.json/i)
  })

  it('throws when the parsed file is not an array of strings', () => {
    expect(() => load(withAccess({ blocks: { domains: './b.json' } }), {}, () => '{"a":1}'))
      .toThrow(/array of strings/i)
  })

  it('throws when a path is declared but no readFile dependency was injected', () => {
    expect(() => load(withAccess({ blocks: { domains: './b.json' } }))).toThrow(/readFile/i)
  })

  it('does not call readFile at all when every list is inline', () => {
    const readFile = vi.fn()
    load(withAccess({ blocks: { domains: ['bad.test'] } }), {}, readFile)
    expect(readFile).not.toHaveBeenCalled()
  })
})

describe('createProfile — instance precedence', () => {
  it('uses the authored identity.instance when no env override is present', () => {
    expect(load(fixture(), {}).identity.instance).toBe('https://authored.test/')
  })

  it('env.instance wins over the authored value', () => {
    const p = load(fixture(), { instance: 'https://staging.test/' })
    expect(p.identity.instance).toBe('https://staging.test/')
  })

  it('an empty-string env.instance does not clobber the authored value', () => {
    expect(load(fixture(), { instance: '' }).identity.instance).toBe('https://authored.test/')
  })

  it('env.instance alone is enough (authored instance may be absent)', () => {
    expect(load({}, { instance: 'https://only-env.test/' }).identity.instance)
      .toBe('https://only-env.test/')
  })

  it('throws when neither authored nor env supplies an instance', () => {
    expect(() => load({}, {})).toThrow(/instance/i)
  })
})

describe('createProfile — validation and guards', () => {
  it('rejects an authored profile with an unknown top-level key', () => {
    expect(() => load({ nonsense: true }, { instance: 'https://x.test/' }))
      .toThrow(/schema validation/i)
  })

  it('rejects the old flat shape outright', () => {
    expect(() => load({ name: 'Octothorpes', relay: null }, { instance: 'https://x.test/' }))
      .toThrow(/schema validation/i)
  })

  it('fires the no-secrets guard before schema validation', () => {
    expect(() => createProfile({
      profile: { identity: { contact: { apiToken: 'nope' } } },
      schema,
      env: { instance: 'https://x.test/' },
    })).toThrow(/secret-shaped key/i)
  })

  it('requires a profile object and a schema object', () => {
    expect(() => createProfile({ schema })).toThrow(/profile/i)
    expect(() => createProfile({ profile: {} })).toThrow(/schema/i)
  })
})

describe('createProfile — access-gate coherence warnings', () => {
  const warned = (authored) => {
    const warn = vi.fn()
    createProfile({
      profile: { identity: { instance: 'https://x.test/' }, ...authored },
      schema,
      warn,
    }).getProfile()
    return warn.mock.calls.flat().join(' ')
  }

  it('warns when blocks.domains is set outside open mode (it is inert there)', () => {
    expect(warned({ policies: { access: { registration: 'registered', blocks: { domains: ['bad.test'] } } } }))
      .toMatch(/blocks\.domains/i)
    expect(warned({ policies: { access: { registration: 'closed', blocks: { domains: ['bad.test'] }, whitelist: { domains: ['https://f.test'] } } } }))
      .toMatch(/blocks\.domains/i)
  })

  it('does not warn about blocks.domains in open mode', () => {
    expect(warned({ policies: { access: { registration: 'open', blocks: { domains: ['bad.test'] } } } }))
      .not.toMatch(/blocks/i)
  })

  it('NEVER warns about blocks.terms — it applies in every registration mode', () => {
    // A relay refuses a slur term regardless of how its origin gate is
    // configured, so blocks.terms carries no mode restriction to warn about.
    for (const registration of ['registered', 'open', 'closed']) {
      expect(warned({
        policies: {
          access: {
            registration,
            blocks: { terms: ['someslur'] },
            whitelist: { domains: ['https://f.test'] },
          },
        },
      })).not.toMatch(/terms/i)
    }
  })

  it('warns when closed mode has an empty whitelist.domains (nothing can be indexed)', () => {
    expect(warned({ policies: { access: { registration: 'closed' } } })).toMatch(/whitelist/i)
  })

  it('does not warn on a coherent closed configuration', () => {
    expect(warned({ policies: { access: { registration: 'closed', whitelist: { domains: ['https://f.test'] } } } }))
      .toBe('')
  })

  it('warns rather than throws — a schema-valid profile always loads', () => {
    expect(() => createProfile({
      profile: { identity: { instance: 'https://x.test/' }, policies: { access: { registration: 'closed' } } },
      schema,
      warn: () => {},
    }).getProfile()).not.toThrow()
  })
})
