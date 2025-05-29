import { json } from '@sveltejs/kit'
import prefixes from '$lib/ld/prefixes'
import { queryArray } from '$lib/sparql.js'

export async function GET({ url }) {
  let params = [...url.searchParams.entries()]
  // lol gross
  let p = params[0][0]
  let o = params[0][1] ? params[0][1] : `?o`

  // How should this work?
  // 1. Get Multiple Thorpes in One Query
  //   a. Boolean combinator logics
  // 2. Everythign Attached to URL
  // 3. Everything by Domain

  // const getTermsByDomain = (domains) => {
  //   return {[
  //     term,
  //     thorpes,
  //     bookmarks
  //   ]}
  // }

  const query = `select *
    where {
      ?s octo:${p} <https://octothorp.es/~/${o}> .
    }
  `

  let results = await queryArray(query)
  console.log(`${prefixes}${query}`)

  // return new Response(String(`${prefixes}${query}`))
  return json(results)
}