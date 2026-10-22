import { describe, it, expect } from 'vitest'
import { buildVocabulary } from '../../packages/core/vocabulary.js'
import { renderHtml, turtleResponse, jsonLdResponse, htmlResponse } from '../routes/vocabulary/render.js'

const vocab = buildVocabulary({
  identity: { instance: 'https://example.test/' },
  api: { documentRecord: [], linkTypes: [] },
  vocabulary: { octo: 'https://vocab.octothorp.es#', namespaces: [] },
})

describe('#324 vocabulary format paths', () => {
  it('the HTML view links to the format paths, not to itself', () => {
    const html = renderHtml(vocab)
    expect(html).toContain('href="https://example.test/vocabulary.ttl"')
    expect(html).toContain('href="https://example.test/vocabulary.jsonld"')
    // The old self-referential links relied on a `type` attribute browsers
    // ignore, so clicking either one just reloaded the HTML page.
    expect(html).not.toContain('href="https://example.test/vocabulary"')
  })

  it('both rel=alternate tags point at the format paths', () => {
    const html = renderHtml(vocab)
    expect(html).toContain('<link rel="alternate" type="text/turtle" href="https://example.test/vocabulary.ttl">')
    expect(html).toContain('<link rel="alternate" type="application/ld+json" href="https://example.test/vocabulary.jsonld">')
  })

  it('serves each serialization with its own content type', async () => {
    const ttl = turtleResponse(vocab)
    expect(ttl.headers.get('content-type')).toBe('text/turtle; charset=utf-8')
    expect(await ttl.text()).toContain('@prefix rdfs:')

    const jsonld = jsonLdResponse(vocab)
    expect(jsonld.headers.get('content-type')).toBe('application/ld+json; charset=utf-8')
    expect(JSON.parse(await jsonld.text())).toHaveProperty('@graph')

    expect(htmlResponse(vocab).headers.get('content-type')).toBe('text/html; charset=utf-8')
  })
})
