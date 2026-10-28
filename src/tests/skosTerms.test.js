import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createIndexer } from '../../packages/core/indexer.js'
import { resolveDocumentRecordIri } from '../../packages/core/queryBuilders.js'
import { termIri, parseBindings } from '../../packages/core/utils.js'
import {
  SKOS_PREF_LABEL,
  termLabelTriples,
  backfillTermLabels,
} from '../../packages/core/termLabels.js'
import { buildVocabulary, SKOS_NS } from '../../packages/core/vocabulary.js'
import prefixes from '../../packages/core/ld/prefixes.js'
import { getBlobjectFromResponse } from '../../packages/core/blobject.js'

const instance = 'http://localhost:5173/'
const SKOS = 'http://www.w3.org/2004/02/skos/core#'

describe('#286 SKOS terms', () => {
  const mockInsert = vi.fn()
  const makeIndexer = () => createIndexer({
    insert: mockInsert,
    query: vi.fn(),
    queryBoolean: async () => false,
    queryArray: vi.fn(),
    instance,
  })
  beforeEach(() => vi.clearAllMocks())

  it('skos:prefLabel is the full SKOS IRI', () => {
    expect(SKOS_PREF_LABEL).toBe(`${SKOS}prefLabel`)
  })

  it('the static SPARQL prologue carries the skos: prefix (#315 cheap path)', () => {
    expect(prefixes).toContain(`PREFIX skos: <${SKOS}>`)
  })

  it('the served vocabulary declares Term rdfs:subClassOf skos:Concept', () => {
    // Owned by vocabulary.js (#291) — NOT re-emitted as instance data.
    const vocab = buildVocabulary({ identity: { instance } })
    const term = vocab.classes.find((c) => c.label === 'Term')
    expect(term.subClassOf).toContain(`${SKOS_NS}Concept`)
  })

  it.each(['cats', 'site changes', 'café', '日本語', '100%', 'say "hi"'])(
    'createTerm emits verbatim prefLabel for %s', async (name) => {
      await makeIndexer().createTerm(name)
      const q = mockInsert.mock.calls[0][0]
      const escaped = name.replace(/"/g, '\\"')
      expect(q).toContain(`<${termIri(instance, name)}> <${SKOS_PREF_LABEL}> "${escaped}" .`)
    })

  it('termLabelTriples escapes literal-breaking characters', () => {
    const t = termLabelTriples('http://x/~/a', 'a\\b\nc')
    expect(t).toContain(`"a\\\\b\\nc"`)
  })

  it('batched term creation (handleMention path) emits prefLabel', async () => {
    const indexer = makeIndexer()
    await indexer.handleMention('https://example.com/p', 'https://example.org/q', 'Bookmark', ['site changes', 'naïve'], { instance })
    const all = mockInsert.mock.calls.map(c => c[0]).join('\n')
    expect(all).toContain(`<${SKOS_PREF_LABEL}> "site changes"`)
    expect(all).toContain(`<${SKOS_PREF_LABEL}> "naïve"`)
  })

  it('octo:prefLabel (documentRecord) never collides with skos:prefLabel', () => {
    const octo = resolveDocumentRecordIri({ predicate: 'prefLabel' })
    expect(octo).toBe('https://vocab.octothorp.es#prefLabel')
    expect(octo).not.toBe(SKOS_PREF_LABEL)
  })
})

describe('#286 backfill', () => {
  // Tiny in-memory store: term IRIs -> label (or undefined).
  const makeStore = (iris) => {
    const labels = new Map(iris.map(i => [i, undefined]))
    const inserts = []
    return {
      labels,
      inserts,
      queryArray: async () => ({
        results: { bindings: [...labels].filter(([, l]) => l === undefined).map(([t]) => ({ t: { value: t } })) },
      }),
      insert: async (q) => {
        inserts.push(q)
        for (const m of q.matchAll(/<([^>]+)> <[^>]*prefLabel> "((?:[^"\\]|\\.)*)"/g)) labels.set(m[1], m[2])
      },
    }
  }

  it('decodes percent-encoded IRIs and is idempotent', async () => {
    const store = makeStore([`${instance}~/site%20changes`, `${instance}~/caf%C3%A9`, `${instance}~/100%25`])
    const first = await backfillTermLabels(store, { write: true })
    expect(first.map(r => r.label)).toEqual(['site changes', 'café', '100%'])
    expect(store.labels.get(`${instance}~/caf%C3%A9`)).toBe('café')
    const second = await backfillTermLabels(store, { write: true })
    expect(second).toEqual([])
    expect(store.inserts.length).toBe(1)
  })

  it('dry run reports but writes nothing', async () => {
    const store = makeStore([`${instance}~/a%20b`])
    const r = await backfillTermLabels(store, { write: false })
    expect(r).toEqual([{ iri: `${instance}~/a%20b`, label: 'a b' }])
    expect(store.inserts.length).toBe(0)
  })
})

describe('#286 rendering prefers prefLabel', () => {
  it('parseBindings terms mode uses the label binding over the slug', () => {
    const out = parseBindings([{ o: { value: `${instance}~/weird%2Fslug` }, label: { value: 'Real Label' } }], 'terms')
    expect(out[0].term).toBe('Real Label')
  })

  it('parseBindings terms mode falls back to decoded slug', () => {
    const out = parseBindings([{ o: { value: `${instance}~/site%20changes` } }], 'terms')
    expect(out[0].term).toBe('site changes')
  })

  it('blobject octothorpes use the label binding when present', async () => {
    const res = { results: { bindings: [{
      s: { value: 'https://example.com/p' },
      o: { value: `${instance}~/site%20changes` },
      oType: { value: 'octo:Term' },
      oLabel: { value: 'Site Changes' },
    }] } }
    const blobs = await getBlobjectFromResponse(res)
    expect(blobs[0].octothorpes).toContain('Site Changes')
  })
})

vi.mock('$lib/sparql.js', () => ({
  queryBoolean: vi.fn(),
  queryArray: vi.fn(async (q) => {
    if (q.includes('skos/core#prefLabel')) {
      return { results: { bindings: [{ label: { value: 'Site Changes!' } }] } }
    }
    return { results: { bindings: [] } }
  }),
}))
vi.mock('$lib/profile.js', () => ({ getProfile: () => ({ identity: { instance: 'http://localhost:5173/' } }) }))

describe('#286 /~/[thorpe] page', () => {
  it('a percent-encoded term renders its prefLabel, not its slug', async () => {
    const { load } = await import('../routes/~/[thorpe]/load.js')
    const data = await load({ params: { thorpe: 'site%20changes' } })
    expect(data.label).toBe('Site Changes!')
  })
})
