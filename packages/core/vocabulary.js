/**
 * Generated vocabulary document (#291): RDFS descriptions of the terms this
 * client mints — core protocol terms, declared documentRecord predicates, and
 * declared link-type subtypes.
 *
 * Purely descriptive. Nothing here is stored in the datastore and no reasoner
 * is implied; consumers dereference the document to understand terms, and any
 * entailment is their business.
 *
 * IRI-form ruling (2026-10-14): the document describes only canonical full
 * IRIs (`https://vocab.octothorp.es#Term`), never the compact `<octo:Term>`
 * spelling that pre-migration stores may still hold (migrated in #270).
 */

export const RDF_NS = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
export const RDFS_NS = 'http://www.w3.org/2000/01/rdf-schema#'
export const XSD_NS = 'http://www.w3.org/2001/XMLSchema#'
export const SKOS_NS = 'http://www.w3.org/2004/02/skos/core#'

/**
 * Profile `range` enum -> rdfs:range IRI. This mapping is why the profile key
 * is named `range`. `number` maps to xsd:decimal: the profile enum does not
 * distinguish integer from decimal, and xsd:integer is derived from
 * xsd:decimal, so decimal is the honest superset.
 */
export const RANGE_TO_RDFS = {
  literal: `${RDFS_NS}Literal`,
  uri: `${XSD_NS}anyURI`,
  number: `${XSD_NS}decimal`,
  timestamp: `${XSD_NS}dateTime`,
}

/**
 * Core protocol terms. These are the classes and predicates core itself writes
 * (indexer.js) and reads (queryBuilders.js) — the builtin registry this
 * document is generated from and the registry core consumes (#195).
 * Local names only; IRIs are minted against the profile's octo namespace.
 */
export const BUILTIN_CLASSES = [
  // #286: Terms are SKOS concepts; prefLabel rides on the same document.
  { name: 'Term', label: 'Term', subClassOf: [`${SKOS_NS}Concept`], comment: 'An octothorpe term: a tag minted under this instance’s term prefix.' },
  { name: 'Page', label: 'Page', subClassOf: [], comment: 'An indexed web page.' },
  { name: 'Origin', label: 'Origin', subClassOf: [], comment: 'A verified origin (site) known to this instance.' },
  { name: 'Webring', label: 'Webring', subClassOf: [], comment: 'A webring: an origin that has members.' },
  { name: 'Link', label: 'Link', subClassOf: [], comment: 'A relationship between a subject page and an object; the base class of all typed link relationships.' },
  { name: 'Backlink', label: 'Backlink', subClassOf: ['Link'] },
  { name: 'Cite', label: 'Cite', subClassOf: ['Link'] },
  { name: 'Bookmark', label: 'Bookmark', subClassOf: ['Link'] },
  { name: 'Mention', label: 'Mention', subClassOf: ['Link'] },
  { name: 'Button', label: 'Button', subClassOf: ['Link'] },
]

/**
 * Registry handles (#195). Core code names classes through CLASS so a typo is
 * an undefined lookup, not a silently new rdf:type.
 */
export const CLASS = Object.freeze(Object.fromEntries(BUILTIN_CLASSES.map((c) => [c.name, c.name])))

/**
 * A builtin class as it is written to and read from the store today: the
 * compact `<octo:Name>` form. Expanding to the full IRI is the #270 migration
 * (IRI-form ruling); change it here when that lands, nowhere else.
 */
export const typeRef = (name) => {
  if (!Object.hasOwn(CLASS, name)) throw new Error(`Unregistered vocabulary class: ${name}`)
  return classRef(name)
}

const SAFE_CLASS_NAME = /^[A-Za-z][A-Za-z0-9_-]*$/

/**
 * The same serialization for a class name that is NOT in the builtin registry:
 * a profile-declared link type's subtype (`api.linkTypes[].subtype`), which is
 * a real octo class a harmonizer writes but not one core ships. Validated, not
 * looked up — the name lands inside a SPARQL triple, so anything that is not a
 * plain class name is an injection vector. Prefer typeRef for builtins; this is
 * the escape hatch for names only known at runtime, and it routes through the
 * same single place the #270 IRI migration changes.
 */
export const classRef = (name) => {
  if (typeof name !== 'string' || !SAFE_CLASS_NAME.test(name)) {
    throw new Error(`Invalid vocabulary class name: ${name}`)
  }
  return `<octo:${name}>`
}

/**
 * Harmonizer-key -> relationship class aliases read by resolveSubtype. Per
 * the #332 ruling, new subtypes use a single lowercase key whose first-letter
 * capitalisation is the class name and need no entry here; these are the
 * legacy exceptions (and identity entries for already-capitalised keys).
 */
export const SUBTYPE_ALIASES = Object.freeze({
  bookmark: CLASS.Bookmark,
  Bookmark: CLASS.Bookmark,
  cite: CLASS.Cite,
  citation: CLASS.Cite,
  Cite: CLASS.Cite,
  mention: CLASS.Mention,
  Mention: CLASS.Mention,
  button: CLASS.Button,
  Button: CLASS.Button,
})

export const BUILTIN_PROPERTIES = [
  { name: 'octothorpes', label: 'octothorpes', comment: 'Subject page octothorpes (tags or links to) the object.' },
  { name: 'created', label: 'created', range: `${XSD_NS}dateTime` },
  { name: 'used', label: 'used', range: `${XSD_NS}dateTime` },
  { name: 'indexed', label: 'indexed', range: `${XSD_NS}dateTime` },
  { name: 'verified', label: 'verified', comment: 'The origin has been verified by this instance.' },
  { name: 'hasPart', label: 'hasPart' },
  { name: 'hasMember', label: 'hasMember', comment: 'Webring membership.' },
  { name: 'endorses', label: 'endorses' },
  { name: 'title', label: 'title', range: `${RDFS_NS}Literal` },
  { name: 'description', label: 'description', range: `${RDFS_NS}Literal` },
  { name: 'image', label: 'image', range: `${XSD_NS}anyURI` },
  { name: 'url', label: 'url', range: `${XSD_NS}anyURI` },
  { name: 'postDate', label: 'postDate', range: `${XSD_NS}dateTime` },
]

/**
 * Build the vocabulary document from a RESOLVED profile (resolveProfile()
 * output: merged linkTypes carrying `source`, canonical instance). Pure and
 * synchronous; generated on request, never stored.
 *
 * @param {Object} resolvedProfile
 * @returns {{ instance: string, octo: string, note: string,
 *   classes: Array<{iri:string,label:string,subClassOf:string[],isDefinedBy:string,source:string,comment?:string}>,
 *   properties: Array<{iri:string,type:string,label:string,range?:string,isDefinedBy:string,source:string,comment?:string}> }}
 */
export const buildVocabulary = (resolvedProfile) => {
  const instance = resolvedProfile?.identity?.instance
  const octo = resolvedProfile?.vocabulary?.octo ?? 'https://vocab.octothorp.es#'
  if (!instance) throw new Error('buildVocabulary requires a resolved profile with identity.instance')

  const expand = (name) => `${octo}${name}`

  const classes = BUILTIN_CLASSES.map((c) => ({
    iri: expand(c.name),
    label: c.label ?? c.name,
    subClassOf: (c.subClassOf ?? []).map((s) => (s.includes(':/') || s.startsWith('http') ? s : expand(s))),
    isDefinedBy: octo,
    source: 'builtin',
    ...(c.comment ? { comment: c.comment } : {}),
  }))

  // Declared link types mint octo:<subtype> relationship classes. Builtins
  // already appear above (their subtypes are in BUILTIN_CLASSES), so only
  // `source: 'declared'` entries add classes here. Extension classes share the
  // octo namespace deliberately; rdfs:isDefinedBy <instance> is the
  // provenance claim.
  const seen = new Set(classes.map((c) => c.iri))
  for (const lt of resolvedProfile.api?.linkTypes ?? []) {
    if (lt.source !== 'declared' || !lt.subtype) continue
    const iri = expand(lt.subtype)
    if (seen.has(iri)) continue
    seen.add(iri)
    classes.push({
      iri,
      label: lt.label ?? lt.subtype,
      subClassOf: [expand('Link')],
      isDefinedBy: instance,
      source: 'declared',
      comment: `Relationship class written by the ‘${lt.by}’ link type declared by this instance.`,
    })
  }

  const properties = BUILTIN_PROPERTIES.map((p) => ({
    iri: expand(p.name),
    type: `${RDF_NS}Property`,
    label: p.label ?? p.name,
    ...(p.range ? { range: p.range } : {}),
    isDefinedBy: octo,
    source: 'builtin',
    ...(p.comment ? { comment: p.comment } : {}),
  }))

  const seenProps = new Set(properties.map((p) => p.iri))
  for (const dr of resolvedProfile.api?.documentRecord ?? []) {
    const iri = expand(dr.predicate)
    if (seenProps.has(iri)) continue
    seenProps.add(iri)
    properties.push({
      iri,
      type: `${RDF_NS}Property`,
      label: dr.predicate,
      range: RANGE_TO_RDFS[dr.range] ?? `${RDFS_NS}Literal`,
      isDefinedBy: instance,
      source: 'declared',
      comment: `Document-record predicate declared by this instance (profile range: ${dr.range}).`,
    })
  }

  return {
    instance,
    octo,
    note:
      'This document describes canonical full IRIs only. Stores indexed before the #270 migration may still hold the legacy compact spelling (e.g. "octo:Term") for relationship types.',
    classes,
    properties,
  }
}

const CONTEXT = {
  rdf: RDF_NS,
  rdfs: RDFS_NS,
  xsd: XSD_NS,
  skos: SKOS_NS,
}

/**
 * JSON-LD serialization: one flat @graph of class and property nodes.
 * @param {ReturnType<typeof buildVocabulary>} vocab
 */
export const vocabularyToJsonLd = (vocab) => ({
  '@context': CONTEXT,
  '@id': `${vocab.instance}vocabulary`,
  'rdfs:comment': vocab.note,
  '@graph': [
    ...vocab.classes.map((c) => ({
      '@id': c.iri,
      '@type': 'rdfs:Class',
      'rdfs:label': c.label,
      ...(c.subClassOf.length
        ? { 'rdfs:subClassOf': c.subClassOf.map((s) => ({ '@id': s })) }
        : {}),
      'rdfs:isDefinedBy': { '@id': c.isDefinedBy },
      ...(c.comment ? { 'rdfs:comment': c.comment } : {}),
    })),
    ...vocab.properties.map((p) => ({
      '@id': p.iri,
      '@type': 'rdf:Property',
      'rdfs:label': p.label,
      ...(p.range ? { 'rdfs:range': { '@id': p.range } } : {}),
      'rdfs:isDefinedBy': { '@id': p.isDefinedBy },
      ...(p.comment ? { 'rdfs:comment': p.comment } : {}),
    })),
  ],
})

const ttlString = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

/**
 * Turtle serialization. Prefixes cover the describing vocabularies only; the
 * described terms themselves are written as full IRIs, per the IRI-form ruling.
 * @param {ReturnType<typeof buildVocabulary>} vocab
 */
export const vocabularyToTurtle = (vocab) => {
  const lines = [
    `@prefix rdf: <${RDF_NS}> .`,
    `@prefix rdfs: <${RDFS_NS}> .`,
    `@prefix xsd: <${XSD_NS}> .`,
    `@prefix skos: <${SKOS_NS}> .`,
    '',
    `# ${vocab.note}`,
    '',
  ]
  for (const c of vocab.classes) {
    const preds = [
      `a rdfs:Class`,
      `rdfs:label ${ttlString(c.label)}`,
      ...c.subClassOf.map((s) => `rdfs:subClassOf <${s}>`),
      `rdfs:isDefinedBy <${c.isDefinedBy}>`,
      ...(c.comment ? [`rdfs:comment ${ttlString(c.comment)}`] : []),
    ]
    lines.push(`<${c.iri}> ${preds.join(' ;\n  ')} .`, '')
  }
  for (const p of vocab.properties) {
    const preds = [
      `a rdf:Property`,
      `rdfs:label ${ttlString(p.label)}`,
      ...(p.range ? [`rdfs:range <${p.range}>`] : []),
      `rdfs:isDefinedBy <${p.isDefinedBy}>`,
      ...(p.comment ? [`rdfs:comment ${ttlString(p.comment)}`] : []),
    ]
    lines.push(`<${p.iri}> ${preds.join(' ;\n  ')} .`, '')
  }
  return lines.join('\n')
}
