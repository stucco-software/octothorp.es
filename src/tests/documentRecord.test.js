import { describe, it, expect } from 'vitest'
import { getBlobjectFromResponse, coerceDocumentRecordValue } from '../../packages/core/blobject.js'

const SCHEMA = [
  { predicate: 'encodingFormat', namespace: 'schema', range: 'literal' },
  { predicate: 'contentUrl', namespace: 'schema', range: 'uri' },
  { predicate: 'contentSize', namespace: 'schema', range: 'number' },
  { predicate: 'dateCreated', namespace: 'schema', range: 'timestamp' },
  { predicate: 'active', namespace: 'schema', range: 'boolean' },
  { predicate: 'addedBy', namespace: 'memex', range: 'literal' },
]

// Build a minimal blobject-shaped binding row with documentRecord vars.
const row = (url, dr = {}) => ({
  s: { value: url },
  title: { value: 'A page' },
  date: { value: '1700000000000' },
  pageType: { value: 'octo:Page' },
  ...Object.fromEntries(Object.entries(dr).map(([k, v]) => [k, { value: v }])),
})

describe('C6 coerceDocumentRecordValue - typing by range', () => {
  it('literal / uri -> string', () => {
    expect(coerceDocumentRecordValue('image/jpeg', 'literal')).toBe('image/jpeg')
    expect(coerceDocumentRecordValue('https://x/y', 'uri')).toBe('https://x/y')
  })
  it('number -> JS number; non-numeric -> undefined (dropped)', () => {
    expect(coerceDocumentRecordValue('42', 'number')).toBe(42)
    expect(coerceDocumentRecordValue('3.5', 'number')).toBe(3.5)
    expect(coerceDocumentRecordValue('not-a-number', 'number')).toBeUndefined()
  })
  it('boolean -> JS boolean; malformed -> undefined (dropped)', () => {
    expect(coerceDocumentRecordValue('true', 'boolean')).toBe(true)
    expect(coerceDocumentRecordValue('1', 'boolean')).toBe(true)
    expect(coerceDocumentRecordValue('false', 'boolean')).toBe(false)
    expect(coerceDocumentRecordValue('0', 'boolean')).toBe(false)
    expect(coerceDocumentRecordValue('maybe', 'boolean')).toBeUndefined()
  })
  it('timestamp -> ISO string (unix ms, unix s, and ISO passthrough)', () => {
    expect(coerceDocumentRecordValue('1700000000000', 'timestamp')).toBe('2023-11-14T22:13:20.000Z')
    expect(coerceDocumentRecordValue('1700000000', 'timestamp')).toBe('2023-11-14T22:13:20.000Z')
    expect(coerceDocumentRecordValue('2023-11-14T22:13:20.000Z', 'timestamp')).toBe('2023-11-14T22:13:20.000Z')
  })
  it('timestamp malformed -> raw string (never null)', () => {
    expect(coerceDocumentRecordValue('garbage', 'timestamp')).toBe('garbage')
  })
})

describe('C6 getBlobjectFromResponse - documentRecord projection', () => {
  it('projects declared predicates present in storage, typed by range', async () => {
    const response = {
      results: {
        bindings: [
          row('https://ex.com/a', {
            dr_schema_encodingFormat: 'image/jpeg',
            dr_schema_contentUrl: 'https://ex.com/IMG.jpeg',
            dr_schema_contentSize: '20481',
            dr_schema_dateCreated: '1700000000000',
            dr_schema_active: 'true',
            dr_memex_addedBy: 'memex-1',
          }),
        ],
      },
    }
    const [blob] = await getBlobjectFromResponse(response, undefined, SCHEMA)
    expect(blob.documentRecord).toEqual({
      encodingFormat: 'image/jpeg',
      contentUrl: 'https://ex.com/IMG.jpeg',
      contentSize: 20481,
      dateCreated: '2023-11-14T22:13:20.000Z',
      active: true,
      addedBy: 'memex-1',
    })
  })

  it('omits declared-but-absent predicates (no null keys)', async () => {
    const response = {
      results: {
        bindings: [row('https://ex.com/a', { dr_schema_encodingFormat: 'text/plain' })],
      },
    }
    const [blob] = await getBlobjectFromResponse(response, undefined, SCHEMA)
    expect(blob.documentRecord).toEqual({ encodingFormat: 'text/plain' })
    expect('contentUrl' in blob.documentRecord).toBe(false)
  })

  it('drops undeclared predicates present in the bindings (admission allowlist)', async () => {
    const response = {
      results: {
        bindings: [
          row('https://ex.com/a', {
            dr_schema_encodingFormat: 'text/plain',
            dr_evil_password: 'hunter2', // undeclared: never looped, never surfaced
          }),
        ],
      },
    }
    const [blob] = await getBlobjectFromResponse(response, undefined, SCHEMA)
    expect(blob.documentRecord).toEqual({ encodingFormat: 'text/plain' })
    expect(JSON.stringify(blob)).not.toContain('hunter2')
  })

  it('non-numeric literal declared as number -> key dropped', async () => {
    const response = {
      results: { bindings: [row('https://ex.com/a', { dr_schema_contentSize: 'lots' })] },
    }
    const [blob] = await getBlobjectFromResponse(response, undefined, SCHEMA)
    expect(blob.documentRecord).toBeUndefined()
  })

  it('empty schema -> no documentRecord key (zero regression)', async () => {
    const response = {
      results: { bindings: [row('https://ex.com/a', { dr_schema_encodingFormat: 'x' })] },
    }
    const [blob] = await getBlobjectFromResponse(response, undefined, [])
    expect('documentRecord' in blob).toBe(false)
  })

  it('no schema param at all -> identical to today (no documentRecord key)', async () => {
    const response = { results: { bindings: [row('https://ex.com/a')] } }
    const [blob] = await getBlobjectFromResponse(response)
    expect('documentRecord' in blob).toBe(false)
  })

  it('projects independently per page', async () => {
    const response = {
      results: {
        bindings: [
          row('https://ex.com/a', { dr_memex_addedBy: 'alice' }),
          row('https://ex.com/b', { dr_memex_addedBy: 'bob' }),
        ],
      },
    }
    const blobs = await getBlobjectFromResponse(response, undefined, SCHEMA)
    const a = blobs.find(b => b['@id'] === 'https://ex.com/a')
    const b = blobs.find(b => b['@id'] === 'https://ex.com/b')
    expect(a.documentRecord).toEqual({ addedBy: 'alice' })
    expect(b.documentRecord).toEqual({ addedBy: 'bob' })
  })
})
