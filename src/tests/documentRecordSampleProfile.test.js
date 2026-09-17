import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createProfile, createClient, documentRecordVar } from 'octothorpes'
import profileSchema from '../../packages/core/profile.schema.json'

// §1a of docs/plans/weeks/2026-09-14-week.md, core half.
//
// Replaces the profile-injecting live parity test: a SAMPLE profile fixture is
// resolved through the real loader + real schema, and the resulting
// api.documentRecord is fed to a real core client whose SPARQL transport is
// mocked. No dev server, no shared mutable state, no rewriting octothorpes.json.
//
// Deliberately NOT re-tested here (covered elsewhere, don't duplicate):
//   - per-range coercion of coerceDocumentRecordValue -> documentRecord.test.js
//   - the client-level schema actually reaching the emitted SPARQL text
//     -> client-documentRecordSchema-reachesGet.test.js
//   - octo-only resolution of a name a foreign vocabulary also uses
//     -> client-documentRecordSchema-reachesGet.test.js (second case)
// This file is about profile -> resolved schema -> projected blobject.

const fixture = (name) =>
  JSON.parse(readFileSync(resolve(process.cwd(), `src/tests/fixtures/profiles/${name}`), 'utf8'))

const resolveProfile = (name, warn) =>
  createProfile({ profile: fixture(name), schema: profileSchema, warn }).getProfile()

const TS_MS = 1700000000000
const TS_ISO = new Date(TS_MS).toISOString()

// The two-phase everything/posted query (queryBuilders prepEverything): phase 1
// resolves subject URIs, phase 2 is the schema-bearing read. Mock fetch, which
// is what sparql.queryArray actually calls.
const mockSparql = (bindings) => {
  let call = 0
  return vi.spyOn(global, 'fetch').mockImplementation(async () => {
    call += 1
    const rows =
      call === 1 ? [{ s: { type: 'uri', value: 'https://example.com/a' } }] : bindings
    return { ok: true, json: async () => ({ results: { bindings: rows } }) }
  })
}

const getWith = async (documentRecordSchema, namespaces, bindings) => {
  const client = createClient({
    instance: 'https://example.test/',
    sparql: { endpoint: 'http://localhost:1/unused' },
    documentRecordSchema,
    namespaces,
  })
  const spy = mockSparql(bindings)
  try {
    const out = await client.get({
      what: 'everything',
      by: 'posted',
      as: 'debug',
      s: 'https://example.com/a',
    })
    return out.actualResults ?? out
  } finally {
    spy.mockRestore()
  }
}

describe('§1a sample profile: document-record.json', () => {
  const profile = resolveProfile('document-record.json')
  const schema = profile.api.documentRecord

  it('resolves the declared octo-only documentRecord off the sample profile', () => {
    expect(schema).toEqual([
      { predicate: 'encodingFormat', range: 'literal' },
      { predicate: 'url', range: 'uri' },
      { predicate: 'contentSize', range: 'number' },
      { predicate: 'dateModified', range: 'timestamp' },
    ])
    expect(profile.policies.access.registration).toBe('open')
    expect(profile.identity.instance).toBe('http://localhost:5173/')
  })

  it('projects every declared range with the right JS type, and drops the undeclared one', async () => {
    const rows = await getWith(schema, profile.vocabulary.namespaces, [
      {
        s: { type: 'uri', value: 'https://example.com/a' },
        title: { value: 'A page' },
        date: { value: String(TS_MS) },
        [documentRecordVar(schema[0])]: { value: 'text/markdown' },
        [documentRecordVar(schema[1])]: { type: 'uri', value: 'https://example.com/canonical' },
        [documentRecordVar(schema[2])]: { value: '42' },
        [documentRecordVar(schema[3])]: { value: String(TS_MS) },
        // never declared by the profile — the schema is an allowlist
        dr_schema_keywords: { value: 'SHOULD-NOT-APPEAR' },
        keywords: { value: 'SHOULD-NOT-APPEAR' },
      },
    ])
    const blob = rows[0]
    expect(blob.documentRecord).toEqual({
      encodingFormat: 'text/markdown',
      url: 'https://example.com/canonical',
      contentSize: 42,
      dateModified: TS_ISO,
    })
    expect(typeof blob.documentRecord.contentSize).toBe('number')
    expect(typeof blob.documentRecord.encodingFormat).toBe('string')
    expect(typeof blob.documentRecord.url).toBe('string')
    expect(typeof blob.documentRecord.dateModified).toBe('string')
    expect(JSON.stringify(blob)).not.toContain('SHOULD-NOT-APPEAR')
  })

  it('omits documentRecord entirely when the row carries none of them', async () => {
    const rows = await getWith(schema, profile.vocabulary.namespaces, [
      {
        s: { type: 'uri', value: 'https://example.com/a' },
        title: { value: 'A bare page' },
        date: { value: String(TS_MS) },
      },
    ])
    expect('documentRecord' in rows[0]).toBe(false)
  })
})

describe('§1a sample profile: minimal.json', () => {
  it('defaults api.documentRecord to [] with no coherence warnings', () => {
    const warn = vi.fn()
    const profile = resolveProfile('minimal.json', warn)
    expect(profile.api.documentRecord).toEqual([])
    expect(warn).not.toHaveBeenCalled()
  })

  it('projects no documentRecord at all under the empty schema', async () => {
    const profile = resolveProfile('minimal.json', () => {})
    const rows = await getWith(profile.api.documentRecord, profile.vocabulary.namespaces, [
      {
        s: { type: 'uri', value: 'https://example.com/a' },
        title: { value: 'A page' },
        date: { value: String(TS_MS) },
        dr_schema_encodingFormat: { value: 'text/markdown' },
      },
    ])
    expect('documentRecord' in rows[0]).toBe(false)
  })
})
