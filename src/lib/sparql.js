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


/**
  * Builds a SPARQL query from a valid MultiPass object.
  * Empty defaults are set as empty strings
  * so they can be included in output even if not set
  * @param {Object} params - Configuration options
  * @param {string[]} [params.subjectList] - Array of subject URIs or strings
  * @param {string[]} [params.objectList] - Array of object URIs or strings
  * @param {'fuzzy'|'exact'|'byParent'} [params.subjectMode='exact'] - Subject matching strategy
  * @param {'fuzzy'|'exact'} [params.objectMode='exact'] - Object matching strategy
  * @param {'termsOnly'|'pagesOnly'|'all'} [params.objectType='all'] - Type filter for objects
  * @param {'fuzzy'|'exact'} [params.objectMode='exact'] - Object matching strategy
  * @param {int} [params.limitResults=100] - Value for LIMIT statement
  * @param {int} [params.offsetResults=""] - Value for OFFSET statement
  * @returns {<string>} Complete SPARQL query string
  * @throws {Error} If neither subjectList nor objectList is provided
 */

////////// UTILITIES //////////
 // Format URIs as SPARQL records
  const formatUris = uris => uris.map(uri => 
    uri.startsWith('<') ? uri : `<${uri}>`
  ).join(' ')


// Assuming formatUris is available in scope
function buildSubjectStatement(type, subjectList) {
  if (!subjectList?.length) return null

  switch (type) {
    case 'fuzzy':
      return `VALUES ?subList { ${subjectList.map(s => `"${s}"`).join(' ')} }
             FILTER(CONTAINS(STR(?s), ?subList))`
    
    case 'exact':
      return `VALUES ?s { ${formatUris(subjectList)} }`
    
    case 'byParent':
      return `VALUES ?parents { ${formatUris(subjectList)} }
             ?parents octo:hasPart ?s .`
    
    default:
      return '';
  }
}

function buildObjectStatement(type, objectList) {
  if (!objectList?.length) return null
  
  switch (type) {
    case 'fuzzy':
      return `VALUES ?objList { ${objectList.map(o => `"${o}"`).join(' ')} }
             FILTER(CONTAINS(STR(?o), ?objList))`
    
    case 'exact':
      return `VALUES ?o { ${formatUris(objectList)} }`
    
    default:
      return ''
  }
}

////////// MultiPass > Query //////////

export const buildQueryFromMultiPass = ({
  resultMode,
  subjectList,
  objectList,
  subjectMode = 'exact',
  objectMode = 'exact',
  objectType = 'all',
  limitResults = 100,
  offsetResults = "",
  dateRange = ""
  // TKTK if we need multiple query formats, add param to specify. or break this out into a utility
  }) => {
  // Confirm at least one filter exists
  if (!subjectList?.length && !objectList?.length) {
    throw new Error('Must provide at least subjectList or objectList');
  }

 

  // TKTK CHECK THE refactor of statement builders to be functions <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
  // TKTK ADD EXCLUDE <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

  const subjectStatement = buildSubjectStatement(subjectMode, subjectList)
  // console.log(subjectStatement  )
  // // Subject statement builders
  // const subjectStatements = {
  //   fuzzy: subjectList?.length ? 
  //     `VALUES ?subList { ${subjectList.map(s => `"${s}"`).join(' ')} }
  //      FILTER(CONTAINS(STR(?s), ?subList))` : '',
    
  //   exact: subjectList?.length ? 
  //     `VALUES ?s { ${formatUris(subjectList)} }` : '',
    
  //   byParent: subjectList?.length ?
  //     `VALUES ?parents { ${formatUris(subjectList)} }
  //      ?parents octo:hasPart ?s .` : ''
  // }

  // Object statement builders
  const objectStatement = buildObjectStatement(objectMode, objectList)
  // console.log(objectStatement)

  // const objectStatements = {
  //   fuzzy: objectList?.length ?
  //     `VALUES ?objList { ${objectList.map(o => `"${o}"`).join(' ')} }
  //      FILTER(CONTAINS(STR(?o), ?objList))` : '',
    
  //   exact: objectList?.length ? 
  //     `VALUES ?o { ${formatUris(objectList)} }` : ''
  // }

  // const thorpePath = instance+"~/"
const thorpePath = "https://octothorp.es/~/"
  function processObjects (obs, mode) {
      let inst = thorpePath
      let output = obs
      if (mode === "fuzzy") {
        output = getFuzzyTags(obs)
      }
      return output.map((item) => inst + item)
  }

  /*
  termsOnly, fuzzy:
    getFuzzyTags(objectlist)
    compose using instance
    VALUES = exact list
    
  termsOnly, veryFuzzy:


    pagesOnly, fuzzy:
      VALUES > CONTAINS

    


  */

  // Filter objects by rdf:type 
  const objectTypes = {
    termsOnly: '?o rdf:type <octo:Term> .',
    pagesOnly: '?o rdf:type <octo:Page> .',
    all: ''
  }

  ////////// FILTERS //////////

  // Date 
  let dateFilter = ""

  function createSPARQLFilter(dR) {  
    const filters = [];
    if (dR.after) {
      filters.push(`?date >= ${dR.after}`);
    }
    if (dR.before) {
      filters.push(`?date <= ${dR.before}`);
    }
    return filters.length ? `FILTER (${filters.join(' && ')})` : '';
  }

  if (dateRange != "") {
    dateFilter = createSPARQLFilter(dateRange)
  }

  // Limit

  let limitStatement = ""
  // TKTK not sure if this is the best place to worry about filter mode or if 
  if (limitResults != "0" && limitResults != "no-limit" && !isNaN(parseInt(limitResults)) && resultMode != "blobjects") {
    limitStatement = `LIMIT ${limitResults}`
  }
  
  // Offset
  let offsetStatement = ""
  if (offsetResults != "" && !isNaN(parseInt(offsetResults))) {
    offsetStatement = `OFFSET ${offsetResults}`
  }

  ////////// SPARQL //////////

  const query = `SELECT DISTINCT ?s ?o ?title ?description ?image ?date ?pageType ?ot ?od ?oimg ?blankNode ?blankNodePred ?blankNodeObj
  WHERE {
    ${subjectStatement}

    ${objectStatement}

    ?s octo:indexed ?date .
    ${dateFilter}
    ?s rdf:type ?pageType .
    ?s octo:octothorpes ?o .

    ${objectTypes[objectType]}

    OPTIONAL {
      ?o ?blankNodePred ?blankNode .
      FILTER(isBlank(?blankNode))
      OPTIONAL {
        ?blankNode ?bnp ?blankNodeObj .
        FILTER(!isBlank(?blankNodeObj))
      }
    }

    ${subjectList?.length ? `
    OPTIONAL { ?s octo:title ?title . }
    OPTIONAL { ?s octo:image ?image . }
    OPTIONAL { ?s octo:description ?description . }` : ''}
    OPTIONAL { ?o octo:title ?ot . }
    OPTIONAL { ?o octo:description ?od . }
    OPTIONAL { ?o octo:image ?oimg . }
  }
    ORDER BY ?date
  ${limitStatement}
  ${offsetStatement}  
  `
  return query.replace(/[\r\n]+/gm, '')
}