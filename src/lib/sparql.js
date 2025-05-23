import { sparql_endpoint, sparql_user, sparql_password } from '$env/static/private'
import { error, redirect, json } from '@sveltejs/kit';
import jsonld from 'jsonld'
import context from '$lib/ld/context'
import prefixes from '$lib/ld/prefixes'

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
 * Builds a SPARQL query dynamically with flexible subject/object matching
 * @param {Object} params - Configuration options
 * @param {string[]} [params.subjectList] - Array of subject URIs or strings
 * @param {string[]} [params.objectList] - Array of object URIs or strings
 * @param {'fuzzy'|'exact'|'byParent'} [params.subjectMode='exact'] - Subject matching strategy
 * @param {'fuzzy'|'exact'} [params.objectMode='exact'] - Object matching strategy
 * @param {'termsOnly'|'pagesOnly'|'all'} [params.objectType='all'] - Type filter for objects
 * @returns {Promise<string>} Complete SPARQL query string
 * @throws {Error} If neither subjectList nor objectList is provided
 */


export const buildQuery = async ({
  subjectList,
  objectList,
  subjectMode = 'exact',
  objectMode = 'exact',
  objectType = 'all'
}) => {
  // Validate at least one filter exists
  if (!subjectList?.length && !objectList?.length) {
    throw new Error('Must provide at least subjectList or objectList');
  }

  // Format URIs with angle brackets
  const formatUris = uris => uris.map(uri => 
    uri.startsWith('<') ? uri : `<${uri}>`
  ).join(' ');

  // Subject statement builders
  const subjectStatements = {
    fuzzy: subjectList?.length ? 
      `VALUES ?subList { ${subjectList.map(s => `"${s}"`).join(' ')} }
       FILTER(CONTAINS(STR(?s), ?subList))` : '',
    
    exact: subjectList?.length ? 
      `VALUES ?s { ${formatUris(subjectList)} }` : '',
    
    byParent: subjectList?.length ?
      `VALUES ?parents { ${formatUris(subjectList)} }
       ?parents octo:hasPart ?s .` : ''
  };

  // Object statement builders
  const objectStatements = {
    fuzzy: objectList?.length ?
      `VALUES ?objList { ${objectList.map(o => `"${o}"`).join(' ')} }
       FILTER(CONTAINS(STR(?o), ?objList))` : '',
    
    exact: objectList?.length ? 
      `VALUES ?o { ${formatUris(objectList)} }` : ''
  };

  // Object type filters with angle brackets
  const objectTypes = {
    termsOnly: '?o rdf:type <octo:Term> .',
    pagesOnly: '?o rdf:type <octo:Page> .',
    all: ''
  };

  return `SELECT DISTINCT ?s ?o ?title ?description ?image ?date ?pageType ?ot ?od ?oimg ?blankNode ?blankNodePred ?blankNodeObj
WHERE {
  ${subjectStatements[subjectMode]}

  ${objectStatements[objectMode]}

  # Core graph patterns 
  ?s octo:indexed ?date .
  ?s rdf:type ?pageType .
  ?s octo:octothorpes ?o .

  # Object type filter
  ${objectTypes[objectType]}

  # Optional blank node exploration
  OPTIONAL {
    ?o ?blankNodePred ?blankNode .
    FILTER(isBlank(?blankNode))
    OPTIONAL {
      ?blankNode ?bnp ?blankNodeObj .
      FILTER(!isBlank(?blankNodeObj))
    }
  }

  # Optional properties
  ${subjectList?.length ? `
  OPTIONAL { ?s octo:title ?title . }
  OPTIONAL { ?s octo:image ?image . }
  OPTIONAL { ?s octo:description ?description . }` : ''}
  OPTIONAL { ?o octo:title ?ot . }
  OPTIONAL { ?o octo:description ?od . }
  OPTIONAL { ?o octo:image ?oimg . }
}`;
}