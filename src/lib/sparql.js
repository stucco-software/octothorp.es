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
  if (!includeList?.length && !excludeList?.length) return ''

  switch (mode) {
    case 'fuzzy':
      return `VALUES ?subList { ${includeList.map(s => `"${s}"`).join(' ')} }
             FILTER(CONTAINS(STR(?s), ?subList))`
    
    case 'exact':
      return `VALUES ?s { ${formatUris(includeList)} }`
    
    case 'byParent':
      return `VALUES ?parents { ${formatUris(includeList)} }
             ?parents octo:hasPart ?s .`
    
    default:
      return '';
  }
}

// Builds the appropriate object statement according to object mode

function buildObjectStatement(blob) {
   // TKTK add exclude statement

  const includeList = blob.include
  const excludeList = blob.exclude
  const mode = blob.mode
  const type = blob.type
  // TKTK revisit null object probs
  if (!includeList?.length && !excludeList?.length) {
    console.log("No objects provided")
    return null
  }

  switch (mode) {
    case 'exact':
      return `VALUES ?o { ${processTermObjects(includeList)} }`
    case 'fuzzy':
      if (type === "termsOnly") {
        const processedInclude = processTermObjects(includeList, "fuzzy")
        const processedExclude = processTermObjects(excludeList)
        return `VALUES ?o { ${processedInclude} }`
      }
      else {
      return `VALUES ?objList { ${includeList.map(o => `"${o}"`).join(' ')} }
             FILTER(CONTAINS(STR(?o), ?objList))`
      }
    case 'very-fuzzy':
      const veryFuzzyInclude = processTermObjects(includeList, "very-fuzzy")
      return `VALUES ?objList { ${veryFuzzyInclude.map(o => `"${o}"`).join(' ')} }
             FILTER(CONTAINS(STR(?o), ?objList))`
    default:
      return ''
  }


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
  if (!subjects.include.length && !objects.include.length) {
        console.log ("not it")
            throw new Error('Must provide at least subjects or objects');
      }

  const subjectStatement = buildSubjectStatement(subjects)
  const objectStatement = buildObjectStatement(objects)
  const dateFilter = filters.dateRange ? createDateFilter(filters.dateRange) : ""

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

  const query = `SELECT DISTINCT ?s ?o ?title ?description ?image ?date ?pageType ?ot ?od ?oimg ?blankNode ?blankNodePred ?blankNodeObj
  WHERE {
    ${statements.subjectStatement}

    ${statements.objectStatement}

    ?s octo:indexed ?date .
    ${statements.dateFilter}
    ?s rdf:type ?pageType .
    ?s octo:octothorpes ?o .

    ${objectTypes[objects.type]}

    OPTIONAL {
      ?o ?blankNodePred ?blankNode .
      FILTER(isBlank(?blankNode))
      OPTIONAL {
        ?blankNode ?bnp ?blankNodeObj .
        FILTER(!isBlank(?blankNodeObj))
      }
    }
    OPTIONAL { ?s octo:title ?title . }
    OPTIONAL { ?s octo:image ?image . }
    OPTIONAL { ?s octo:description ?description . }
    OPTIONAL { ?o octo:title ?ot . }
    OPTIONAL { ?o octo:description ?od . }
    OPTIONAL { ?o octo:image ?oimg . }
  }
    ORDER BY ?date
  `
  return query.replace(/[\r\n]+/gm, '')
}

export const buildSimpleQuery = ({
  meta, subjects, objects, filters
  }) => {
  const statements = getStatements(subjects, objects, filters, meta.resultMode)

  const query = `SELECT DISTINCT ?s ?o ?title ?description ?image ?date ?pageType
  WHERE {
    ${statements.subjectStatement}

    ${statements.objectStatement}

    ?s octo:indexed ?date .
    ${statements.dateFilter}
    ?s rdf:type ?pageType .
    ?s octo:octothorpes ?o .

    ${objectTypes[objects.type]}


    OPTIONAL { ?s octo:title ?title . }
    OPTIONAL { ?s octo:image ?image . }
    OPTIONAL { ?s octo:description ?description . }
  }
    ORDER BY ?date
    ${statements.limitFilter}
    ${statements.offsetFilter}
  `
  return query.replace(/[\r\n]+/gm, '')
  }