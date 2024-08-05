import { instance } from '$env/static/private'
import { queryBoolean, insert, query } from '$lib/sparql.js'

const extantAssertion = async (source, uri, tags) => {
  return await queryBoolean(`
    ask {
      <${source}> octo:asserts ?node .
      ?node rdf:type <octo:Assertion> .
      ?node octo:uri <${uri}> .
      ${tags}
    }
  `)
}

export const assert = async (source, searchParams) => {
  let uuid = crypto.randomUUID()

  if (searchParams.has("uri") && searchParams.has("octothorpes")) {
    let tags = searchParams
      .get('octothorpes')
      .split(',')
      .map(term => `<${instance}${uuid}> octo:octothorpes <${instance}~/${term}> .`)
      .reduce((acc, cur) => `${acc}
        ${cur}`, ``)
    let check = searchParams
      .get('octothorpes')
      .split(',')
      .map(term => `?node octo:octothorpes <${instance}~/${term}> .`)
      .reduce((acc, cur) => `${acc}
        ${cur}`, ``)

    let base = `
      <${source}> octo:asserts <${instance}${uuid}> .
      <${instance}${uuid}> rdf:type <octo:Assertion> .
      <${instance}${uuid}> octo:uri <${searchParams.get('uri')}> .`
    let triples = `${base}`
    triples = `${triples} ${tags}`
    const isExtantAssertion = await extantAssertion(source, searchParams.get('uri'), check)
    if (isExtantAssertion) {
      return false
    }
    let r = await query(`
      delete {
        <${source}> octo:asserts ?node .
        ?node octo:uri <https://octothorp.es/> .
        ?node ?p ?o .
      } where {
        <${source}> octo:asserts ?node .
        ?node octo:uri <https://octothorp.es/> .
        ?node ?p ?o .
      }
    `)
    await insert(triples)
  } else {
    return false
  }
  return true
}