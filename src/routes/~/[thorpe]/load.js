import { queryBoolean, queryArray } from '$lib/sparql.js'
import { getProfile } from '$lib/profile.js'
import { caseInsensitiveTermClause } from 'octothorpes'

const instance = getProfile().identity.instance

export async function load(req) {
  // grt query params here
  // SvelteKit already decodes params; decoding again throws on terms like `100%` (#285)
  const term = req.params.thorpe
  // Full-URL params (backlink targets) keep exact matching; term names match
  // case-insensitively on read (#253) — stored casing is untouched.
  let matchClause
  try {
    new URL(term)
    matchClause = `?s octo:octothorpes <${term}> .`
  } catch (err) {
    matchClause = caseInsensitiveTermClause(instance, term)
  }

  const sr = await queryArray(`
    SELECT DISTINCT ?s ?t ?d ?postDate ?date {
     ${matchClause}
     optional { ?s octo:title ?t . }
     optional { ?s octo:description ?d . }
     optional { ?s octo:postDate ?postDate . }
     optional { ?s octo:indexed ?date . }
    }
  `)
  const thorpes = sr.results.bindings
    .map(b => {
      return {
        uri: b.s.value,
        title: b.t ? b.t.value : null,
        description: b.d ? b.d.value : null,
        postDate: b.postDate ? parseInt(b.postDate.value) : null,
        date: b.date ? parseInt(b.date.value) : null
      }
    })
    .filter(node => !node.uri.startsWith(instance))
    // filter out the things you dont want based on your query

  const sa = await queryArray(`
    SELECT DISTINCT ?uri ?t ?d ?postDate ?date {
     ${matchClause}
     ?s octo:uri ?uri .
     optional { ?s octo:title ?t . }
     optional { ?s octo:description ?d . }
     optional { ?s octo:postDate ?postDate . }
     optional { ?s octo:indexed ?date . }
    }
  `)
  const bookmarks = sa.results.bindings
    .map(b => {
      return {
        uri: b.uri.value,
        title: b.t ? b.t.value : null,
        description: b.d ? b.d.value : null,
        postDate: b.postDate ? parseInt(b.postDate.value) : null,
        date: b.date ? parseInt(b.date.value) : null
      }
    })

  // rturn this thorpe and all subjects which thorpe it
  return {
    uri: instance,
    term,
    thorpes,
    bookmarks
  }
}