import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createProfile, PROFILE_DEFAULTS, OCTO_VOCABULARY_IRI, resolveProfile } from 'octothorpes'

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
    expect(p.api.publishers.dir).toBeNull()
    expect(p.api.handlers.default).toBe('html')
    // `named` was dropped 2026-09-15 — it is not a default any more.
    expect(p.api.publishers.named).toBeUndefined()
    expect(p.api.handlers.named).toBeUndefined()
    expect(p.api.harmonizers.named).toBeUndefined()
    expect(p.vocabulary.namespaces).toEqual([])
  })

  it('resolves both an empty and an absent documentRecord to [] without warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(load({ api: { documentRecord: [] } }, withInstance).api.documentRecord).toEqual([])
      expect(load({ api: {} }, withInstance).api.documentRecord).toEqual([])
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
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

// 2026-09-15 — `type` is an accepted alias for `range` on documentRecord
// entries. The loader normalises it BEFORE schema validation, so the schema
// only ever sees `range` and the resolved profile always carries `range`.
describe('createProfile — documentRecord range/type alias', () => {
  const withRecord = (entry) => ({ api: { documentRecord: [entry] } })

  it('accepts `range` and passes it through', () => {
    const p = load(withRecord({ predicate: 'wordCount', range: 'number' }), withInstance)
    expect(p.api.documentRecord).toEqual([{ predicate: 'wordCount', range: 'number' }])
  })

  it('accepts `type` and normalises it to `range`', () => {
    const p = load(withRecord({ predicate: 'wordCount', type: 'number' }), withInstance)
    expect(p.api.documentRecord).toEqual([{ predicate: 'wordCount', range: 'number' }])
    expect(p.api.documentRecord[0].type).toBeUndefined()
  })

  it('validates the aliased value against the range enum', () => {
    expect(() => load(withRecord({ predicate: 'wordCount', type: 'boolean' }), withInstance)).toThrow(
      /schema validation/
    )
  })

  it('rejects declaring both, by name, before ajv gets a chance', () => {
    expect(() =>
      load(withRecord({ predicate: 'wordCount', range: 'number', type: 'number' }), withInstance)
    ).toThrow(/declares both `range` and `type`/)
  })

  it('rejects declaring neither', () => {
    expect(() => load(withRecord({ predicate: 'wordCount' }), withInstance)).toThrow(
      /declares neither `range` nor its alias `type`/
    )
  })

  it('names the offending index', () => {
    expect(() =>
      load(
        { api: { documentRecord: [{ predicate: 'ok', range: 'literal' }, { predicate: 'bad' }] } },
        withInstance
      )
    ).toThrow(/documentRecord\[1\]/)
  })

  it('does not mutate the authored object', () => {
    const authored = withRecord({ predicate: 'wordCount', type: 'number' })
    load(authored, withInstance)
    expect(authored.api.documentRecord[0]).toEqual({ predicate: 'wordCount', type: 'number' })
  })
})

// 2026-09-15 — api.*.named dropped from schema AND defaults.
describe('createProfile — api.*.named is gone', () => {
  it('throws on a profile still declaring it', () => {
    expect(() => load({ api: { publishers: { dir: './p', named: [] } } }, withInstance)).toThrow(
      /schema validation/
    )
  })
})

// 2026-09-15 — policies.labels has a real item shape and is passed through.
describe('createProfile — policies.labels', () => {
  it('defaults to []', () => {
    expect(load({}, withInstance).policies.labels).toEqual([])
  })

  it('passes a declared list through unchanged', () => {
    const labels = [
      { id: 'nsfw', name: 'Not safe for work' },
      { id: 'ai_generated', name: 'AI generated', description: 'Machine-authored text.' },
    ]
    expect(load({ policies: { labels } }, withInstance).policies.labels).toEqual(labels)
  })

  it('rejects a malformed label', () => {
    expect(() => load({ policies: { labels: [{ id: 'nsfw' }] } }, withInstance)).toThrow(/schema validation/)
    expect(() => load({ policies: { labels: [{ id: 'not ok', name: 'x' }] } }, withInstance)).toThrow(
      /schema validation/
    )
    expect(() => load({ policies: { labels: ['nsfw'] } }, withInstance)).toThrow(/schema validation/)
  })
})

// 2026-09-15 — the builtin namespace set is octo/rdf/rdfs. `schema` was demoted
// to declare-if-you-want-it alongside foaf; nothing in the protocol needs it
// now that documentRecord predicates are octo-only.
describe('resolved vocabulary.namespaces builtins', () => {
  it('is octo, rdf and rdfs when nothing is declared', () => {
    const resolved = resolveProfile({ profile: load({}, withInstance) })
    expect(resolved.vocabulary.namespaces.map((n) => n.prefix).sort()).toEqual(['octo', 'rdf', 'rdfs'])
    expect(resolved.vocabulary.namespaces.every((n) => n.source === 'builtin')).toBe(true)
  })

  it('appends declared namespaces to the builtins', () => {
    const resolved = resolveProfile({ profile: load(fixture(), {}) })
    expect(resolved.vocabulary.namespaces.map((n) => n.prefix)).toEqual(['octo', 'rdf', 'rdfs', 'skos'])
    expect(resolved.vocabulary.namespaces.find((n) => n.prefix === 'skos').source).toBe('declared')
  })

  it('takes schema only when declared', () => {
    const resolved = resolveProfile({
      profile: load({ vocabulary: { namespaces: [{ prefix: 'schema', iri: 'https://schema.org/' }] } }, withInstance),
    })
    const schema = resolved.vocabulary.namespaces.find((n) => n.prefix === 'schema')
    expect(schema).toEqual({ prefix: 'schema', iri: 'https://schema.org/', import: false, source: 'declared' })
  })
})
