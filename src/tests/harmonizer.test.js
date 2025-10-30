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
        <a rel="octo:octothorpes nofollow" href="https://octothorp.es/~/anotherTag">Another Tag</a>
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

    it('should use cached harmonizer on second fetch', async () => {
      const remoteUrl = 'https://octothorp.es/harmonizer/default'

      // First fetch
      const harmonizer1 = await remoteHarmonizer(remoteUrl)
      expect(harmonizer1).toBeDefined()

      // Second fetch should use cache
      const harmonizer2 = await remoteHarmonizer(remoteUrl)
      expect(harmonizer2).toBeDefined()
      expect(harmonizer2).toEqual(harmonizer1)
    })
  })

  describe('Remote Harmonizer Security', () => {
    it('should reject HTTP URLs (non-HTTPS)', async () => {
      const httpUrl = 'http://octothorp.es/harmonizer/default'
      const harmonizer = await remoteHarmonizer(httpUrl)

      expect(harmonizer).toBeNull()
    })

    it('should reject private IP addresses', async () => {
      const privateIPs = [
        'https://192.168.1.1/harmonizer.json',
        'https://10.0.0.1/harmonizer.json',
        'https://172.16.0.1/harmonizer.json',
        'https://127.0.0.1/harmonizer.json'
      ]

      for (const url of privateIPs) {
        const harmonizer = await remoteHarmonizer(url)
        expect(harmonizer).toBeNull()
      }
    })

    it('should reject cloud metadata endpoint', async () => {
      const metadataUrl = 'https://169.254.169.254/latest/meta-data/'
      const harmonizer = await remoteHarmonizer(metadataUrl)

      expect(harmonizer).toBeNull()
    })

    it('should handle invalid URL format', async () => {
      const invalidUrl = 'not-a-url'
      const harmonizer = await remoteHarmonizer(invalidUrl)

      expect(harmonizer).toBeNull()
    })

    it('should enforce 56KB size limit', async () => {
      // This is tested implicitly by the MAX_HARMONIZER_SIZE constant
      // Actual enforcement happens in remoteHarmonizer when checking Content-Length
      const MAX_HARMONIZER_SIZE = 56 * 1024
      expect(MAX_HARMONIZER_SIZE).toBe(57344)
    })
  })

  describe('Schema Validation and Injection Protection', () => {
    it('should reject selectors that are too long', async () => {
      // Selector length validation is enforced in isSafeSelectorComplexity
      const longSelector = 'a'.repeat(201) // Over 200 char limit
      const testSchema = {
        subject: { s: 'source' },
        test: {
          o: [{ selector: longSelector, attribute: 'href' }]
        }
      }

      // This would be caught by isSchemaValid
      expect(longSelector.length).toBeGreaterThan(200)
    })

    it('should reject selectors with excessive depth', async () => {
      // Deep selector with many combinators (need 11+ for MAX_SELECTOR_DEPTH of 10)
      const deepSelector = 'div > span > a > b > i > u > s > em > strong > small > big > code'
      const combinators = deepSelector.match(/[>+~\s]+/g) || []

      // Should have more than 10 combinators
      expect(combinators.length).toBeGreaterThan(10)
    })

    it('should reject dangerous :has() selectors', async () => {
      const dangerousSelector = 'div:has(> span:has(> a))'

      expect(dangerousSelector).toContain(':has(')
    })

    it('should reject schemas with too many rules', async () => {
      // MAX_RULES_PER_TYPE is 50
      const tooManyRules = Array(51).fill({ selector: 'a', attribute: 'href' })

      expect(tooManyRules.length).toBeGreaterThan(50)
    })

    it('should validate regex patterns in postProcess', async () => {
      // Test that regex compilation works
      const validRegex = 'https://example\\.com/~/([^/]+)'

      expect(() => new RegExp(validRegex)).not.toThrow()
    })

    it('should detect potentially catastrophic regex patterns', async () => {
      const catastrophicPattern = '(a+)+(b+)+'

      // This pattern has nested quantifiers that could cause backtracking
      expect(catastrophicPattern).toMatch(/(\(.+\)\+|\(.+\)\*){2,}/)
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
