import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import Ajv from 'ajv'
import {
  normalizeAccess,
  subjectSchemeMode,
  createProfile,
} from 'octothorpes'
import { createIndexer } from '../../packages/core/indexer.js'

// #241: profile-declared origin schemes. Non-http(s) subjects (file:,
// obsidian:) have no URL origin — `new URL(s).origin` is the string "null",
// which Oxigraph base-resolves into a junk origin node. The fix is
// DECLARATION, not detection: a client lists its non-http(s) schemes in
// policies.access.allows.schemes. Declared-scheme subjects write their
// relationship triples but skip every origin side-effect; an undeclared
// non-http scheme is rejected outright. http(s) is unchanged.

const here = dirname(fileURLToPath(import.meta.url))
const schema = JSON.parse(
  readFileSync(resolve(here, '../../packages/core/profile.schema.json'), 'utf8')
)
const ajv = new Ajv({ allErrors: true })
const validate = ajv.compile(schema)

describe('profile schema: policies.access.allows.schemes (#241)', () => {
  it('accepts an array of scheme-name strings', () => {
    expect(validate({ policies: { access: { allows: { schemes: ['file', 'obsidian'] } } } })).toBe(true)
  })

  it('accepts an empty array', () => {
    expect(validate({ policies: { access: { allows: { schemes: [] } } } })).toBe(true)
  })

  it('rejects a scheme written with its colon', () => {
    expect(validate({ policies: { access: { allows: { schemes: ['file:'] } } } })).toBe(false)
  })

  it('rejects a full URI in place of a scheme name', () => {
    expect(validate({ policies: { access: { allows: { schemes: ['file:///notes.md'] } } } })).toBe(false)
  })

  it('still rejects unknown sub-keys of allows (closed contract)', () => {
    expect(validate({ policies: { access: { allows: { protocols: ['file'] } } } })).toBe(false)
  })
})

describe('normalizeAccess: allows.schemes', () => {
  it('defaults to an empty schemes list', () => {
    expect(normalizeAccess().allows.schemes).toEqual([])
  })

  it('carries declared schemes through, lowercased', () => {
    expect(normalizeAccess({ allows: { schemes: ['file', 'Obsidian'] } }).allows.schemes)
      .toEqual(['file', 'obsidian'])
  })

  it('copies rather than aliasing the caller array', () => {
    const input = { allows: { schemes: ['file'] } }
    const out = normalizeAccess(input)
    out.allows.schemes.push('mutated')
    expect(input.allows.schemes).toEqual(['file'])
  })
})

describe('subjectSchemeMode', () => {
  it('http and https subjects take the origin path', () => {
    expect(subjectSchemeMode('http://foo.test/page', [])).toBe('origin')
    expect(subjectSchemeMode('https://foo.test/page', ['file'])).toBe('origin')
  })

  it('a declared non-http scheme skips origin side-effects', () => {
    expect(subjectSchemeMode('file:///notes.md', ['file'])).toBe('declared')
    expect(subjectSchemeMode('obsidian://open?vault=x', ['file', 'obsidian'])).toBe('declared')
  })

  it('an undeclared non-http scheme is rejected with a clear error', () => {
    expect(() => subjectSchemeMode('file:///notes.md', []))
      .toThrow(/scheme "file:" is not declared in policies\.access\.allows\.schemes/)
    expect(() => subjectSchemeMode('obsidian://open', ['file']))
      .toThrow(/obsidian/)
  })
})

describe('profile loader surfaces allows.schemes', () => {
  const load = (profile) => createProfile({
    profile,
    schema,
    env: { instance: 'https://x.test/' },
  }).getProfile()

  it('authored schemes appear in the loaded profile', () => {
    const p = load({ policies: { access: { allows: { schemes: ['file'] } } } })
    expect(p.policies.access.allows.schemes).toEqual(['file'])
  })

  it('an absent schemes list defaults to empty (no non-http schemes allowed)', () => {
    const p = load({})
    expect(p.policies.access.allows.schemes).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Indexer write path, mocked SPARQL deps (mirrors canonicalOrigin.test.js).
// ---------------------------------------------------------------------------

const instance = 'http://localhost:5173/'
const mockInsert = vi.fn()
const mockQuery = vi.fn()
const mockQueryArray = vi.fn()

const makeIndexer = ({ queryBoolean = vi.fn(async () => false), access } = {}) => createIndexer({
  insert: mockInsert,
  query: mockQuery,
  queryBoolean,
  queryArray: mockQueryArray,
  instance,
  access,
})

const inserted = () => mockInsert.mock.calls.map((c) => c[0]).join('\n')

beforeEach(() => {
  vi.clearAllMocks()
  mockQueryArray.mockResolvedValue({ results: { bindings: [] } })
})

describe('handleMention write path by subject scheme (#241)', () => {
  it('http(s) subjects keep every origin side-effect', async () => {
    const indexer = makeIndexer()
    await indexer.handleMention('https://foo.test/page', 'https://bar.test/x', 'Alias')
    const out = inserted()
    expect(out).toContain('<https://foo.test/page> octo:octothorpes <https://bar.test/x>')
    expect(out).toContain('<https://foo.test> octo:hasPart <https://foo.test/page>')
    expect(out).toContain('<https://foo.test> octo:verified "true"')
    expect(out).toContain('<https://foo.test> rdf:type <octo:Origin>')
  })

  it('a declared-scheme subject writes relationship triples but NO origin side-effects', async () => {
    const indexer = makeIndexer({ access: { allows: { schemes: ['file'] } } })
    await indexer.handleMention('file:///notes.md', 'https://rentry.co/x', 'Alias')
    const out = inserted()
    // The relationship itself: flat mention plus the typed blank node.
    expect(out).toContain('<file:///notes.md> octo:octothorpes <https://rentry.co/x>')
    expect(out).toContain('rdf:type <octo:Alias>')
    // No origin side-effects: no hasPart, no verified, no octo:Origin node,
    // and above all no relative <null> IRI for Oxigraph to base-resolve.
    expect(out).not.toContain('octo:hasPart')
    expect(out).not.toContain('octo:verified')
    expect(out).not.toContain('<octo:Origin>')
    expect(out).not.toContain('<null>')
  })

  it('a declared-scheme subject is typed octo:Page so /get can see it (read-path fix)', async () => {
    // /get's query shape REQUIRES `?s rdf:type ?pageType`; a subject written
    // through handleMention alone never got a type triple, which is exactly
    // why file: subjects vanished from /get output.
    const indexer = makeIndexer({ access: { allows: { schemes: ['file'] } } })
    await indexer.handleMention('file:///notes.md', 'https://rentry.co/x', 'Alias')
    expect(inserted()).toContain('<file:///notes.md> rdf:type <octo:Page>')
  })

  it('an already-extant mention still backfills the subject type triple', async () => {
    // Re-linking heals pre-#241 data: subjects stored without rdf:type get it
    // on the next handleMention even though the mention block is skipped.
    const queryBoolean = vi.fn(async (q) =>
      q.includes('<file:///notes.md> octo:octothorpes <https://rentry.co/x>') && !q.includes('_:backlink'))
    const indexer = makeIndexer({ queryBoolean, access: { allows: { schemes: ['file'] } } })
    await indexer.handleMention('file:///notes.md', 'https://rentry.co/x', 'Alias')
    const out = inserted()
    expect(out).toContain('<file:///notes.md> rdf:type <octo:Page>')
    expect(out).not.toContain('octo:hasPart')
  })

  it('an UNDECLARED non-http scheme is rejected and writes nothing', async () => {
    const indexer = makeIndexer({ access: { allows: { schemes: ['file'] } } })
    await expect(indexer.handleMention('obsidian://open?vault=x', 'https://bar.test/x', 'Alias'))
      .rejects.toThrow(/scheme "obsidian:" is not declared/)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('with no declared schemes, every non-http subject is rejected (junk <null> can never be minted)', async () => {
    const indexer = makeIndexer()
    await expect(indexer.handleMention('file:///notes.md', 'https://bar.test/x', 'Alias'))
      .rejects.toThrow(/allows\.schemes/)
    expect(mockInsert).not.toHaveBeenCalled()
  })
})

describe('handleThorpe write path by subject scheme (#241)', () => {
  it('http(s) subjects keep origin side-effects', async () => {
    const indexer = makeIndexer()
    await indexer.handleThorpe('https://foo.test/page', 'cats')
    const out = inserted()
    expect(out).toContain('<https://foo.test> octo:hasPart <https://foo.test/page>')
    expect(out).toContain('<https://foo.test> rdf:type <octo:Origin>')
  })

  it('a declared-scheme subject thorpes without origin side-effects', async () => {
    const indexer = makeIndexer({ access: { allows: { schemes: ['file'] } } })
    await indexer.handleThorpe('file:///notes.md', 'cats')
    const out = inserted()
    expect(out).toContain('~/cats')
    expect(out).toContain('<file:///notes.md> rdf:type <octo:Page>')
    expect(out).not.toContain('octo:hasPart')
    expect(out).not.toContain('octo:verified')
    expect(out).not.toContain('<null>')
  })

  it('an undeclared scheme is rejected before any write', async () => {
    const indexer = makeIndexer()
    await expect(indexer.handleThorpe('file:///notes.md', 'cats'))
      .rejects.toThrow(/allows\.schemes/)
    expect(mockInsert).not.toHaveBeenCalled()
  })
})

describe('ingestBlobject gate (#241)', () => {
  it('rejects a blobject whose @id carries an undeclared scheme', async () => {
    const indexer = makeIndexer()
    await expect(indexer.ingestBlobject({ '@id': 'obsidian://open?vault=x', octothorpes: [] }))
      .rejects.toThrow(/scheme "obsidian:" is not declared/)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('ingests a declared-scheme blobject with links, minting no origin node', async () => {
    const indexer = makeIndexer({ access: { allows: { schemes: ['file'] } } })
    await indexer.ingestBlobject({
      '@id': 'file:///notes.md',
      title: 'Notes',
      octothorpes: [{ type: 'link', uri: 'https://rentry.co/x' }],
    })
    const out = inserted()
    expect(out).toContain('<file:///notes.md> octo:octothorpes <https://rentry.co/x>')
    expect(out).not.toContain('octo:hasPart')
    expect(out).not.toContain('<octo:Origin>')
    expect(out).not.toContain('<null>')
  })

  it('a per-call access override declares schemes for that call only', async () => {
    const indexer = makeIndexer()
    await indexer.ingestBlobject(
      { '@id': 'file:///notes.md', octothorpes: [] },
      { access: normalizeAccess({ allows: { schemes: ['file'] } }) }
    )
    expect(inserted()).toContain('<file:///notes.md> octo:created')
  })
})
