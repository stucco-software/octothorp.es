import { describe, it, expect } from 'vitest'
import { 
  deslash, 
  getUnixDateFromString, 
  parseBindings, 
  parseDateStrings, 
  isSparqlSafe, 
  cleanInputs, 
  areUrlsFuzzy, 
  getFuzzyTags 
} from './utils.js'

describe('deslash', () => {
  it('should remove trailing slash from URL', () => {
    expect(deslash('https://example.com/')).toBe('https://example.com')
    expect(deslash('https://example.com/path/')).toBe('https://example.com/path')
  })

  it('should not modify URLs without trailing slash', () => {
    expect(deslash('https://example.com')).toBe('https://example.com')
    expect(deslash('https://example.com/path')).toBe('https://example.com/path')
  })

  it('should handle empty and invalid inputs', () => {
    expect(deslash('')).toBe('')
    expect(deslash(null)).toBe('')
    expect(deslash(undefined)).toBe('')
    expect(deslash(123)).toBe('')
  })
})

describe('getUnixDateFromString', () => {
  it('should convert Unix timestamp to seconds', () => {
    expect(getUnixDateFromString('1703123456')).toBe(1703123456)
    expect(getUnixDateFromString('1703123456789')).toBe(1703123456789)
  })

  it('should convert ISO date strings', () => {
    const isoDate = '2024-01-15T10:30:00Z'
    const expected = Math.floor(new Date(isoDate).getTime() / 1000)
    expect(getUnixDateFromString(isoDate)).toBe(expected)
  })

  it('should convert YYYY-MM-DD format', () => {
    const dateStr = '2024-01-15'
    const expected = Math.floor(new Date(2024, 0, 15).getTime() / 1000)
    expect(getUnixDateFromString(dateStr)).toBe(expected)
  })

  it('should throw error for invalid dates', () => {
    expect(() => getUnixDateFromString('invalid-date')).toThrow('Invalid date: invalid-date')
    expect(() => getUnixDateFromString('2024-13-45')).toThrow()
  })
})

describe('parseBindings', () => {
  const mockBindings = [
    {
      s: { value: 'https://example.com/page1' },
      o: { value: 'https://example.com/page2' },
      title: { value: 'Page 1' },
      description: { value: 'Description 1' },
      date: { value: '1703123456' },
      image: { value: 'https://example.com/image1.jpg' },
      ot: { value: 'Page 2' },
      od: { value: 'Description 2' },
      omg: { value: 'https://example.com/image2.jpg' }
    }
  ]

  it('should parse pages mode correctly', () => {
    const result = parseBindings(mockBindings, 'pages')
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      role: 'subject',
      uri: 'https://example.com/page1',
      title: 'Page 1',
      description: 'Description 1',
      date: 1703123456,
      image: 'https://example.com/image1.jpg'
    })
    expect(result[1]).toEqual({
      role: 'object',
      uri: 'https://example.com/page2',
      title: 'Page 2',
      description: 'Description 2',
      image: 'https://example.com/image2.jpg'
    })
  })

  it('should parse terms mode correctly', () => {
    const termBindings = [
      {
        o: { value: 'https://octothorp.es/~/test-tag' },
        date: { value: '1703123456' }
      }
    ]
    const result = parseBindings(termBindings, 'terms')
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      term: 'test-tag',
      date: 1703123456
    })
  })

  it('should handle missing optional fields', () => {
    const minimalBindings = [
      {
        s: { value: 'https://example.com/page1' },
        o: { value: 'https://example.com/page2' }
      }
    ]
    const result = parseBindings(minimalBindings, 'pages')
    expect(result[0].title).toBeNull()
    expect(result[0].description).toBeNull()
    expect(result[0].date).toBeNull()
  })
})

describe('parseDateStrings', () => {
  it('should handle empty input', () => {
    expect(parseDateStrings('')).toEqual({})
    expect(parseDateStrings()).toEqual({})
  })

  it('should parse "recent" keyword', () => {
    const result = parseDateStrings('recent')
    expect(result).toHaveProperty('after')
    expect(typeof result.after).toBe('number')
    expect(result.after).toBeLessThan(Date.now())
  })

  it('should parse "after" filter', () => {
    const result = parseDateStrings('after-2024-01-15')
    expect(result).toHaveProperty('after')
    expect(result.after).toBe(Math.floor(new Date(2024, 0, 15).getTime() / 1000))
  })

  it('should parse "before" filter', () => {
    const result = parseDateStrings('before-2024-01-15')
    expect(result).toHaveProperty('before')
    expect(result.before).toBe(Math.floor(new Date(2024, 0, 15).getTime() / 1000))
  })

  it('should parse "between" filter', () => {
    const result = parseDateStrings('between-2024-01-01-and-2024-01-31')
    expect(result).toHaveProperty('after')
    expect(result).toHaveProperty('before')
    expect(result.after).toBe(Math.floor(new Date(2024, 0, 1).getTime() / 1000))
    expect(result.before).toBe(Math.floor(new Date(2024, 0, 31).getTime() / 1000))
  })

  it('should throw error for invalid formats', () => {
    expect(() => parseDateStrings('invalid')).toThrow('Invalid date filter format')
    expect(() => parseDateStrings('unknown-2024-01-15')).toThrow('Unknown date filter type')
    expect(() => parseDateStrings('between-2024-01-01')).toThrow('Between filter requires both start and end dates')
  })
})

describe('isSparqlSafe', () => {
  it('should validate safe strings', () => {
    expect(isSparqlSafe('safe-string')).toEqual({ valid: true })
    expect(isSparqlSafe('https://example.com')).toEqual({ valid: true })
    expect(isSparqlSafe(['safe1', 'safe2'])).toEqual({ valid: true })
  })

  it('should reject dangerous characters', () => {
    expect(isSparqlSafe('unsafe"string')).toEqual({ 
      valid: false, 
      error: 'Input contains dangerous characters (<>"{}\\)' 
    })
    expect(isSparqlSafe('unsafe<string')).toEqual({ 
      valid: false, 
      error: 'Input contains dangerous characters (<>"{}\\)' 
    })
  })

  it('should reject path traversal patterns', () => {
    expect(isSparqlSafe('../etc/passwd')).toEqual({ 
      valid: false, 
      error: 'Path traversal attack pattern detected' 
    })
    expect(isSparqlSafe('..%2fetc%2fpasswd')).toEqual({ 
      valid: false, 
      error: 'Path traversal attack pattern detected' 
    })
  })

  it('should reject dangerous URL schemes', () => {
    expect(isSparqlSafe('javascript:alert(1)')).toEqual({ 
      valid: false, 
      error: 'Dangerous URL scheme detected. Why would you do that?' 
    })
    expect(isSparqlSafe('data:text/html,<script>alert(1)</script>')).toEqual({ 
      valid: false, 
      error: 'Dangerous URL scheme detected. Why would you do that?' 
    })
  })

  it('should respect length limits', () => {
    const longString = 'a'.repeat(513)
    expect(isSparqlSafe(longString, { maxLength: 512 })).toEqual({ 
      valid: false, 
      error: 'Input exceeds maximum length (512)' 
    })
  })

  it('should respect input count limits', () => {
    const manyInputs = Array(51).fill('test')
    expect(isSparqlSafe(manyInputs, { maxInputs: 50 })).toEqual({ 
      valid: false, 
      error: 'Exceeded maximum input count (50)' 
    })
  })

  it('should reject non-string inputs', () => {
    expect(isSparqlSafe(123)).toEqual({ 
      valid: false, 
      error: 'Input must be a string' 
    })
    expect(isSparqlSafe({})).toEqual({ 
      valid: false, 
      error: 'Input must be a string' 
    })
  })
})

describe('cleanInputs', () => {
  it('should return empty string for empty input', () => {
    expect(cleanInputs('')).toBe('')
  })

  it('should validate inputs in fuzzy mode', () => {
    expect(cleanInputs('safe-input')).toEqual(['safe-input'])
    expect(cleanInputs(['safe1', 'safe2'])).toEqual(['safe1', 'safe2'])
  })

  it('should normalize URLs in exact mode', () => {
    const result = cleanInputs('example.com', 'exact')
    expect(result[0]).toMatch(/^https:\/\/example\.com/)
  })

  it('should throw error for unsafe inputs', () => {
    expect(() => cleanInputs('unsafe<script>')).toThrow('Input contains dangerous characters')
    expect(() => cleanInputs(['safe', 'unsafe<script>'])).toThrow('Input contains dangerous characters')
  })
})

describe('areUrlsFuzzy', () => {
  it('should return false for valid URLs', () => {
    expect(areUrlsFuzzy(['https://example.com'])).toBe(false)
    expect(areUrlsFuzzy(['https://example.com', 'https://test.com'])).toBe(false)
  })

  it('should return true for invalid URLs', () => {
    expect(areUrlsFuzzy(['not-a-url'])).toBe(true)
    expect(areUrlsFuzzy(['https://example.com', 'not-a-url'])).toBe(true)
  })

  it('should handle empty array', () => {
    expect(areUrlsFuzzy([])).toBe(false)
  })
})

describe('getFuzzyTags', () => {
  it('should handle single string input', () => {
    const result = getFuzzyTags('test-tag')
    expect(result).toContain('test-tag')
    expect(result).toContain('test_tag')
    expect(result).toContain('testtag')
    expect(result).toContain('#test-tag')
  })

  it('should handle array input', () => {
    const result = getFuzzyTags(['test-tag', 'another-tag'])
    expect(result).toContain('test-tag')
    expect(result).toContain('another-tag')
  })

  it('should handle empty input', () => {
    expect(getFuzzyTags('')).toEqual([])
    expect(getFuzzyTags([])).toEqual([])
    expect(getFuzzyTags(null)).toEqual([])
  })

  it('should handle tags with # prefix', () => {
    const result = getFuzzyTags('#test-tag')
    expect(result).toContain('test-tag')
    expect(result).toContain('#test-tag')
    expect(result).not.toContain('##test-tag')
  })

  it('should generate various case variations', () => {
    const result = getFuzzyTags('test-tag')
    expect(result).toContain('test-tag')
    expect(result).toContain('test_tag')
    expect(result).toContain('testtag')
    expect(result).toContain('Test-Tag')
    expect(result).toContain('Test_Tag')
    expect(result).toContain('TestTag')
  })

  it('should filter out empty strings', () => {
    const result = getFuzzyTags(['', 'valid-tag', '   '])
    expect(result).toContain('valid-tag')
    expect(result).not.toContain('')
    expect(result).not.toContain('   ')
  })
}) 