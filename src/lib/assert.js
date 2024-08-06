import { instance } from '$env/static/private'
import { queryBoolean, insert, query } from '$lib/sparql.js'
import { asyncMap} from '$lib/asyncMap.js'
import emailAdministrator from "$lib/emails/alertAdmin.js"

const extantTerm = async (o) => {
  return await queryBoolean(`
    ask {
      ?s ?p <${o}> .
    }
  `)
}

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

const recordCreation = async (o) => {
  let now = Date.now()
  return await insert(`
    <${o}> octo:created ${now} .
    <${o}> rdf:type <octo:Term> .
  `)
}

export const assert = async (source, searchParams) => {
  let uuid = crypto.randomUUID()

  if (searchParams.has("uri") && searchParams.has("octothorpes")) {
    let thorpes = searchParams
      .get('octothorpes')
      .split(',')

    await asyncMap(thorpes, async (term) => {
      let isExtantTerm = await extantTerm(`${instance}~/${term}`)

      if (!isExtantTerm) {
        await recordCreation(`${instance}~/${term}`)
        await emailAdministrator({s: source, o: `${instance}~/${term}`})
      }
    })

    let tags = thorpes
      .map(term => `<${instance}${uuid}> octo:octothorpes <${instance}~/${term}> .`)
      .reduce((acc, cur) => `${acc}
        ${cur}`, ``)

    let check = thorpes
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