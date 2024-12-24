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

  // QUESTION
  // how are we avoiding collisions on randomUUID?
  // ANSWER
  // you don't need to. there are so many that when
  // you make 'em to spec like `crypto` does here
  // the odds of a collision are essentially zero.

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
        // QUESTION
        // 1. could we externalize the content of base to define
        //    schema for other assertions, perhaps with the below
        //    as a hardcoded default ?
        // ANSWER
        // Yeah the base shape of the assertion could be a function;
        // like…
        // const baseAssert = ({source, uuid, instance, uri}) => ``
        // but even more fundamentally the bits that matter are
        // rdf:type and the verb, here octo:asserts.
        // That could come from anywhere

    let base = `
      <${source}> octo:asserts <${instance}${uuid}> .
      <${instance}${uuid}> rdf:type <octo:Assertion> .
      <${instance}${uuid}> octo:uri <${searchParams.get('uri')}> .`
    let triples = `${base}`
    triples = `${triples} ${tags}`
        // QUESTION
        // 2. Wherever it comes from, can we
        //    just wang in a new type of statement
        //    here and the system will accept it,
        //    or is there a deeper backend place
        //    where acceptable statements need to
        //    be defined before we can make them
        //    from this context?
        // ANSWER
        // Nope. Thats the magic; there is no deeper
        // there there. Whatever you put in just goes in.
          
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