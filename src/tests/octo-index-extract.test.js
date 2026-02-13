import { describe, it, expect } from 'vitest'
import { JSDOM } from 'jsdom'
import { extractBlobject } from '$lib/octo-index/extract.js'

const makeDocument = (html) => {
  const dom = new JSDOM(html)
  return dom.window.document
}

describe('extractBlobject', () => {
  const server = 'https://octothorp.es'

  it('should extract @id from canonical URL', () => {
    const doc = makeDocument(`
      <html><head>
        <link rel="canonical" href="https://example.com/page">
      </head><body></body></html>
    `)
    const result = extractBlobject(doc, server, 'https://example.com/page')
    expect(result['@id']).toBe('https://example.com/page')
  })

  it('should fall back to provided URL for @id', () => {
    const doc = makeDocument(`<html><head></head><body></body></html>`)
    const result = extractBlobject(doc, server, 'https://example.com/page')
    expect(result['@id']).toBe('https://example.com/page')
  })

  it('should extract title from <title> element', () => {
    const doc = makeDocument(`
      <html><head><title>My Page</title></head><body></body></html>
    `)
    const result = extractBlobject(doc, server, 'https://example.com/page')
    expect(result.title).toBe('My Page')
  })

  it('should extract description from meta tag', () => {
    const doc = makeDocument(`
      <html><head>
        <meta name="description" content="A great page">
      </head><body></body></html>
    `)
    const result = extractBlobject(doc, server, 'https://example.com/page')
    expect(result.description).toBe('A great page')
  })

  it('should extract image from og:image meta tag', () => {
    const doc = makeDocument(`
      <html><head>
        <meta property="og:image" content="https://example.com/img.jpg">
      </head><body></body></html>
    `)
    const result = extractBlobject(doc, server, 'https://example.com/page')
    expect(result.image).toBe('https://example.com/img.jpg')
  })

  it('should extract hashtags from <octo-thorpe> elements', () => {
    const doc = makeDocument(`
      <html><body>
        <octo-thorpe>cooking</octo-thorpe>
        <octo-thorpe>brownies</octo-thorpe>
      </body></html>
    `)
    const result = extractBlobject(doc, server, 'https://example.com/page')
    expect(result.octothorpes).toContain('cooking')
    expect(result.octothorpes).toContain('brownies')
  })

  it('should extract hashtags from anchor links to ~/term', () => {
    const doc = makeDocument(`
      <html><body>
        <a rel="octo:octothorpes" href="https://octothorp.es/~/demo">demo</a>
      </body></html>
    `)
    const result = extractBlobject(doc, server, 'https://example.com/page')
    expect(result.octothorpes).toContain('demo')
  })

  it('should extract link-type octothorpes', () => {
    const doc = makeDocument(`
      <html><body>
        <a rel="octo:octothorpes" href="https://other.com/page">Other</a>
      </body></html>
    `)
    const result = extractBlobject(doc, server, 'https://example.com/page')
    const link = result.octothorpes.find(o => typeof o === 'object' && o.type === 'link')
    expect(link).toBeDefined()
    expect(link.uri).toBe('https://other.com/page')
  })

  it('should extract bookmark-type octothorpes', () => {
    const doc = makeDocument(`
      <html><body>
        <a rel="octo:bookmarks" href="https://bookmarked.com">Saved</a>
      </body></html>
    `)
    const result = extractBlobject(doc, server, 'https://example.com/page')
    const bookmark = result.octothorpes.find(o => typeof o === 'object' && o.type === 'bookmark')
    expect(bookmark).toBeDefined()
    expect(bookmark.uri).toBe('https://bookmarked.com')
  })

  it('should extract cite-type octothorpes', () => {
    const doc = makeDocument(`
      <html><body>
        <a rel="octo:cites" href="https://cited.com">Source</a>
      </body></html>
    `)
    const result = extractBlobject(doc, server, 'https://example.com/page')
    const cite = result.octothorpes.find(o => typeof o === 'object' && o.type === 'cite')
    expect(cite).toBeDefined()
    expect(cite.uri).toBe('https://cited.com')
  })

  it('should extract endorse-type octothorpes', () => {
    const doc = makeDocument(`
      <html><body>
        <a rel="octo:endorses" href="https://endorsed.com">Trusted</a>
      </body></html>
    `)
    const result = extractBlobject(doc, server, 'https://example.com/page')
    const endorse = result.octothorpes.find(o => typeof o === 'object' && o.type === 'endorse')
    expect(endorse).toBeDefined()
    expect(endorse.uri).toBe('https://endorsed.com')
  })

  it('should return empty octothorpes when page has none', () => {
    const doc = makeDocument(`<html><body><p>Nothing here</p></body></html>`)
    const result = extractBlobject(doc, server, 'https://example.com/page')
    expect(result.octothorpes).toEqual([])
  })

  it('should extract link rel octothorpes from head', () => {
    const doc = makeDocument(`
      <html><head>
        <link rel="octo:octothorpes" href="https://octothorp.es/~/headtag">
      </head><body></body></html>
    `)
    const result = extractBlobject(doc, server, 'https://example.com/page')
    expect(result.octothorpes).toContain('headtag')
  })
})
