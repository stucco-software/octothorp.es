import { sparql_endpoint, sparql_user, sparql_password } from '$env/static/private'
import { instance } from '$env/static/private'
// import { error, redirect, json } from '@sveltejs/kit';
// import jsonld from 'jsonld'
// import context from '$lib/ld/context'
import prefixes from '$lib/ld/prefixes'
import { getFuzzyTags } from '$lib/utils';

if (import.meta.vitest) {
  const { it, expect } = import.meta.vitest
  it.skip('Returns an empty array if input is false', () => {
    // TEST TK: Not sure how I want to unit test these buddies yet.
    //   They might neeed to be refactored to seperate the unit logic
    //   from the side effect `fetch`?
    expect('a').toStrictEqual('b')
  })
}

const headers = new Headers()
headers.set('Authorization', 'Basic ' + btoa(sparql_user + ":" + sparql_password));

const getTriples = (accept) => async (query) => await fetch(`${sparql_endpoint}/query`, {
  method: 'POST',
  headers: headers,
  body: new URLSearchParams({
    'query': `${prefixes}
    ${query}`
  })
})

/**
 * Executes a SPARQL SELECT query and returns results as an array of bindings
 * @param {string} query - The SPARQL SELECT query to execute
 * @returns {Promise<Object>} Promise resolving to SPARQL query results with bindings
 * @throws {Error} If the SPARQL query fails or response is not valid JSON
 * @example
 * const results = await queryArray('SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 10')
 */
export const queryArray = async query => {
  let triples = await getTriples('application/sparql-results+json')(query)
      .then(async result => {
        if (!result.ok) {
          const text = await result.text();
          console.error('SPARQL Error:', text);
          throw new Error(`SPARQL query failed: ${text}`);
        }
        return result.json();
      })
      .catch(error => {
        console.error('JSON Parse Error:', error);
        throw error;
      });
  return triples;
}

/**
 * Executes a SPARQL ASK query and returns a boolean result
 * @param {string} query - The SPARQL ASK query to execute
 * @returns {Promise<boolean>} Promise resolving to the boolean result of the ASK query
 * @throws {Error} If the SPARQL query fails
 * @example
 * const exists = await queryBoolean('ASK { <http://example.com/> octo:verified "true" }')
 */
export const queryBoolean = async query => {
  let triples = await getTriples('application/sparql-results+json')(query)
  let json = await triples.json()
  return json.boolean
}

/**
 * Inserts RDF data into the SPARQL database using INSERT DATA
 * @param {string} nquads - The RDF data to insert in N-Quads format
 * @returns {Promise<Response>} Promise resolving to the fetch response
 * @throws {Error} If the insert operation fails
 * @example
 * await insert('<http://example.com/page> octo:title "Example Page" .')
 */
export const insert = async nquads => await fetch(`${sparql_endpoint}/update`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(sparql_user + ":" + sparql_password),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      'update': `${prefixes}
        insert data {
${nquads}
      }`
    })
  }).catch((error) => {
    console.error('Error:', error);
  }
)

/**
 * Executes a SPARQL UPDATE query (INSERT, DELETE, etc.)
 * @param {string} nquads - The SPARQL UPDATE query to execute
 * @returns {Promise<Response>} Promise resolving to the fetch response
 * @throws {Error} If the update operation fails
 * @example
 * await query('DELETE { ?s ?p ?o } WHERE { ?s ?p ?o . FILTER(?s = <http://example.com/>) }')
 */
export const query = async nquads => await fetch(`${sparql_endpoint}/update`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(sparql_user + ":" + sparql_password),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      'update': `${prefixes}
${nquads}
      `
    })
  }).catch((error) => {
    console.error('Error:', error);
  }
)




////////// SPARQL-SPECIFIC UTILITIES //////////


  const thorpePath = `${instance}~/`
// const thorpePath = "https://octothorp.es/~/"


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
    // console.log("No objects provided")
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
  function processTermObjects (terms, mode="exact") {
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

  // Date filter

  function createDateFilter(dR) {
    const filters = [];
    if (dR.after) {
      filters.push(`?date >= ${dR.after}`);
    }
    if (dR.before) {
      filters.push(`?date <= ${dR.before}`);
    }
    return filters.length ? `FILTER (${filters.join(' && ')})` : '';
  }

  function cleanQuery(q) {
    return q.replace(/[\r\n]+/gm, '')
  }


  ////////// TEST TEST TEST //////////

  /**
   * Test utility to debug MultiPass to SPARQL query conversion
   * @param {Object} params - MultiPass parameters
   * @param {Object} params.meta - Query metadata
   * @param {Object} params.subjects - Subject configuration
   * @param {Object} params.objects - Object configuration
   * @param {Object} params.filters - Filter configuration
   * @returns {Object} Debug information including generated SPARQL fragments
   * @example
   * const debugInfo = testQueryFromMultiPass(multiPassObject)
   */
  export const testQueryFromMultiPass = ({
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


///////////////////////////////////////
////////// MultiPass > Query //////////
///////////////////////////////////////

////////// MultiPass > Statements utility //////////

/**
  * Builds a SPARQL query from a valid MultiPass object.
  * Empty defaults are set as empty strings
  * so they can be included in output even if not set
 */

function getStatements (subjects, objects, filters, resultMode) {
  // Confirm at least one subject or object exists
  // even if they added filters for now we're not allow filtering the whole graph

  // TKTK ADD EXCLUDE


  if (!subjects.include.length > 0 && !objects.include.length > 0) {
        console.log ("not it")
            throw new Error('Must provide at least subjects or objects');
      }

  const subjectStatement = buildSubjectStatement(subjects)
  const objectStatement = buildObjectStatement(objects)
  const dateFilter = filters.dateRange ? createDateFilter(filters.dateRange) : ""
  let subtypeFilter = ""
  if (filters.subtype ) {
     subtypeFilter = `FILTER EXISTS {
      ?o ?blankNodePred ?blankNode .
      FILTER(isBlank(?blankNode))
      ?blankNode ?bnp ?blankNodeObj .
      FILTER(!isBlank(?blankNodeObj) && ?blankNodeObj = <octo:${filters.subtype}>)
    }`
    console.log(subtypeFilter)
  }


  let limitFilter = filters.limitResults
  if (limitFilter != "0" && limitFilter != "no-limit" && !isNaN(parseInt(limitFilter)) && resultMode != "blobjects") {
    limitFilter = `LIMIT ${limitFilter}`
  }
  else {
    // TKTK eventually make smarter decisions about limits on blobjects mode
    limitFilter = ""
  }

  // Offset
  let offsetFilter = filters.offsetResults
  if (offsetFilter != "" && !isNaN(parseInt(offsetFilter)) && resultMode != "blobjects" ) {
    offsetFilter = `OFFSET ${offsetFilter}`
  }
  else {
    offsetFilter = ""
  }
  return {
    subjectStatement: subjectStatement,
    objectStatement: objectStatement,
    subtypeFilter: subtypeFilter,
    dateFilter: dateFilter,
    limitFilter: limitFilter,
    offsetFilter: offsetFilter
  }
}

////////// /get/everything //////////


/**
 * Executes a two-phase query for everything endpoint to avoid timeouts
 * @param {Object} multiPass - The multiPass object containing query parameters
 * @returns {Promise<Object>} Promise resolving to SPARQL query results with bindings
 * @throws {Error} If the SPARQL query fails
 */
export const prepEverything = async ({
  meta, subjects, objects, filters
  }) => {
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

  // console.log(subjectUris)
  return subjectUris
 }

/**
 * Builds a comprehensive SPARQL query for retrieving complete blobjects with metadata
 * @param {Object} params - MultiPass configuration object
 * @param {Object} params.meta - Query metadata including result mode
 * @param {Object} params.subjects - Subject filtering configuration
 * @param {Object} params.objects - Object filtering configuration
 * @param {Object} params.filters - Additional filters (date range, subtype, etc.)
 * @returns {string} Complete SPARQL SELECT query for retrieving blobjects
 * @example
 * const query = buildEverythingQuery(multiPass)
 * const results = await queryArray(query)
 */
export const buildEverythingQuery = async ({
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
  const query = `SELECT DISTINCT ?s ?o ?title ?description ?image ?date ?pageType ?ot ?od ?oimg ?oType ?blankNode ?blankNodePred ?blankNodeObj
  WHERE {
    {
      ${statements.subjectStatement}
      ${statements.subtypeFilter}
      ?s ?o ?date .
      ?s rdf:type ?pageType .
      ?s octo:octothorpes ?o .
      OPTIONAL { ?o rdf:type ?oType. }
      OPTIONAL { ?s octo:title ?title }
      OPTIONAL { ?s octo:image ?image }
      OPTIONAL { ?s octo:description ?description }
      OPTIONAL { ?o octo:title ?ot }
      OPTIONAL { ?o octo:description ?od }
      OPTIONAL { ?o octo:image ?oimg }
      OPTIONAL {
        ?s ?blankNodePred ?blankNode .
        FILTER(isBlank(?blankNode))
        ?blankNode ?bnp ?blankNodeObj .
        FILTER(!isBlank(?blankNodeObj))
      }
    }
    ${noObjectHandler}
  }
  ORDER BY DESC(?date)
  `
  return cleanQuery(query)
}

/**
 * Builds a simple SPARQL query for basic page/listings retrieval
 * @param {Object} params - MultiPass configuration object
 * @param {Object} params.meta - Query metadata including result mode
 * @param {Object} params.subjects - Subject filtering configuration
 * @param {Object} params.objects - Object filtering configuration
 * @param {Object} params.filters - Additional filters (date range, subtype, etc.)
 * @returns {string} SPARQL SELECT query for simple page listings
 * @example
 * const query = buildSimpleQuery(multiPass)
 * const results = await queryArray(query)
 */
export const buildSimpleQuery = ({
  meta, subjects, objects, filters
  }) => {
  const statements = getStatements(subjects, objects, filters, meta.resultMode)
  const includeObjects = objects.type !== 'none'

  // Build SELECT clause conditionally
  const selectClause = includeObjects
    ? 'SELECT DISTINCT ?s ?o ?title ?description ?image ?date ?pageType ?ot ?od ?oimg'
    : 'SELECT DISTINCT ?s ?title ?description ?image ?date ?pageType'

  // Build object-related clauses conditionally
  const objectClauses = includeObjects ? `
    ${statements.subtypeFilter}
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
    ${statements.dateFilter}
    ?s rdf:type ?pageType .

    OPTIONAL { ?s octo:title ?title . }
    OPTIONAL { ?s octo:image ?image . }
    OPTIONAL { ?s octo:description ?description . }
  }
    ORDER BY DESC(?date)
    ${statements.limitFilter}
    ${statements.offsetFilter}
  `
  return cleanQuery(query)
  }


/**
 * Builds a SPARQL query specifically for retrieving hashtag/term listings
 * @param {Object} params - MultiPass configuration object
 * @param {Object} params.meta - Query metadata including result mode
 * @param {Object} params.subjects - Subject filtering configuration
 * @param {Object} params.objects - Object filtering configuration
 * @param {Object} params.filters - Additional filters (date range, subtype, etc.)
 * @returns {string} SPARQL SELECT query for term/hashtag listings
 * @example
 * const query = buildThorpeQuery(multiPass)
 * const results = await queryArray(query)
 */
export const buildThorpeQuery = ({
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
 * @param {Object} params - MultiPass configuration object
 * @param {Object} params.meta - Query metadata including result mode
 * @param {Object} params.subjects - Subject filtering configuration
 * @param {Object} params.objects - Object filtering configuration
 * @param {Object} params.filters - Additional filters (date range, subtype, etc.)
 * @returns {string} SPARQL SELECT query for domain/origin listings
 * @example
 * const query = buildDomainQuery(multiPass)
 * const results = await queryArray(query)
 */
export const buildDomainQuery = ({
  meta, subjects, objects, filters
}) => {
  // TKTK do domains have dates?
  // as is apparent this is doing very little filtering rn

  let limitFilter = filters.limitResults
  if (limitFilter != "0" && limitFilter != "no-limit" && !isNaN(parseInt(limitFilter))) {
    limitFilter = `LIMIT ${limitFilter}`
  }
  else {
    // TKTK eventually make smarter decisions about limits on blobjects mode
    limitFilter = ""
  }

  // Offset
  let offsetFilter = filters.offsetResults
  if (offsetFilter != "" && !isNaN(parseInt(offsetFilter)) ) {
    offsetFilter = `OFFSET ${offsetFilter}`
  }
  else {
    offsetFilter = ""
  }
  let query = ""
  const subjectList = subjects.include.toString()
  // TKTK not sure if using both hasPart and hasMember will
  // cause any problems at any point
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
