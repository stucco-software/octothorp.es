import { describe, it, expect } from 'vitest'
import { normalizeEnvelope } from '../../packages/core/envelope.js'

describe('normalizeEnvelope (#249)', () => {
  it('maps legacy @-keys to plain keys and strips the @-forms', () => {
    const out = normalizeEnvelope({ '@id': 'x', '@type': 'harmonizer', '@context': 'c', title: 't' })
    expect(out).toEqual({ id: 'x', type: 'harmonizer', context: 'c', title: 't' })
  })
  it('plain keys win when both forms are present', () => {
    const out = normalizeEnvelope({ id: 'new', '@id': 'old', type: 'harmonizer', '@type': 'stale' })
    expect(out.id).toBe('new')
    expect(out.type).toBe('harmonizer')
    expect(out['@id']).toBeUndefined()
  })
  it('leaves already-plain definitions untouched', () => {
    const def = { id: 'x', type: 'resolver', schema: { url: { from: '@id' } } }
    expect(normalizeEnvelope(def)).toEqual(def)
  })
  it('does NOT touch nested keys (schema from-references to blobject @id)', () => {
    const out = normalizeEnvelope({ '@id': 'x', schema: { url: { from: '@id', required: true }, title: { from: ['title', '@id'] } } })
    expect(out.schema.url.from).toBe('@id')
    expect(out.schema.title.from).toEqual(['title', '@id'])
  })
  it('passes through non-objects unchanged', () => {
    expect(normalizeEnvelope(null)).toBe(null)
    expect(normalizeEnvelope(undefined)).toBe(undefined)
    expect(normalizeEnvelope('str')).toBe('str')
    const arr = [1]
    expect(normalizeEnvelope(arr)).toBe(arr)
  })
})
