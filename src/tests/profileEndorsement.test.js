import { describe, it, expect, vi } from 'vitest'
import Ajv from 'ajv'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createProfile } from '../../packages/core/profile.js'
import { ACCESS_DEFAULTS, normalizeAccess } from '../../packages/core/access.js'
import { createClient } from '../../packages/core/client.js'

// Week of 2026-09-14 §0 — the endorsement schema stub. Schema + plumbing only:
// nothing here enforces anything, and no gate consumes `endorsers` yet.

const insertSpy = vi.fn().mockResolvedValue(true)
vi.mock('../../packages/core/sparqlClient.js', () => ({
  createSparqlClient: () => ({
    insert: insertSpy,
    query: vi.fn().mockResolvedValue(true),
    queryBoolean: vi.fn().mockResolvedValue(true),
    queryArray: vi.fn().mockResolvedValue({ results: { bindings: [] } }),
  }),
}))

const here = dirname(fileURLToPath(import.meta.url))
const schema = JSON.parse(
  readFileSync(resolve(here, '../../packages/core/profile.schema.json'), 'utf8')
)

const validate = new Ajv({ allErrors: true }).compile(schema)
const withEndorsement = (endorsement) => ({ policies: { access: { endorsement } } })

describe('schema — policies.access.endorsement', () => {
  it('accepts an empty object, an empty sources list and a named source', () => {
    expect(validate(withEndorsement({}))).toBe(true)
    expect(validate(withEndorsement({ sources: [] }))).toBe(true)
    expect(validate(withEndorsement({ sources: ['bear-marker'] }))).toBe(true)
  })

  it('rejects an unknown property under endorsement', () => {
    // additionalProperties: false — the deferred keys (#288: depth, record,
    // autoRegister) must fail loudly rather than be silently ignored.
    expect(validate(withEndorsement({ sources: [], depth: 2 }))).toBe(false)
  })

  it('rejects a non-string sources item', () => {
    expect(validate(withEndorsement({ sources: [{ name: 'bear-marker' }] }))).toBe(false)
  })
})

describe('defaults — an absent endorsement block', () => {
  it('ACCESS_DEFAULTS carries sources: []', () => {
    expect(ACCESS_DEFAULTS.endorsement).toEqual({ sources: [] })
  })

  it('normalizeAccess fills it when absent', () => {
    expect(normalizeAccess().endorsement).toEqual({ sources: [] })
    expect(normalizeAccess({ registration: 'open' }).endorsement).toEqual({ sources: [] })
  })

  it('normalizeAccess copies an authored list rather than aliasing it', () => {
    const authored = ['bear-marker']
    const normalized = normalizeAccess({ endorsement: { sources: authored } })
    expect(normalized.endorsement.sources).toEqual(['bear-marker'])
    expect(normalized.endorsement.sources).not.toBe(authored)
  })

  it('the profile loader resolves an absent block to sources: []', () => {
    const warn = vi.fn()
    const p = createProfile({
      profile: { identity: { instance: 'https://x.test/' } },
      schema,
      warn,
    }).getProfile()
    expect(p.policies.access.endorsement).toEqual({ sources: [] })
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('coherence warnings — warn, never throw', () => {
  const load = (access, endorsers, warn) =>
    createProfile({
      profile: { identity: { instance: 'https://x.test/' }, policies: { access } },
      schema,
      warn,
      endorsers,
    }).getProfile()

  it('warns that sources is inert under open', () => {
    const warn = vi.fn()
    expect(() =>
      load({ registration: 'open', endorsement: { sources: ['bear-marker'] } }, [
        { name: 'bear-marker', endorse: async () => false },
      ], warn)
    ).not.toThrow()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('endorsement.sources is non-empty'))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('inert in this mode'))
  })

  it('warns that sources is inert under closed', () => {
    const warn = vi.fn()
    load(
      {
        registration: 'closed',
        whitelist: { domains: ['https://friend.test'] },
        endorsement: { sources: ['bear-marker'] },
      },
      [{ name: 'bear-marker', endorse: async () => false }],
      warn
    )
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('endorsement.sources is non-empty'))
  })

  it('warns on a source with no matching injected endorser', () => {
    const warn = vi.fn()
    expect(() =>
      load({ registration: 'registered', endorsement: { sources: ['nope'] } }, [], warn)
    ).not.toThrow()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"nope"'))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no matching injected endorser'))
  })

  it('does not warn when every source resolves under registered', () => {
    const warn = vi.fn()
    load({ registration: 'registered', endorsement: { sources: ['bear-marker'] } }, [
      { name: 'bear-marker', endorse: async () => false },
    ], warn)
    expect(warn).not.toHaveBeenCalled()
  })

  it('accepts bare name strings as the injected endorser list', () => {
    const warn = vi.fn()
    load({ registration: 'registered', endorsement: { sources: ['bear-marker'] } }, ['bear-marker'], warn)
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('createClient({ endorsers })', () => {
  const base = { instance: 'https://x.test/', sparql: { endpoint: 'https://sparql.test/' } }

  it('behaves as before with no endorsers key', () => {
    const client = createClient({ ...base })
    expect(client.endorsers).toEqual([])
    expect(typeof client.get).toBe('function')
    expect(typeof client.indexSource).toBe('function')
  })

  it('stores the injected endorsers and does nothing else with them', () => {
    const bear = { name: 'bear-marker', endorse: async () => true }
    const client = createClient({ ...base, endorsers: [bear] })
    expect(client.endorsers).toEqual([bear])
    expect(typeof client.get).toBe('function')
  })

  it('throws on a bad endorser shape', () => {
    expect(() => createClient({ ...base, endorsers: 'bear-marker' })).toThrow(/must be an array/)
    expect(() => createClient({ ...base, endorsers: [{ endorse: () => {} }] })).toThrow(/string `name`/)
    expect(() => createClient({ ...base, endorsers: [{ name: '', endorse: () => {} }] })).toThrow(/string `name`/)
    expect(() => createClient({ ...base, endorsers: [{ name: 'bear-marker' }] })).toThrow(/`endorse` function/)
  })

  it('throws on a duplicate endorser name', () => {
    expect(() =>
      createClient({
        ...base,
        endorsers: [
          { name: 'bear-marker', endorse: () => {} },
          { name: 'bear-marker', endorse: () => {} },
        ],
      })
    ).toThrow(/duplicate endorser name/)
  })
})
