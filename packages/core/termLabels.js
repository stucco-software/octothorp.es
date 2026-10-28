import { termName } from './utils.js'
import { SKOS_NS } from './vocabulary.js'

// SKOS term facts (#286). Full IRIs, so the triples do not depend on which
// prefixes a given prologue carries. skos:prefLabel is NOT octo:prefLabel: a
// documentRecord entry named `prefLabel` resolves to the octo namespace via
// resolveDocumentRecordIri and is a different predicate. Never alias them.
//
// The class-level fact (octo:Term rdfs:subClassOf skos:Concept) is NOT
// emitted here: it is vocabulary, owned and served by vocabulary.js (#291),
// not instance data.
export const SKOS_PREF_LABEL = `${SKOS_NS}prefLabel`

export const escapeSparqlLiteral = (s) => String(s)
  .replace(/\\/g, '\\\\')
  .replace(/"/g, '\\"')
  .replace(/\n/g, '\\n')
  .replace(/\r/g, '\\r')
  .replace(/\t/g, '\\t')

/**
 * The skos:prefLabel triple for a term: the verbatim, decoded term string.
 * @param {string} iri - Term IRI
 * @param {string} name - Verbatim term string
 * @returns {string}
 */
export const termLabelTriples = (iri, name) =>
  `<${iri}> <${SKOS_PREF_LABEL}> "${escapeSparqlLiteral(name)}" .`

/**
 * Backfill skos:prefLabel on terms that lack one, deriving the label by
 * decoding the term IRI. Idempotent: only unlabelled terms are selected.
 * @param {{queryArray: Function, insert: Function}} sparql
 * @param {{write?: boolean}} [opts] - write=false reports without writing
 * @returns {Promise<Array<{iri:string,label:string}>>} terms (to be) labelled
 */
export const backfillTermLabels = async ({ queryArray, insert }, { write = false } = {}) => {
  const res = await queryArray(`select distinct ?t {
    ?t rdf:type <octo:Term> .
    filter not exists { ?t <${SKOS_PREF_LABEL}> ?l . }
  }`)
  const rows = res.results.bindings.map(b => ({ iri: b.t.value, label: termName(b.t.value) }))
  if (write && rows.length) {
    await insert(`
      ${rows.map(r => termLabelTriples(r.iri, r.label)).join('\n      ')}
    `)
  }
  return rows
}
