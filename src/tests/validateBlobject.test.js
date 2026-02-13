import { describe, it, expect } from 'vitest'
import { validateBlobject } from '$lib/validateBlobject.js'

describe('validateBlobject', () => {
  it('should accept a valid blobject with string octothorpes', () => {
    const result = validateBlobject({
      '@id': 'https://example.com/page',
      title: 'Test Page',
      description: 'A test page',
      image: '',
      contact: '',
      type: '',
      octothorpes: ['tag1', 'tag2']
    })
    expect(result.valid).toBe(true)
  })

  it('should accept a valid blobject with typed octothorpes', () => {
    const result = validateBlobject({
      '@id': 'https://example.com/page',
      title: 'Test Page',
      description: '',
      image: '',
      contact: '',
      type: '',
      octothorpes: [
        'tag1',
        { type: 'link', uri: 'https://other.com' },
        { type: 'bookmark', uri: 'https://saved.com' }
      ]
    })
    expect(result.valid).toBe(true)
  })

  it('should reject blobject without @id', () => {
    const result = validateBlobject({
      title: 'Test',
      octothorpes: []
    })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/@id/)
  })

  it('should reject blobject with invalid @id URL', () => {
    const result = validateBlobject({
      '@id': 'not-a-url',
      title: 'Test',
      octothorpes: []
    })
    expect(result.valid).toBe(false)
  })

  it('should reject blobject without octothorpes array', () => {
    const result = validateBlobject({
      '@id': 'https://example.com/page',
      title: 'Test'
    })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/octothorpes/)
  })

  it('should reject typed octothorpe without uri', () => {
    const result = validateBlobject({
      '@id': 'https://example.com/page',
      title: 'Test',
      description: '',
      image: '',
      contact: '',
      type: '',
      octothorpes: [{ type: 'link' }]
    })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/uri/)
  })

  it('should reject typed octothorpe with invalid uri', () => {
    const result = validateBlobject({
      '@id': 'https://example.com/page',
      title: 'Test',
      description: '',
      image: '',
      contact: '',
      type: '',
      octothorpes: [{ type: 'link', uri: 'not-a-url' }]
    })
    expect(result.valid).toBe(false)
  })

  it('should reject non-object input', () => {
    expect(validateBlobject(null).valid).toBe(false)
    expect(validateBlobject('string').valid).toBe(false)
    expect(validateBlobject(42).valid).toBe(false)
  })

  it('should reject dangerous URL schemes in @id', () => {
    const result = validateBlobject({
      '@id': 'javascript:alert(1)',
      title: 'Test',
      octothorpes: []
    })
    expect(result.valid).toBe(false)
  })

  it('should accept blobject with empty octothorpes array', () => {
    const result = validateBlobject({
      '@id': 'https://example.com/page',
      title: 'Test',
      description: '',
      image: '',
      contact: '',
      type: '',
      octothorpes: []
    })
    expect(result.valid).toBe(true)
  })
})
