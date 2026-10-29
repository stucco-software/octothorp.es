import { getFuzzyTags, termIri, termIriSegment } from './utils.js'
import { QueryError } from './errors.js'
import { originVariants, uriVariants } from './uri.js'
import { CLASS, typeRef } from './vocabulary.js'

/**
 * documentRecord predicate resolution (#237).
 *
 * documentRecord predicates live ONLY in the OP (`octo:`) namespace. An entry is
 * `{ predicate, range }`, where `predicate` is a BARE local name, and its IRI is
 * always OCTO_NAMESPACE + predicate. Adding a documentRecord entry IS "add a
 * field to the octo namespace"; it is not a way to mint triples in someone
 * else's vocabulary. Foreign ontologies are declared in the profile's
 * `vocabulary.namespaces` and extracted by harmonizers instead.
 *
 * NOTE (RDF-star insulation): documentRecord predicates are queried DIRECTLY as
 * plain leaf triples (`?s <iri> ?value`), never through the relationship /
 * blank-node machinery. This keeps the feature orthogonal to the RDF-star
 * migration.
 */
/**
 * Protocol builtins. Core ships only the namespaces the protocol itself needs;
 * everything else is declared in the profile's vocabulary.namespaces (#217).
 * foaf was audited as unused in the #217 gap audit and demoted to
 * declare-if-you-want-it — it is no longer a builtin or a SPARQL prologue PREFIX.
 * schema was demoted the same way: documentRecord predicates are octo-only, so
 * nothing in the protocol needs schema.org — declare it in
 * vocabulary.namespaces if you want it. rdfs replaced it in the builtin set,
 * because the generated vocabulary document uses rdfs:subClassOf/label.
 *
 * This list and the SPARQL prologue in ld/prefixes.js must stay in lockstep.
 */
export const BUILTIN_NAMESPACES = Object.freeze([
  Object.freeze({ prefix: 'octo', iri: 'https://vocab.octothorp.es#', import: false, source: 'builtin' }),
  Object.freeze({ prefix: 'rdf', iri: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#', import: false, source: 'builtin' }),
  Object.freeze({ prefix: 'rdfs', iri: 'http://www.w3.org/2000/01/rdf-schema#', import: false, source: 'builtin' }),
  // skos joined the prologue with #286 (Term subClassOf skos:Concept); listed
  // here to keep the lockstep (#315).
  Object.freeze({ prefix: 'skos', iri: 'http://www.w3.org/2004/02/skos/core#', import: false, source: 'builtin' }),
])

/**
 * Merge profile-declared namespaces over the protocol builtins.
 * A declared prefix shadows a builtin of the same name (forking a namespace is
 * deliberate and identity-affecting, same caveat as vocabulary.octo).
 *
 * Declared namespaces are declaration metadata only (#315): they surface in the
 * resolved profile but never reach the SPARQL prologue (ld/prefixes.js is
 * static). `import: true` is a schema error until ontology import lands with
 * #270; the field is carried here only as `false`.
 *
 * @param {Array<{prefix:string, iri:string, import?:boolean}>} [declared=[]]
 * @returns {Array<{prefix:string, iri:string, import:boolean, source:'builtin'|'declared'}>}
 */
export const mergeNamespaces = (declared = []) => {
  const tagged = (declared ?? []).map((ns) => ({
    prefix: ns.prefix,
    iri: ns.iri,
    import: ns.import ?? false,
    source: 'declared',
  }))
  const shadowed = new Set(tagged.map((n) => n.prefix))
  return [
    ...BUILTIN_NAMESPACES.filter((n) => !shadowed.has(n.prefix)).map((n) => ({ ...n })),
    ...tagged,
  ]
}

/**
 * Flatten a namespace list to a prefix -> IRI lookup.
 * @param {Array<{prefix:string, iri:string}>} [namespaces]
 * @returns {Record<string,string>}
 */
export const namespaceMap = (namespaces = BUILTIN_NAMESPACES) =>
  Object.fromEntries((namespaces ?? []).map((n) => [n.prefix, n.iri]))

/**
 * The octo namespace base, taken from the protocol builtins. documentRecord
 * predicates always resolve against this and nothing else.
 * @type {string}
 */
export const OCTO_NAMESPACE = BUILTIN_NAMESPACES.find((n) => n.prefix === 'octo').iri

/**
 * A documentRecord `predicate` must be a bare local name: a letter followed by
 * letters, digits or underscores. This is what stops `schema:foo`, a full IRI or
 * a path segment from being smuggled in through the predicate string.
 */
export const DOCUMENT_RECORD_PREDICATE_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/

/**
 * Resolve a documentRecord declaration entry to a full predicate IRI.
 * Always `octo:` + the bare predicate name.
 * @param {{predicate:string}} entry
 * @returns {string|null} full IRI, or null when the predicate is missing or is
 *   not a bare local name (entry is then skipped — a malformed IRI is never
 *   injected, and a prefixed/absolute predicate is never honoured).
 */
export const resolveDocumentRecordIri = (entry) => {
  if (!entry || typeof entry.predicate !== 'string') return null
  if (!DOCUMENT_RECORD_PREDICATE_PATTERN.test(entry.predicate)) return null
  return `${OCTO_NAMESPACE}${entry.predicate}`
}

/**
 * Deterministic, SPARQL-safe binding variable name for a documentRecord entry.
 * Shared by the query builder (which SELECTs it) and the projector in
 * blobject.js (which reads it), so the two never drift.
 * @param {{predicate:string}} entry
 * @returns {string} e.g. "dr_encodingFormat"
 */
export const documentRecordVar = (entry) =>
  `dr_${entry.predicate}`.replace(/[^A-Za-z0-9_]/g, '_')

/**
 * Build the SELECT vars and OPTIONAL leaf patterns that surface declared
 * documentRecord predicates for the result subjects. Declaration-driven: only
 * declared predicates are queried (the admission allowlist), and each is a plain
 * `?s <iri> ?var` leaf — no FILTER(isBlank(...)) path. Every predicate resolves
 * under `octo:`; see resolveDocumentRecordIri.
 * @param {Array<{predicate:string}>} [schema=[]]
 * @returns {{selectVars:string, optionals:string}}
 */
export const buildDocumentRecordClauses = (schema = []) => {
  if (!Array.isArray(schema) || schema.length === 0) {
    return { selectVars: '', optionals: '' }
  }
  const selectVars = []
  const optionals = []
  for (const entry of schema) {
    const iri = resolveDocumentRecordIri(entry)
    if (!iri) continue
    const v = documentRecordVar(entry)
    selectVars.push(`?${v}`)
    optionals.push(`OPTIONAL { ?s <${iri}> ?${v} . }`)
  }
  return {
    selectVars: selectVars.length ? ' ' + selectVars.join(' ') : '',
    optionals: optionals.join('\n'),
  }
}

/**
 * Creates parameterized SPARQL query builders.
 * @param {string} instance - The OP instance URL (e.g. 'https://octothorp.es/')
 * @param {Function} [queryArray] - Optional queryArray function for prepEverything
 * @returns {Object} Query builder functions
 */
export const createQueryBuilders = (instance, queryArray) => {

  // Formats URIs as SPARQL records. By default each URI is widened to its
  // www / trailing-slash spellings (#276) so exact subject/object matching
  // treats all four forms of a page as one URL; term IRIs opt out via
  // expand: false (their spelling is canonical, #285/#306). The whole list is
  // deduped — variant sets overlap by construction, and duplicate VALUES rows
  // would produce duplicate solutions.
  const formatUris = (uris, { expand = true } = {}) => [...new Set(
    uris.flatMap((uri) => {
      const raw = uri.startsWith('<') && uri.endsWith('>') ? uri.slice(1, -1) : uri
      return expand ? uriVariants(raw) : [raw]
    })
  )].map((u) => `<${u}>`).join(' ')

  // A formatUris list rendered for FILTER(... NOT IN (...)): comma-separated.
  const notInList = (formatted) => formatted.trim().split(/\s+/).join(', ')

  // Builds the appropriate subject statement according to subject mode
  function buildSubjectStatement(blob) {
    const includeList = blob.include
    const excludeList = blob.exclude
    const mode = blob.mode
    // TKTK review the empty subject problem here
    if (mode === "byParent" && !includeList?.length && !excludeList?.length) {
      console.error('Missing required subject for mode:', mode);
      throw new Error('Must provide a subject in current mode');
    }

    if (!includeList?.length && !excludeList?.length) return ''

    let includeStatement = ''
    let excludeStatement = ''

    if (includeList?.length){
      switch (mode) {
        case 'fuzzy':
          includeStatement = `VALUES ?subList { ${includeList.map(s => `"${s}"`).join(' ')} }
                 FILTER(CONTAINS(STR(?s), ?subList))`
          break
        case 'exact':
          includeStatement = `VALUES ?s { ${formatUris(includeList)} }`
          break
        case 'byParent':
          includeStatement = `VALUES ?parents { ${formatUris(includeList)} }
                 ?parents octo:hasMember ?sdomain .
                 ?sdomain octo:hasPart ?s.`
          break
        case 'byOrigin':
          includeStatement = `VALUES ?sorigin { ${formatUris(includeList.flatMap(originVariants))} }
                 ?sorigin octo:hasPart ?s .`
          break
        default:
      }
    }

    if (excludeList?.length){
      switch (mode) {
        case 'fuzzy':
          excludeStatement = `VALUES ?excludedSubjects { ${excludeList.map(s => `"${s}"`).join(' ')} }
                 FILTER(!CONTAINS(STR(?s), ?excludedSubjects))`
          break
        case 'exact':
          // #276: inline NOT IN list, not a VALUES join — a VALUES row per
          // variant would cross-join every solution against every row, leaking
          // excluded rows back in (and duplicating the rest).
          excludeStatement = `FILTER(?s NOT IN (${notInList(formatUris(excludeList))}))`
          break
        case 'byParent':
        // TKTK no idea if this works until we have multiple webrings
          excludeStatement = `  FILTER NOT EXISTS {
            VALUES ?unwantedParents { ${formatUris(excludeList)} }
            ?unwantedParents octo:hasMember ?sdomain .
            ?sdomain octo:hasPart ?s.
          }`
          break
        case 'byOrigin':
          excludeStatement = `  FILTER NOT EXISTS {
            VALUES ?unwantedOrigins { ${formatUris(excludeList.flatMap(originVariants))} }
            ?unwantedOrigins octo:hasPart ?s .
          }`
          break
        default:
      }
    }

    return `${includeStatement}${excludeStatement}`
  }

  // Builds the appropriate object statement according to object mode
  function buildObjectStatement(blob) {
    const includeList = blob.include
    const excludeList = blob.exclude
    const mode = blob.mode
    const type = blob.type
    // TKTK revisit null object probs
    if (!includeList?.length && !excludeList?.length) {
      let o = []
      return o
    }

    let includeStatement = ''
    let excludeStatement = ''

    if (includeList?.length) {
      switch (mode) {
        case 'exact':
        if (type === "termsOnly") {
          includeStatement = `VALUES ?o { ${processTermObjects(includeList)} }`
        }
            else {
             includeStatement = `VALUES ?o { ${formatUris(includeList)} }`
          }

          break
        case 'fuzzy':
          if (type === "termsOnly") {
            // #253: fold case on read — compare LCASE'd IRIs instead of
            // enumerating cased variants, so any stored casing matches.
            includeStatement = `FILTER(LCASE(STR(?o)) IN (${lcaseTermIriList(includeList)}))`
          }
          else {
            includeStatement = `VALUES ?objList { ${includeList.map(o => `"${o}"`).join(' ')} }
                   FILTER(CONTAINS(STR(?o), ?objList))`
          }
          break
        case 'very-fuzzy':
          const veryFuzzyInclude = processTermObjects(includeList, "very-fuzzy")
          includeStatement = `VALUES ?objList { ${veryFuzzyInclude.map(o => `"${o}"`).join(' ')} }
                   FILTER(CONTAINS(LCASE(STR(?o)), ?objList))`
          break
        case 'all': {
          // #276: variants of ONE input are OR'd (any spelling of the page
          // counts as having it); distinct inputs stay AND'd, one FILTER EXISTS
          // per input, not per variant.
          const groups = includeList.map((item) =>
            type === "termsOnly"
              ? formatUris([termIri(instance, item)], { expand: false })
              : formatUris([item]))
          includeStatement = `VALUES ?o { ${[...new Set(groups.flatMap((g) => g.split(' ')))].join(' ')} }`
          includeStatement += groups.map((g, i) =>
            `\nFILTER EXISTS { VALUES ?allMatch${i} { ${g} } ?s octo:octothorpes ?allMatch${i} . }`
          ).join('')
          break
        }
        default:
          includeStatement = ''
      }
    }

    if (excludeList?.length) {
      switch (mode) {
        case 'exact': {
          // #276: route by type like the include path — URL targets must not be
          // term-ified, and must exclude all www / trailing-slash spellings.
          // Inline NOT IN, not a VALUES join (see subject exclusion).
          const excluded = type === "termsOnly"
            ? processTermObjects(excludeList)
            : formatUris(excludeList)
          excludeStatement = `FILTER(?o NOT IN (${notInList(excluded)}))`
          break
        }
        case 'fuzzy':
          if (type === "termsOnly") {
            // #253: case-insensitive exclusion, mirror of the include path
            excludeStatement = `FILTER(LCASE(STR(?o)) NOT IN (${lcaseTermIriList(excludeList)}))`
          }
          else {
            excludeStatement = `VALUES ?excludedObjList { ${excludeList.map(o => `"${o}"`).join(' ')} }
                   FILTER(!CONTAINS(STR(?o), ?excludedObjList))`
          }
          break
        case 'very-fuzzy':
          const veryFuzzyExclude = processTermObjects(excludeList, "very-fuzzy")
          excludeStatement = `VALUES ?excludedObjList { ${veryFuzzyExclude.map(o => `"${o}"`).join(' ')} }
                   FILTER(!CONTAINS(LCASE(STR(?o)), ?excludedObjList))`
          break
        default:
          excludeStatement = ''
      }
    }

    return `${includeStatement}${excludeStatement}`
  }

  // #253: lowercased, deduped term-IRI string list for case-insensitive
  // comparison against LCASE(STR(?o)). Fuzzy variants cover separator styles;
  // LCASE covers casing, so any stored casing matches any query casing.
  // #328: a term has ONE canonical segment (termIriSegment). The legacy
  // %-encoded non-ASCII spelling minted by the pre-#306 RDFa path is no
  // longer bridged; stragglers normalize on re-index.
  const lcaseTermIriList = (terms) =>
    [...new Set(getFuzzyTags(terms)
      .map((t) => termIriSegment(t))
      .map((seg) => `${instance}~/${seg}`.toLowerCase()))]
      .map((iri) => `"${iri}"`)
      .join(', ')

  // Converts terms to URIs and will getFuzzyTags when mode is fuzzy
  function processTermObjects(terms, mode="exact") {
    if (typeof terms === 'string') {
      terms = [terms]
    }
    let output = terms
    if (mode === "fuzzy") {
      output = getFuzzyTags(terms)
    }
    if (mode === "very-fuzzy") {
      // #253: comparison side is LCASE'd, so only lowercase variants are needed.
      // #306/#328: CONTAINS runs against the stored IRI string, which is
      // percent-encoded by termIri — encode variants the same way. One
      // canonical spelling only; legacy encoded forms are not bridged.
      return [...new Set(getFuzzyTags(terms)
        .map((t) => termIriSegment(t))
        .map((seg) => seg.toLowerCase()))]
    }
    else {
      output = output.map((item) => termIri(instance, item))
      // expand: false — term IRIs have one canonical spelling; www/slash
      // widening (#276) applies to page URLs only.
      return formatUris(output, { expand: false })
    }
  }

  // Filter objects by rdf:type
  // use as objectTypes[objects.type]
  const objectTypes = {
    termsOnly: `?o rdf:type ${typeRef(CLASS.Term)} .`,
    pagesOnly: `?o rdf:type ${typeRef(CLASS.Page)} .`,
    notTerms: `MINUS { ?o rdf:type ${typeRef(CLASS.Term)} }`,
    all: ''
  }

  function createDateFilter(dR, varName = 'postDate', fallbackVar = null) {
    const filters = [];
    const expr = fallbackVar ? `COALESCE(?${varName}, ?${fallbackVar})` : `?${varName}`;
    if (dR.after) {
      filters.push(`${expr} >= ${dR.after}`);
    }
    if (dR.before) {
      filters.push(`${expr} <= ${dR.before}`);
    }
    return filters.length ? `FILTER (${filters.join(' && ')})` : '';
  }

  function cleanQuery(q) {
    return q.replace(/[\r\n]+/gm, '')
  }

  /**
   * Test utility to debug MultiPass to SPARQL query conversion
   */
  const testQueryFromMultiPass = ({
    meta, subjects, objects, filters
    }) => {
      var processedObjs = processTermObjects(objects.include)
      return {
        subjectStatement: buildSubjectStatement(subjects),
        objectStatement: buildObjectStatement(objects),
        processedObjs: processedObjs,
        dateFilter: createDateFilter(filters.dateRange),
        objectTypes: objectTypes[objects.type]
    }
  }

  function getStatements(subjects, objects, filters, resultMode) {
    const hasSubjects = subjects.include.length > 0 || subjects.exclude.length > 0
    const hasObjects = objects.include.length > 0 || objects.exclude.length > 0
    // C9 (#236): a subtype-only query (the `by` word of a declared link type,
    // e.g. /get/everything/reviewed, or its /get/<path>/posted alias) constrains the
    // result set by the relationship subtype alone, with no subject/object. The
    // subtype FILTER EXISTS is itself a bounding constraint, so admit it as one
    // (mirrors the relationTerms allowance) rather than rejecting as unbounded.
    if (!hasSubjects && !hasObjects && !(filters.relationTerms?.length > 0) && !filters.subtype) {
      // Not a validity problem: the query is well-formed, but with nothing to
      // bound it we refuse to run it over the whole store (#313).
      throw new QueryError('valid query refused as unbounded: add s, o, or rt to bound it');
    }

    const subjectStatement = buildSubjectStatement(subjects)
    const objectStatement = buildObjectStatement(objects)
    const dateFilter = filters.dateRange ? createDateFilter(filters.dateRange, 'postDate', 'date') : ""
    const createdFilter = filters.createdRange ? createDateFilter(filters.createdRange, 'createdDate') : ""
    const indexedFilter = filters.indexedRange ? createDateFilter(filters.indexedRange, 'indexedDate') : ""

    let subtypeFilter = ""
    let relationTermsFilter = ""

    const hasSubtype = !!filters.subtype
    const hasRelationTerms = filters.relationTerms && filters.relationTerms.length > 0

    if (hasSubtype && hasRelationTerms) {
      // Merged: both constraints on the same blank node
      const termUris = filters.relationTerms.map(t => `<${termIri(instance, t)}>`).join(' ')
      subtypeFilter = `FILTER EXISTS {
        ?s octo:octothorpes ?_stBn .
        FILTER(isBlank(?_stBn))
        ?_stBn octo:url ?o .
        ?_stBn rdf:type <octo:${filters.subtype}> .
        VALUES ?relationTerm { ${termUris} }
        ?_stBn octo:octothorpes ?relationTerm .
      }`
    } else if (hasSubtype) {
      subtypeFilter = `FILTER EXISTS {
        ?s octo:octothorpes ?_stBn .
        FILTER(isBlank(?_stBn))
        ?_stBn octo:url ?o .
        ?_stBn rdf:type <octo:${filters.subtype}> .
      }`
    } else if (hasRelationTerms) {
      const termUris = filters.relationTerms.map(t => `<${termIri(instance, t)}>`).join(' ')
      relationTermsFilter = `FILTER EXISTS {
        ?s octo:octothorpes ?_rtBn .
        FILTER(isBlank(?_rtBn))
        VALUES ?relationTerm { ${termUris} }
        ?_rtBn octo:octothorpes ?relationTerm .
      }`
    }

    let limitFilter = filters.limitResults
    if (limitFilter != "0" && limitFilter != "no-limit" && !isNaN(parseInt(limitFilter)) && resultMode != "blobjects") {
      limitFilter = `LIMIT ${limitFilter}`
    }
    else {
      limitFilter = ""
    }

    // Offset
    let offsetFilter = filters.offsetResults
    if (offsetFilter != "" && !isNaN(parseInt(offsetFilter)) && resultMode != "blobjects") {
      offsetFilter = `OFFSET ${offsetFilter}`
    }
    else {
      offsetFilter = ""
    }
    return {
      subjectStatement: subjectStatement,
      objectStatement: objectStatement,
      subtypeFilter: subtypeFilter,
      relationTermsFilter: relationTermsFilter,
      dateFilter: dateFilter,
      createdFilter: createdFilter,
      indexedFilter: indexedFilter,
      limitFilter: limitFilter,
      offsetFilter: offsetFilter
    }
  }

  /**
   * Executes a two-phase query for everything endpoint to avoid timeouts
   */
  const prepEverything = async ({
    meta, subjects, objects, filters
    }) => {
    if (!queryArray) throw new Error('queryArray required for prepEverything')
    // Phase 1: Use buildSimpleQuery to get list of subject URLs with limits and offsets
    const subjectQuery = buildSimpleQuery({
      meta, subjects, objects, filters
      });
    const subjectResults = await queryArray(subjectQuery);
    // console.log(subjectResults)
    // Extract subject URIs from first query
    const incls = subjectResults.results.bindings
      .filter(binding => binding.s && binding.s.type === 'uri')
      .map(binding => binding.s.value)
      .filter((value, index, array) => array.indexOf(value) === index); // Remove duplicates

    let subjectUris = {}
    subjectUris.include = incls
    subjectUris.exclude = []
    subjectUris.mode = "exact"

    return subjectUris
  }

  /**
   * Builds a comprehensive SPARQL query for retrieving complete blobjects with metadata
   */
  const buildEverythingQuery = async ({
    meta, subjects, objects, filters, documentRecordSchema
    }) => {
    const subjectList = await prepEverything({
      meta, subjects, objects, filters
    });

    if (!subjectList.include.length > 0 && !subjectList.exclude.length > 0) {
      return `SELECT ?s ?p ?o WHERE {
        ?s ?p ?o .
        FILTER(false)
      }`;
    }
    const statements = getStatements(subjectList, objects, filters, meta.resultMode)
    const dr = buildDocumentRecordClauses(documentRecordSchema)
    let noObjectHandler = ""

    // #202: a page first written as a link target never gets octo:created, even
    // after it is indexed itself. Under byOrigin the hasPart edge already proves
    // ownership, so created is only a date there, not a gate.
    const createdClause = subjects.mode === 'byOrigin'
      ? `?s rdf:type ?pageType .
        OPTIONAL { ?s octo:created ?date . }`
      : `?s octo:created ?date .
        ?s rdf:type ?pageType .`
    if (objects.type === 'none') {
      noObjectHandler = `UNION
      {
        ${statements.subjectStatement}
        ${createdClause}
        OPTIONAL { ?s octo:title ?title }
        OPTIONAL { ?s octo:image ?image }
        OPTIONAL { ?s octo:description ?description }
        OPTIONAL { ?s octo:postDate ?postDate }
        OPTIONAL {
          ?s ?blankNodePred ?blankNode .
          FILTER(isBlank(?blankNode))
          ?blankNode ?bnp ?blankNodeObj .
          FILTER(!isBlank(?blankNodeObj))
        }
        ${dr.optionals}
        BIND("" AS ?o)
        BIND("" AS ?oType)
        BIND("" AS ?ot)
        BIND("" AS ?od)
        BIND("" AS ?oimg)
        FILTER NOT EXISTS {
          ?s octo:octothorpes ?anyObject .
        }
      }`;
    }
    const query = `SELECT DISTINCT ?s ?o ?title ?description ?image ?date ?postDate ?pageType ?ot ?od ?oimg ?oType ?blankNode ?blankNodePred ?blankNodeObj${dr.selectVars}
    WHERE {
      {
        ${statements.subjectStatement}
        ${statements.subtypeFilter}
        ${statements.relationTermsFilter}
        ?s ?o ?date .
        ?s rdf:type ?pageType .
        ?s octo:octothorpes ?o .
        OPTIONAL { ?o rdf:type ?oType. }
        OPTIONAL { ?s octo:title ?title }
        OPTIONAL { ?s octo:image ?image }
        OPTIONAL { ?s octo:description ?description }
        OPTIONAL { ?s octo:postDate ?postDate }
        OPTIONAL { ?o octo:title ?ot }
        OPTIONAL { ?o octo:description ?od }
        OPTIONAL { ?o octo:image ?oimg }
        ${dr.optionals}
        OPTIONAL {
          ?s octo:octothorpes ?blankNode .
          FILTER(isBlank(?blankNode))
          ?blankNode octo:url ?o .
          ?blankNode ?bnp ?blankNodeObj .
          FILTER(!isBlank(?blankNodeObj))
        }
        ${statements.createdFilter ? `OPTIONAL { ?s octo:created ?createdDate . } ${statements.createdFilter}` : ''}
        ${statements.indexedFilter ? `OPTIONAL { ?s octo:indexed ?indexedDate . } ${statements.indexedFilter}` : ''}
      }
      ${noObjectHandler}
    }
    ORDER BY DESC(COALESCE(?postDate, ?date))
    `
    return cleanQuery(query)
  }

  /**
   * Builds a simple SPARQL query for basic page/listings retrieval
   */
  const buildSimpleQuery = ({
    meta, subjects, objects, filters
    }) => {
    const statements = getStatements(subjects, objects, filters, meta.resultMode)
    const includeObjects = objects.type !== 'none'

    // Build SELECT clause conditionally
    const selectClause = includeObjects
      ? 'SELECT DISTINCT ?s ?o ?title ?description ?image ?date ?postDate ?pageType ?ot ?od ?oimg'
      : 'SELECT DISTINCT ?s ?title ?description ?image ?date ?postDate ?pageType'

    // Build object-related clauses conditionally.
    //
    // #282: every REQUIRED triple pattern must be emitted before the first
    // OPTIONAL in this group. Oxigraph 0.4+ will not hoist a required pattern
    // above a LeftJoin, so one stranded below the OPTIONAL stack makes the
    // planner left-join against an unconstrained intermediate — 11s vs 23ms on
    // a 68k-triple store, scaling as store size × result rows. `?s rdf:type
    // ?pageType` used to sit below these OPTIONALs; that was the whole bug.
    //
    // Safe because the reassociation Join(LeftJoin(P, B), C) -> LeftJoin(Join(P, C), B)
    // holds only when C shares no variables with B beyond those P already binds.
    // Here C is `?s rdf:type ?pageType`: ?pageType appears in no OPTIONAL, and
    // ?s / ?o are bound by the preceding required patterns. Re-check that
    // condition before moving anything else across this boundary.
    const objectClauses = includeObjects ? `
      ${statements.subtypeFilter}
      ${statements.relationTermsFilter}
      ${statements.objectStatement}
      ?s octo:octothorpes ?o .
      ${objectTypes[objects.type]}
      ?s ?o ?date .
      ?s rdf:type ?pageType .
      OPTIONAL { ?o octo:title ?ot . }
      OPTIONAL { ?o octo:description ?od . }
      OPTIONAL { ?o octo:image ?oimg . }
    ` : subjects.mode === 'byOrigin' ? `
      ?s rdf:type ?pageType .
      OPTIONAL { ?s octo:created ?date . }
    ` : `
      ?s octo:created ?date .
      ?s rdf:type ?pageType .
    `

    const query = `${selectClause}
    WHERE {
      ${statements.subjectStatement}
      ${objectClauses}
      OPTIONAL { ?s octo:postDate ?postDate . }
      ${statements.dateFilter}
      ${statements.createdFilter ? `OPTIONAL { ?s octo:created ?createdDate . } ${statements.createdFilter}` : ''}
      ${statements.indexedFilter ? `OPTIONAL { ?s octo:indexed ?indexedDate . } ${statements.indexedFilter}` : ''}
      OPTIONAL { ?s octo:title ?title . }
      OPTIONAL { ?s octo:image ?image . }
      OPTIONAL { ?s octo:description ?description . }
    }
      ORDER BY DESC(COALESCE(?postDate, ?date))
      ${statements.limitFilter}
      ${statements.offsetFilter}
    `
    return cleanQuery(query)
  }

  /**
   * Builds a SPARQL query specifically for retrieving hashtag/term listings
   */
  const buildThorpeQuery = ({
    meta, subjects, objects, filters
    }) => {
    const statements = getStatements(subjects, objects, filters, meta.resultMode)
    const query = `SELECT DISTINCT ?o ?date
    WHERE {
      ${statements.subjectStatement}
      ${statements.objectStatement}

         ?o rdf:type ${typeRef(CLASS.Term)} .
         ?s ?o ?date .
         ?s octo:octothorpes ?o
         }
      ORDER BY DESC(?date)
      ${statements.limitFilter}
      ${statements.offsetFilter}
    `
    return cleanQuery(query)
  }

  /**
   * Builds a SPARQL query for retrieving domain/origin listings
   */
  const buildDomainQuery = ({
    meta, subjects, objects, filters
  }) => {
    let limitFilter = filters.limitResults
    if (limitFilter != "0" && limitFilter != "no-limit" && !isNaN(parseInt(limitFilter))) {
      limitFilter = `LIMIT ${limitFilter}`
    }
    else {
      limitFilter = ""
    }

    // Offset
    let offsetFilter = filters.offsetResults
    if (offsetFilter != "" && !isNaN(parseInt(offsetFilter))) {
      offsetFilter = `OFFSET ${offsetFilter}`
    }
    else {
      offsetFilter = ""
    }
    let query = ""
    const subjectList = subjects.include.toString()
    if (subjects.mode === "byParent") {
      query = `SELECT DISTINCT ?s ?title ?description ?image ?date WHERE {
        VALUES ?parents { <${subjectList}> }
        ?parents octo:hasMember ?s .
       OPTIONAL { ?s octo:title ?title }
       OPTIONAL { ?s octo:image ?image }
       OPTIONAL { ?s octo:description ?description }
       }
        ${limitFilter}
        ${offsetFilter}
       `
      }
      else {
        query = `select * {
          ?s rdf:type ${typeRef(CLASS.Origin)} .
          ?s octo:verified "true" .
          optional { ?s octo:banned ?b . }
        }
        ${limitFilter}
        ${offsetFilter}
        `
      }
    return cleanQuery(query)
  }

  return {
    buildSimpleQuery,
    buildEverythingQuery,
    buildThorpeQuery,
    buildDomainQuery,
    prepEverything,
    getStatements,
    buildSubjectStatement,
    buildObjectStatement,
    testQueryFromMultiPass,
    buildDocumentRecordClauses,
  }
}
