import { describe, it, expect } from 'vitest'
import { harmonizeSource } from 'octothorpes'

describe('Terms on Relationships - Integration', () => {
  const fullHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>My Bookmarks Page</title>
        <meta name="description" content="A collection of bookmarks">
      </head>
      <body>
        <h1>My Bookmarks</h1>
        <ul>
          <li>
            <a rel="octo:bookmarks" data-octothorpes="gadgets,bikes" href="https://example.com/bike-gadgets">
              Bike Gadgets Review
            </a>
          </li>
          <li>
            <a rel="octo:bookmarks" data-octothorpes="recipes,vegetarian" href="https://example.com/veggie-recipes">
              Vegetarian Recipes
            </a>
          </li>
          <li>
            <a rel="octo:cites" data-octothorpes="methodology,criticism" href="https://example.com/paper">
              Cited Paper
            </a>
          </li>
          <li>
            <a rel="octo:bookmarks" href="https://example.com/no-tags">
              Bookmark without tags
            </a>
          </li>
        </ul>
        <octo-thorpe>page-level-tag</octo-thorpe>
      </body>
    </html>
  `

  it('should extract multiple bookmarks with different terms', async () => {
    const result = await harmonizeSource(fullHtml)

    expect(result.title).toBe('My Bookmarks Page')

    // Find bookmarks
    const bookmarks = result.octothorpes.filter(o => o.type === 'bookmark')
    expect(bookmarks.length).toBe(3)

    // Check bike-gadgets bookmark
    const bikeBookmark = bookmarks.find(b => b.uri.includes('bike-gadgets'))
    expect(bikeBookmark.terms).toContain('gadgets')
    expect(bikeBookmark.terms).toContain('bikes')

    // Check veggie-recipes bookmark
    const veggieBookmark = bookmarks.find(b => b.uri.includes('veggie-recipes'))
    expect(veggieBookmark.terms).toContain('recipes')
    expect(veggieBookmark.terms).toContain('vegetarian')

    // Check no-tags bookmark
    const noTagsBookmark = bookmarks.find(b => b.uri.includes('no-tags'))
    expect(noTagsBookmark.terms).toBeUndefined()
  })

  it('should extract citation with terms', async () => {
    const result = await harmonizeSource(fullHtml)

    const cite = result.octothorpes.find(o => o.type === 'cite')
    expect(cite).toBeDefined()
    expect(cite.terms).toContain('methodology')
    expect(cite.terms).toContain('criticism')
  })

  it('should still extract page-level hashtags', async () => {
    const result = await harmonizeSource(fullHtml)

    const hashtags = result.octothorpes.filter(o => typeof o === 'string')
    expect(hashtags).toContain('page-level-tag')
  })

  it('should handle mixed link types with and without terms', async () => {
    const mixedHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>Mixed Links</title></head>
        <body>
          <a rel="octo:bookmarks" data-octothorpes="tech" href="https://example.com/tech">Tech</a>
          <a rel="octo:cites" href="https://example.com/paper">Paper without terms</a>
          <a rel="octo:octothorpes" data-octothorpes="tools" href="https://example.com/tools">Tools</a>
        </body>
      </html>
    `

    const result = await harmonizeSource(mixedHtml)

    // Bookmark with terms
    const bookmark = result.octothorpes.find(o => o.type === 'bookmark')
    expect(bookmark.terms).toContain('tech')

    // Citation without terms
    const cite = result.octothorpes.find(o => o.type === 'cite')
    expect(cite).toBeDefined()
    expect(cite.terms).toBeUndefined()

    // Link with terms
    const link = result.octothorpes.find(o => o.type === 'link')
    expect(link.terms).toContain('tools')
  })

  it('should handle whitespace in comma-separated terms', async () => {
    const htmlWithSpaces = `
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body>
          <a rel="octo:bookmarks" data-octothorpes="  spaced , terms  ,  here  " href="https://example.com/page">Link</a>
        </body>
      </html>
    `

    const result = await harmonizeSource(htmlWithSpaces)
    const bookmark = result.octothorpes.find(o => o.type === 'bookmark')

    expect(bookmark.terms).toContain('spaced')
    expect(bookmark.terms).toContain('terms')
    expect(bookmark.terms).toContain('here')
  })
})
