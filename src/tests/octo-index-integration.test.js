import { describe, it, expect } from 'vitest'
import { JSDOM } from 'jsdom'
import { extractBlobject } from '$lib/octo-index/extract.js'
import { validateBlobject } from '$lib/validateBlobject.js'

describe('octo-index integration', () => {
  it('should produce a valid blobject from a page with octothorpes', () => {
    const html = `
      <html>
      <head>
        <title>Test Recipe</title>
        <meta name="description" content="A delicious test recipe">
        <meta property="og:image" content="https://example.com/recipe.jpg">
      </head>
      <body>
        <octo-thorpe>cooking</octo-thorpe>
        <octo-thorpe>brownies</octo-thorpe>
        <a rel="octo:octothorpes" href="https://octothorp.es/~/dessert">dessert</a>
        <a rel="octo:bookmarks" href="https://other.com/page">Saved</a>
      </body>
      </html>
    `
    const dom = new JSDOM(html)
    const doc = dom.window.document

    const blobject = extractBlobject(doc, 'https://octothorp.es', 'https://example.com/recipe')

    // Verify structure
    expect(blobject['@id']).toBe('https://example.com/recipe')
    expect(blobject.title).toBe('Test Recipe')
    expect(blobject.description).toBe('A delicious test recipe')
    expect(blobject.image).toBe('https://example.com/recipe.jpg')

    // Verify octothorpes
    expect(blobject.octothorpes).toContain('cooking')
    expect(blobject.octothorpes).toContain('brownies')
    expect(blobject.octothorpes).toContain('dessert')
    const bookmark = blobject.octothorpes.find(o => o.type === 'bookmark')
    expect(bookmark).toBeDefined()
    expect(bookmark.uri).toBe('https://other.com/page')

    // Validate with the server's validator
    const validation = validateBlobject(blobject)
    expect(validation.valid).toBe(true)
  })

  it('should produce valid POST body shape', () => {
    const dom = new JSDOM(`<html><head><title>Test</title></head><body>
      <octo-thorpe>tag1</octo-thorpe>
    </body></html>`)
    const doc = dom.window.document
    const blobject = extractBlobject(doc, 'https://octothorp.es', 'https://example.com/page')

    const postBody = {
      uri: blobject['@id'],
      as: 'blobject',
      blobject
    }

    expect(postBody.uri).toBe('https://example.com/page')
    expect(postBody.as).toBe('blobject')
    expect(postBody.blobject['@id']).toBe(postBody.uri)
    expect(validateBlobject(postBody.blobject).valid).toBe(true)
  })
})
