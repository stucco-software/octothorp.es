import { getFuzzyTags } from './utils.js'

/**
 * Creates parameterized SPARQL query builders.
 * @param {string} instance - The OP instance URL (e.g. 'https://octothorp.es/')
 * @param {Function} [queryArray] - Optional queryArray function for prepEverything
 * @returns {Object} Query builder functions
 */
export const createQueryBuilders = (instance, queryArray) => {
  const thorpePath = `${instance}~/`

  // Formats URIs as SPARQL records
  const formatUris = uris => uris.map(uri =>
    uri.startsWith('<') ? uri : `<${uri}>`
  ).join(' ')

  // Builds the appropriate subject statement according to subject mode
  function buildSubjectStatement(blob) {
    const includeList = blob.include
    const excludeList = blob.exclude
    const mode = blob.mode
    console.log(includeList, excludeList)
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
          excludeStatement = `VALUES ?excludedSubjects { ${formatUris(excludeList)} } FILTER(?s NOT IN (?excludedSubjects))`
          break
        case 'byParent':
        // TKTK no idea if this works until we have multiple webrings
          excludeStatement = `  FILTER NOT EXISTS {
            VALUES ?unwantedParents { ${formatUris(excludeList)} }
            ?unwantedParents octo:hasMember ?sdomain .
            ?sdomain octo:hasPart ?s.
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
            const processedInclude = processTermObjects(includeList, "fuzzy")
            includeStatement = `VALUES ?o { ${processedInclude} }`
          }
          else {
            includeStatement = `VALUES ?objList { ${includeList.map(o => `"${o}"`).join(' ')} }
                   FILTER(CONTAINS(STR(?o), ?objList))`
          }
          break
        case 'very-fuzzy':
          const veryFuzzyInclude = processTermObjects(includeList, "very-fuzzy")
          includeStatement = `VALUES ?objList { ${veryFuzzyInclude.map(o => `"${o}"`).join(' ')} }
                   FILTER(CONTAINS(STR(?o), ?objList))`
          break
        case 'all':
          let allUris
          if (type === "termsOnly") {
            allUris = processTermObjects(includeList)
          } else {
            allUris = formatUris(includeList)
          }
          includeStatement = `VALUES ?o { ${allUris} }`
          const uriList = allUris.split(' ')
          includeStatement += uriList.map(uri =>
            `\nFILTER EXISTS { ?s octo:octothorpes ${uri} . }`
          ).join('')
          break
        default:
          includeStatement = ''
      }
    }

    if (excludeList?.length) {
      switch (mode) {
        case 'exact':
          excludeStatement = `VALUES ?excludedObjects { ${processTermObjects(excludeList)} } FILTER(?o NOT IN (?excludedObjects))`
          break
        case 'fuzzy':
          if (type === "termsOnly") {
            const processedExclude = processTermObjects(excludeList, "fuzzy")
            excludeStatement = `VALUES ?excludedObjList { ${processedExclude.map(o => `"${o}"`).join(' ')} }
                   FILTER(!CONTAINS(STR(?o), ?excludedObjList))`
          }
          else {
            excludeStatement = `VALUES ?excludedObjList { ${excludeList.map(o => `"${o}"`).join(' ')} }
                   FILTER(!CONTAINS(STR(?o), ?excludedObjList))`
          }
          break
        case 'very-fuzzy':
          const veryFuzzyExclude = processTermObjects(excludeList, "very-fuzzy")
          excludeStatement = `VALUES ?excludedObjList { ${veryFuzzyExclude.map(o => `"${o}"`).join(' ')} }
                   FILTER(!CONTAINS(STR(?o), ?excludedObjList))`
          break
        default:
          excludeStatement = ''
      }
    }

    return `${includeStatement}${excludeStatement}`
  }

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
      output = getFuzzyTags(terms)
      return output
    }
    else {
      output = output.map((item) => thorpePath + item)
      return formatUris(output)
    }
  }

  // Filter objects by rdf:type
  // use as objectTypes[objects.type]
  const objectTypes = {
    termsOnly: '?o rdf:type <octo:Term> .',
    pagesOnly: '?o rdf:type <octo:Page> .',
    notTerms: 'MINUS { ?o rdf:type <octo:Term> }',
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
    if (subjects.include.length === 0 && objects.include.length === 0 && !(filters.relationTerms?.length > 0)) {
      console.log("not it")
      throw new Error('Must provide at least subjects, objects, or relationship terms');
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
      const termUris = filters.relationTerms.map(t => `<${instance}~/${t}>`).join(' ')
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
      const termUris = filters.relationTerms.map(t => `<${instance}~/${t}>`).join(' ')
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
    console.log(subjectResults)
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
    meta, subjects, objects, filters
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
    let noObjectHandler = ""

    if (objects.type === 'none') {
      noObjectHandler = `UNION
      {
        ${statements.subjectStatement}
        ?s octo:created ?date .
        ?s rdf:type ?pageType .
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
    const query = `SELECT DISTINCT ?s ?o ?title ?description ?image ?date ?postDate ?pageType ?ot ?od ?oimg ?oType ?blankNode ?blankNodePred ?blankNodeObj
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

    // Build object-related clauses conditionally
    const objectClauses = includeObjects ? `
      ${statements.subtypeFilter}
      ${statements.relationTermsFilter}
      ${statements.objectStatement}
      ?s octo:octothorpes ?o .
      ${objectTypes[objects.type]}
      ?s ?o ?date .
      OPTIONAL { ?o octo:title ?ot . }
      OPTIONAL { ?o octo:description ?od . }
      OPTIONAL { ?o octo:image ?oimg . }
    ` : `
      ?s octo:created ?date .
    `

    const query = `${selectClause}
    WHERE {
      ${statements.subjectStatement}
      ${objectClauses}
      OPTIONAL { ?s octo:postDate ?postDate . }
      ${statements.dateFilter}
      ${statements.createdFilter ? `OPTIONAL { ?s octo:created ?createdDate . } ${statements.createdFilter}` : ''}
      ${statements.indexedFilter ? `OPTIONAL { ?s octo:indexed ?indexedDate . } ${statements.indexedFilter}` : ''}
      ?s rdf:type ?pageType .

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

         ?o rdf:type <octo:Term> .
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
          ?s rdf:type <octo:Origin> .
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
    testQueryFromMultiPass,
    createDateFilter,
  }
}
