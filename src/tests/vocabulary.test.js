import { describe, it, expect } from 'vitest'
import {
  buildVocabulary,
  vocabularyToJsonLd,
  vocabularyToTurtle,
  RANGE_TO_RDFS,
} from '../../packages/core/vocabulary.js'

const OCTO = 'https://vocab.octothorp.es#'
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#'
const XSD = 'http://www.w3.org/2001/XMLSchema#'

const resolved = {
  identity: { instance: 'https://example.test/' },
  api: {
    documentRecord: [
      { predicate: 'wordCount', range: 'number' },
      { predicate: 'canonicalUrl', range: 'uri' },
      { predicate: 'summary', range: 'literal' },
      { predicate: 'reviewedAt', range: 'timestamp' },
    ],
    linkTypes: [
      { by: 'backlinked', objects: 'pages', subtype: 'Backlink', relationTerms: true, source: 'builtin' },
      { by: 'reviewed', objects: 'notTerms', subtype: 'Review', relationTerms: true, label: 'Reviewed', source: 'declared' },
    ],
  },
  vocabulary: { octo: OCTO },
}

describe('buildVocabulary', () => {
  const vocab = buildVocabulary(resolved)

  it('describes declared documentRecord predicates with full-IRI RDFS terms', () => {
    const wc = vocab.properties.find((p) => p.iri === `${OCTO}wordCount`)
    expect(wc).toBeDefined()
    expect(wc.type).toBe('http://www.w3.org/1999/02/22-rdf-syntax-ns#Property')
    expect(wc.label).toBe('wordCount')
    expect(wc.range).toBe(`${XSD}decimal`)
    expect(wc.isDefinedBy).toBe('https://example.test/')
    expect(wc.source).toBe('declared')
  })

  it('maps every profile range per the issue mapping', () => {
    expect(RANGE_TO_RDFS.literal).toBe(`${RDFS}Literal`)
    expect(RANGE_TO_RDFS.uri).toBe(`${XSD}anyURI`)
    expect(RANGE_TO_RDFS.timestamp).toBe(`${XSD}dateTime`)
    expect(RANGE_TO_RDFS.number).toBe(`${XSD}decimal`)
  })

  it('describes declared link-type subtypes as subclasses of octo:Link', () => {
    const review = vocab.classes.find((c) => c.iri === `${OCTO}Review`)
    expect(review).toBeDefined()
    expect(review.subClassOf).toContain(`${OCTO}Link`)
    expect(review.label).toBe('Reviewed')
    expect(review.source).toBe('declared')
  })

  it('does not duplicate a builtin subtype already in the core registry', () => {
    const backlinks = vocab.classes.filter((c) => c.iri === `${OCTO}Backlink`)
    expect(backlinks).toHaveLength(1)
    expect(backlinks[0].source).toBe('builtin')
  })

  it('includes core protocol classes, with Term subClassOf skos:Concept', () => {
    const term = vocab.classes.find((c) => c.iri === `${OCTO}Term`)
    expect(term.subClassOf).toContain('http://www.w3.org/2004/02/skos/core#Concept')
    for (const name of ['Page', 'Origin', 'Webring', 'Link']) {
      expect(vocab.classes.some((c) => c.iri === `${OCTO}${name}`)).toBe(true)
    }
  })

  it('includes core builtin predicates defined by the octo vocabulary, not the instance', () => {
    const octothorpes = vocab.properties.find((p) => p.iri === `${OCTO}octothorpes`)
    expect(octothorpes).toBeDefined()
    expect(octothorpes.isDefinedBy).toBe(OCTO)
    expect(octothorpes.source).toBe('builtin')
  })

  it('emits only canonical full IRIs and carries the legacy-spelling note', () => {
    const everything = [...vocab.classes, ...vocab.properties]
    for (const t of everything) {
      expect(t.iri.startsWith('https://') || t.iri.startsWith('http://')).toBe(true)
      expect(t.iri).not.toMatch(/^octo:/)
    }
    expect(vocab.note).toMatch(/legacy/i)
  })
})

describe('serializations', () => {
  const vocab = buildVocabulary(resolved)

  it('JSON-LD graph uses @id/@type with full IRIs', () => {
    const ld = vocabularyToJsonLd(vocab)
    expect(ld['@context'].rdfs).toBe(RDFS)
    const node = ld['@graph'].find((n) => n['@id'] === `${OCTO}wordCount`)
    expect(node['@type']).toBe('rdf:Property')
    expect(node['rdfs:range']['@id']).toBe(`${XSD}decimal`)
    expect(node['rdfs:isDefinedBy']['@id']).toBe('https://example.test/')
  })

  it('Turtle contains the declared property and subclass triples', () => {
    const ttl = vocabularyToTurtle(vocab)
    expect(ttl).toContain('<https://vocab.octothorp.es#wordCount> a rdf:Property')
    expect(ttl).toContain(`rdfs:range <${XSD}decimal>`)
    expect(ttl).toContain('<https://vocab.octothorp.es#Review> a rdfs:Class')
    expect(ttl).toContain('rdfs:subClassOf <https://vocab.octothorp.es#Link>')
  })
})
