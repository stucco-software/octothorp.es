import { sparql_endpoint, sparql_user, sparql_password } from '$env/static/private'
import { error, redirect, json } from '@sveltejs/kit';
import jsonld from 'jsonld'
import context from '$lib/ld/context'
import prefixes from '$lib/ld/prefixes'

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
      .then(result => result.json())
  return triples
}

export const queryBoolean = async query => {
  let triples = await getTriples('application/sparql-results+json')(query)
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