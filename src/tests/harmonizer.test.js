import { describe, it, expect, beforeAll } from 'vitest'
import { harmonizeSource, remoteHarmonizer } from '$lib/harmonizeSource.js'
import { getHarmonizer } from '$lib/getHarmonizer.js'

describe('External Harmonizer Support', () => {
  // Sample HTML for testing
  const sampleHTML = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Test Page</title>
        <meta name="description" content="A test page for harmonizer testing">
        <meta property="og:title" content="OpenGraph Title">
        <meta property="og:description" content="OpenGraph Description">
        <meta property="og:image" content="https://example.com/image.jpg">
        <meta name="keywords" content="keyword1,keyword2,keyword3">
      </head>
      <body>
        <h1>Test Page</h1>
        <octo-thorpe>testTag</octo-thorpe>
        <a rel="octo:octothorpes" href="https://octothorp.es/~/anotherTag">Another Tag</a>
        <a rel="octo:octothorpes" href="https://example.com/page">External Link</a>
      </body>
    </html>
  `

  describe('Default Harmonizer', () => {
    it('should extract basic metadata using default harmonizer', async () => {
      const result = await harmonizeSource(sampleHTML)
      
      expect(result).toBeDefined()
      expect(result.title).toBe('Test Page')
      expect(result.description).toBe('A test page for harmonizer testing')
      expect(result.octothorpes).toBeDefined()
      expect(Array.isArray(result.octothorpes)).toBe(true)
    })

    it('should extract octothorpes from custom elements', async () => {
      const result = await harmonizeSource(sampleHTML)
      
      const hashtags = result.octothorpes.filter(o => 
        typeof o === 'string' || o.type === 'hashtag'
      )
      expect(hashtags.length).toBeGreaterThan(0)
      expect(hashtags.some(h => h === 'testTag' || h.uri === 'testTag')).toBe(true)
    })

    it('should extract links with rel=octo:octothorpes', async () => {
      const result = await harmonizeSource(sampleHTML)
      
      const links = result.octothorpes.filter(o => 
        o.type === 'link'
      )
      expect(links.length).toBeGreaterThan(0)
      expect(links.some(l => l.uri === 'https://example.com/page')).toBe(true)
    })
  })

  describe('OpenGraph Harmonizer', () => {
    it('should extract OpenGraph metadata when specified', async () => {
      const result = await harmonizeSource(sampleHTML, 'openGraph')
      
      expect(result).toBeDefined()
      expect(result.title).toBe('OpenGraph Title')
      expect(result.description).toBe('OpenGraph Description')
      expect(result.image).toBe('https://example.com/image.jpg')
    })

    it('should merge with default schema', async () => {
      const result = await harmonizeSource(sampleHTML, 'openGraph')
      
      // OpenGraph should override title/description but still extract octothorpes from default
      expect(result.title).toBe('OpenGraph Title')
      expect(result.octothorpes).toBeDefined()
      expect(Array.isArray(result.octothorpes)).toBe(true)
    })
  })

  describe('Keywords Harmonizer', () => {
    it('should extract keywords as hashtags', async () => {
      const result = await harmonizeSource(sampleHTML, 'keywords')
      
      // Keywords harmonizer returns array of keywords in octothorpes
      expect(result.octothorpes).toBeDefined()
      expect(Array.isArray(result.octothorpes)).toBe(true)
      
      // The split creates a nested array structure
      const flatKeywords = result.octothorpes.flat()
      expect(flatKeywords).toContain('keyword1')
      expect(flatKeywords).toContain('keyword2')
      expect(flatKeywords).toContain('keyword3')
    })

    it('should split comma-separated keywords', async () => {
      const result = await harmonizeSource(sampleHTML, 'keywords')
      
      // Flatten the nested array structure
      const flatKeywords = result.octothorpes.flat()
      
      // Should have at least 3 keywords
      expect(flatKeywords.length).toBeGreaterThanOrEqual(3)
    })
  })

  describe('Harmonizer Retrieval', () => {
    it('should retrieve default harmonizer', async () => {
      const harmonizer = await getHarmonizer('default')
      
      expect(harmonizer).toBeDefined()
      expect(harmonizer.title).toBe('Default Octothorpe Harmonizer')
      expect(harmonizer.schema).toBeDefined()
      expect(harmonizer.schema.subject).toBeDefined()
      expect(harmonizer.schema.hashtag).toBeDefined()
    })

    it('should retrieve openGraph harmonizer', async () => {
      const harmonizer = await getHarmonizer('openGraph')
      
      expect(harmonizer).toBeDefined()
      expect(harmonizer.title).toBe('Opengraph Protocol Harmonizer')
      expect(harmonizer.schema).toBeDefined()
      expect(harmonizer.schema.subject).toBeDefined()
    })

    it('should throw error for invalid harmonizer ID', async () => {
      await expect(getHarmonizer('nonexistent')).rejects.toThrow('Harmonizer not found')
    })

    it('should throw error for invalid harmonizer ID type', async () => {
      await expect(getHarmonizer(null)).rejects.toThrow('Invalid harmonizer ID')
      await expect(getHarmonizer(123)).rejects.toThrow('Invalid harmonizer ID')
    })
  })

  describe('Remote Harmonizer', () => {
    it('should fetch and validate remote harmonizer', async () => {
      const remoteUrl = 'https://octothorp.es/harmonizer/default'
      const harmonizer = await remoteHarmonizer(remoteUrl)
      
      expect(harmonizer).toBeDefined()
      expect(harmonizer.title).toBeDefined()
      expect(harmonizer.schema).toBeDefined()
      expect(harmonizer.schema.subject).toBeDefined()
    })

    it('should use remote harmonizer with harmonizeSource', async () => {
      const remoteUrl = 'https://octothorp.es/harmonizer/default'
      const result = await harmonizeSource(sampleHTML, remoteUrl)
      
      expect(result).toBeDefined()
      expect(result['@id']).toBeDefined()
      expect(result.octothorpes).toBeDefined()
      expect(Array.isArray(result.octothorpes)).toBe(true)
    })

    it('should return null for invalid remote harmonizer URL', async () => {
      const invalidUrl = 'https://example.com/nonexistent.json'
      const harmonizer = await remoteHarmonizer(invalidUrl)
      
      expect(harmonizer).toBeNull()
    })
  })

  describe('Harmonizer Parameter Flow', () => {
    it('should default to "default" harmonizer when no parameter provided', async () => {
      const result = await harmonizeSource(sampleHTML)
      
      expect(result.title).toBe('Test Page') // Uses <title>, not og:title
    })

    it('should use specified harmonizer when parameter provided', async () => {
      const result = await harmonizeSource(sampleHTML, 'openGraph')
      
      expect(result.title).toBe('OpenGraph Title') // Uses og:title
    })

    it('should accept harmonizer parameter as string', async () => {
      const harmonizer = 'openGraph'
      const result = await harmonizeSource(sampleHTML, harmonizer)
      
      expect(result.title).toBe('OpenGraph Title')
    })
  })
})
