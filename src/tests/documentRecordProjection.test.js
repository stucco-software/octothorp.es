import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { insert, query } from '$lib/sparql.js'

// C7 (#237 P3): the profile's vocabulary.documentRecord schema is wired into the
// live /get blobject pipeline (route injects it -> api.js passes it to the query
// builder + projector; core never reads the profile itself). Declared predicates
// stored on a page project into blobject.documentRecord, typed by range; pages
// without them are unchanged. Live-store fixture, self-cleaning.

const instance = (process.env.instance || 'http://localhost:5173/').replace(/\/?$/, '/')
const base = instance.replace(/\/$/, '')

describe('C7 documentRecord projection through the live /get pipeline', () => {
  let live = false
  const withDR = `${base}/__c7_fixture__/with-dr`
  const withoutDR = `${base}/__c7_fixture__/without-dr`
  const term = `${base}/~/__c7term__`

  const cleanup = async () => {
    await query(`DELETE WHERE { <${withDR}> ?p ?o }`)
    await query(`DELETE WHERE { <${withoutDR}> ?p ?o }`)
    await query(`DELETE WHERE { <${term}> ?p ?o }`)
  }

  beforeAll(async () => {
    try {
      const res = await fetch(`${base}/profile.json`)
      live = res.ok
    } catch { live = false }
    if (!live) return
    await cleanup()
    // Two pages sharing a term; only the first carries declared documentRecord
    // predicates (schema.encodingFormat/contentSize + memex.addedBy).
    await insert(`
      <${term}> rdf:type <octo:Term> .
      <${term}> octo:created 1700000000000 .

      <${withDR}> rdf:type <octo:Page> .
      <${withDR}> octo:created 1700000000000 .
      <${withDR}> octo:title "C7 with documentRecord" .
      <${withDR}> octo:octothorpes <${term}> .
      <${withDR}> <${term}> 1700000000000 .
      <${withDR}> <https://schema.org/encodingFormat> "text/markdown" .
      <${withDR}> <https://schema.org/contentSize> 42 .
      <${withDR}> <https://vocab.octothorp.es/memex#addedBy> "tester" .

      <${withoutDR}> rdf:type <octo:Page> .
      <${withoutDR}> octo:created 1700000000000 .
      <${withoutDR}> octo:title "C7 without documentRecord" .
      <${withoutDR}> octo:octothorpes <${term}> .
      <${withoutDR}> <${term}> 1700000000000 .
    `)
  })

  afterAll(async () => { if (live) await cleanup() })

  it('projects declared predicates onto blobject.documentRecord, typed by range', { timeout: 30000 }, async () => {
    if (!live) { console.warn('[C7] dev server down — skipping'); return }
    const res = await fetch(`${base}/get/everything/thorped/debug?o=__c7term__`)
    expect(res.ok).toBe(true)
    const out = await res.json()
    const blob = out.actualResults.find(r => r['@id'] === withDR)
    expect(blob).toBeTruthy()
    expect(blob.documentRecord).toEqual({
      encodingFormat: 'text/markdown',
      contentSize: 42, // typed number, not the string "42"
      addedBy: 'tester',
    })
  })

  it('omits documentRecord on pages with no declared predicates', { timeout: 30000 }, async () => {
    if (!live) return
    const res = await fetch(`${base}/get/everything/thorped/debug?o=__c7term__`)
    const out = await res.json()
    const blob = out.actualResults.find(r => r['@id'] === withoutDR)
    expect(blob).toBeTruthy()
    expect('documentRecord' in blob).toBe(false)
  })
})
