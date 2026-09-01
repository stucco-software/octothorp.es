import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import Ajv from 'ajv'

// #217 Rev 2: the authored profile is a CLOSED contract. This suite pins the
// shape with its own fixtures; the only read of the committed octothorpes.json
// is the contract check that it still validates and carries no secrets.

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')

const schema = JSON.parse(
  readFileSync(resolve(repoRoot, 'packages/core/profile.schema.json'), 'utf8')
)

const ajv = new Ajv({ allErrors: true })
const validate = ajv.compile(schema)

const strip$schema = (o) => { const { $schema, ...rest } = o; return rest }

describe('authored profile schema (#217 Rev 2)', () => {
  it('accepts a minimal profile (every block optional)', () => {
    expect(validate({})).toBe(true)
  })

  it('accepts the full nested shape', () => {
    const ok = validate({
      identity: {
        instance: 'https://example.test/',
        name: 'Example',
        description: 'An example relay.',
        terms: 'https://example.test/~/',
        feeds: { thorpes: ['cats'], multipass: 'https://example.test/feed.json' },
        images: { favicon: '/favicon.ico', avatar: '/avatar.png' },
        contact: { email: 'admin@example.test' },
      },
      policies: {
        commercial: false,
        indexing: { mode: 'request', frequency: 'hourly' },
        access: {
          registration: 'open',
          badge: '/badge.png',
          blocks: { domains: ['bad.test'], terms: ['someslur'] },
          whitelist: { domains: [] },
        },
      },
      api: {
        linkTypes: [{ type: 'Item', label: 'Item', path: 'items' }],
        documentRecord: [{ predicate: 'encodingFormat', namespace: 'schema', range: 'literal' }],
        publishers: { dir: './src/lib/publishers', named: [] },
        handlers: { dir: './src/lib/handlers', default: 'html', named: [] },
        harmonizers: { dir: './src/lib/harmonizers', named: [] },
      },
      vocabulary: {
        octo: 'https://vocab.octothorp.es#',
        namespaces: [{ prefix: 'skos', iri: 'http://www.w3.org/2004/02/skos/core#', import: true }],
      },
      federation: {},
    })
    if (!ok) console.error(validate.errors)
    expect(ok).toBe(true)
  })

  it('rejects unknown top-level keys', () => {
    expect(validate({ nonsense: true })).toBe(false)
  })

  it('rejects the OLD flat shape (relay/name/vocabulary.relationshipSubtypes)', () => {
    expect(validate({ name: 'Octothorpes', relay: null })).toBe(false)
    expect(validate({ vocabulary: { relationshipSubtypes: [] } })).toBe(false)
  })

  it('accepts every registration gate value', () => {
    for (const registration of ['registered', 'open', 'closed']) {
      expect(validate({ policies: { access: { registration } } })).toBe(true)
    }
  })

  it("rejects the dropped 'invite' registration value", () => {
    // 'closed' + whitelist IS invite-only; there is no alias or shim.
    expect(validate({ policies: { access: { registration: 'invite' } } })).toBe(false)
  })

  it('rejects an unknown policies.access.registration value', () => {
    expect(validate({ policies: { access: { registration: 'maybe' } } })).toBe(false)
  })

  it('accepts both indexing modes and rejects the retired on-request spelling', () => {
    expect(validate({ policies: { indexing: { mode: 'request' } } })).toBe(true)
    expect(validate({ policies: { indexing: { mode: 'active' } } })).toBe(true)
    expect(validate({ policies: { indexing: { mode: 'on-request' } } })).toBe(false)
  })

  it('keeps the two policy axes distinct — a gate value is not an indexing mode', () => {
    // policies.indexing.mode answers "what triggers indexing";
    // policies.access.registration answers "what gate must it pass".
    expect(validate({ policies: { indexing: { mode: 'registered' } } })).toBe(false)
    expect(validate({ policies: { access: { registration: 'request' } } })).toBe(false)
  })

  it('admits all six axis combinations', () => {
    for (const mode of ['request', 'active']) {
      for (const registration of ['registered', 'open', 'closed']) {
        expect(validate({ policies: { indexing: { mode }, access: { registration } } })).toBe(true)
      }
    }
  })

  it('accepts blocks/whitelist sub-keys as either an array of strings or a path string', () => {
    // Blocklists get long and are often maintained as a separate, sometimes
    // shared, file — so both value forms are first-class in the contract.
    expect(validate({ policies: { access: { blocks: { domains: ['bad.test'] } } } })).toBe(true)
    expect(validate({ policies: { access: { blocks: { domains: './blocklists/domains.json' } } } })).toBe(true)
    expect(validate({ policies: { access: { blocks: { terms: ['someslur'] } } } })).toBe(true)
    expect(validate({ policies: { access: { blocks: { terms: './blocklists/terms.json' } } } })).toBe(true)
    expect(validate({ policies: { access: { whitelist: { domains: ['https://friend.test'] } } } })).toBe(true)
    expect(validate({ policies: { access: { whitelist: { domains: './allow.json' } } } })).toBe(true)
  })

  it('rejects the OLD flat array form of blocks and whitelist', () => {
    expect(validate({ policies: { access: { blocks: ['bad.test'] } } })).toBe(false)
    expect(validate({ policies: { access: { whitelist: ['https://friend.test'] } } })).toBe(false)
  })

  it('rejects unknown sub-keys, and a terms allowlist in particular', () => {
    // A terms ALLOWLIST is a different product decision with no current use
    // case — deliberately absent from whitelist rather than reserved.
    expect(validate({ policies: { access: { whitelist: { terms: ['ok'] } } } })).toBe(false)
    expect(validate({ policies: { access: { blocks: { hosts: [] } } } })).toBe(false)
  })

  it('rejects a non-string item inside either list form', () => {
    expect(validate({ policies: { access: { blocks: { domains: [1] } } } })).toBe(false)
    expect(validate({ policies: { access: { blocks: { terms: [{}] } } } })).toBe(false)
  })

  it('puts the default handler under api.handlers, not api.harmonizers', () => {
    expect(validate({ api: { handlers: { default: 'html' } } })).toBe(true)
    expect(validate({ api: { harmonizers: { defaultHandler: 'html' } } })).toBe(false)
  })

  it('rejects an unknown documentRecord range', () => {
    expect(validate({
      api: { documentRecord: [{ predicate: 'x', namespace: 'schema', range: 'blob' }] },
    })).toBe(false)
  })

  it('requires prefix and iri on a declared namespace', () => {
    expect(validate({ vocabulary: { namespaces: [{ prefix: 'skos' }] } })).toBe(false)
  })

  it('accepts feeds slots as either a url string or an array of term names', () => {
    expect(validate({ identity: { feeds: { thorpes: 'https://example.test/feed' } } })).toBe(true)
    expect(validate({ identity: { feeds: { thorpes: ['a', 'b'] } } })).toBe(true)
  })
})

describe('committed octothorpes.json contract', () => {
  const committed = JSON.parse(readFileSync(resolve(repoRoot, 'octothorpes.json'), 'utf8'))

  it('validates against the promoted schema', () => {
    const ok = validate(strip$schema(committed))
    if (!ok) console.error(validate.errors)
    expect(ok).toBe(true)
  })

  it('carries no secret-shaped keys', () => {
    const keys = []
    const walk = (n) => {
      if (Array.isArray(n)) return n.forEach(walk)
      if (n && typeof n === 'object') for (const [k, v] of Object.entries(n)) { keys.push(k); walk(v) }
    }
    walk(committed)
    expect(keys.some((k) => /key|secret|token|password|credential/i.test(k))).toBe(false)
  })
})
