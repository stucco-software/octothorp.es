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

export const queryArray = async query => {
  let triples = await getTriples('application/sparql-results+json')(query)
      .then(result => {
        return result.json()
      })
  return triples
}

export const queryBoolean = async query => {
  console.log(`query bool`)
  console.log(query)
  let triples = await getTriples('application/sparql-results+json')(query)
  console.log(triples)
  let json = await triples.json()
  return json.boolean
}

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


  // const thorpePath = instance+"~/"
const thorpePath = "https://octothorp.es/~/"


 // Formats URIs as SPARQL records
  const formatUris = uris => uris.map(uri =>
    uri.startsWith('<') ? uri : `<${uri}>`
  ).join(' ')


// Builds the appropriate subject statement according to subject mode
function buildSubjectStatement(blob) {
  const includeList = blob.include
  const excludeList = blob.exclude
  const mode = blob.mode
  console.log (includeList, excludeList)
  // TKTK review the empty subject problem here
  if (!includeList?.length && !excludeList?.length && mode === "byParent") throw new Error('Must provide a subject in current mode');


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
               ?parents octo:hasPart ?sdomain .
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
          ?unwantedParents octo:hasPart ?sdomain .
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
        includeStatement = `VALUES ?o { ${processTermObjects(includeList)} }`
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

export const buildEverythingQuery = ({
  meta, subjects, objects, filters
  }) => {
  const statements = getStatements(subjects, objects, filters, meta.resultMode)

  const query = `SELECT DISTINCT ?s ?o ?title ?description ?image ?date ?pageType ?ot ?od ?oimg ?oType ?blankNode ?blankNodePred ?blankNodeObj
  WHERE {
    ${statements.subjectStatement}

    ${statements.subtypeFilter}

    ${statements.objectStatement}

    ?s octo:indexed ?date .
    ?s rdf:type ?pageType .
    ?s octo:octothorpes ?o .
    ?o rdf:type ?oType.

    ${objectTypes[objects.type]}
    OPTIONAL {
        ?o ?blankNodePred ?blankNode .
        FILTER(isBlank(?blankNode))
        OPTIONAL {
          ?blankNode ?bnp ?blankNodeObj .
          FILTER(!isBlank(?blankNodeObj))
        }
      }

        OPTIONAL { ?s octo:title ?title }
        OPTIONAL { ?s octo:image ?image }
        OPTIONAL { ?s octo:description ?description }
        OPTIONAL { ?o octo:title ?ot }
        OPTIONAL { ?o octo:description ?od }
        OPTIONAL { ?o octo:image ?oimg }
  }
    ORDER BY ?date
  `
  return cleanQuery(query)
}

export const buildSimpleQuery = ({
  meta, subjects, objects, filters
  }) => {
  const statements = getStatements(subjects, objects, filters, meta.resultMode)

  const query = `SELECT DISTINCT ?s ?o ?title ?description ?image ?date ?pageType ?ot ?od ?oimg
  WHERE {
    ${statements.subjectStatement}

    ${statements.subtypeFilter}

    ${statements.objectStatement}

    ?s octo:indexed ?date .
    ${statements.dateFilter}
    ?s rdf:type ?pageType .
    ?s octo:octothorpes ?o .

    ${objectTypes[objects.type]}


    OPTIONAL { ?s octo:title ?title . }
    OPTIONAL { ?s octo:image ?image . }
    OPTIONAL { ?s octo:description ?description . }
    OPTIONAL { ?o octo:title ?ot . }
    OPTIONAL { ?o octo:description ?od . }
    OPTIONAL { ?o octo:image ?oimg . }
  }
    ORDER BY ?date
    ${statements.limitFilter}
    ${statements.offsetFilter}
  `
  return cleanQuery(query)
  }

export const buildThorpeQuery = ({
  meta, subjects, objects, filters
  }) => {
  const statements = getStatements(subjects, objects, filters, meta.resultMode)
  // const query = `SELECT DISTINCT ?s ?o ?date WHERE {    VALUES ?subList { "demo.ideastore.dev" }               FILTER(CONTAINS(STR(?s), ?subList))   ?o rdf:type <octo:Term> .         ?s ?o ?date .    ?s octo:octothorpes ?o   }    ORDER BY ?date `
  const query = `SELECT DISTINCT ?o ?date
  WHERE {
    ${statements.subjectStatement}
    ${statements.objectStatement}

       ?o rdf:type <octo:Term> .
       ?s ?o ?date .
       ?s octo:octothorpes ?o
       }
    ORDER BY ?date
    ${statements.limitFilter}
    ${statements.offsetFilter}
  `
  return cleanQuery(query)


  }

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
  if (subjects.mode === "byParent") {
    query = `SELECT DISTINCT ?s ?o ?title ?description ?image ?date WHERE {
      VALUES ?parents { <${subjectList}> }
      ?parents octo:hasPart ?s .
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
  console.log(query)
  return cleanQuery(query)

}

/*
WEBRINGS HO!

PREFIX oc: <http://opencoinage.org/rdf/>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX octo: <https://vocab.octothorp.es#>

SELECT DISTINCT ?domain ?page ?o ?domainTitle ?pageTitle ?description ?image ?date ?pageType
WHERE {
  # Get all domains in the webring
  <https://demo.ideastore.dev/rad-webring> octo:hasPart ?domain .

  # Get all pages that belong to these domains
  ?domain octo:hasPart ?page .

  # Get domain metadata
  OPTIONAL { ?domain octo:title ?domainTitle }

  # Get page metadata
  ?page rdf:type ?pageType ;
        octo:indexed ?date ;
        octo:octothorpes ?o <<<< unexpected doubling
  OPTIONAL { ?page octo:title ?pageTitle }
  OPTIONAL { ?page octo:description ?description }
  OPTIONAL { ?page octo:image ?image }
}
ORDER BY ?date
*/
