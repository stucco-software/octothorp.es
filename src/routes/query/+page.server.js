import { queryArray, buildEverythingQuery, buildSimpleQuery, buildThorpeQuery, buildDomainQuery } from '$lib/sparql.js'
import { getBlobjectFromResponse } from '$lib/converters.js'
import { parseBindings } from '$lib/utils'

export const actions = {
  default: async ({ request }) => {
    const formData = await request.formData()
    const multipassInput = formData.get('multipass')

    try {
      const multiPass = JSON.parse(multipassInput)
      let query = ""
      let actualResults = ""

      // Determine what type of query based on meta.resultMode or explicit what parameter
      const what = multiPass.what || (multiPass.meta?.resultMode === 'blobjects' ? 'everything' : 'pages')

      // Use the same logic as load.js
      switch (what) {
        case "pages":
        case "links":
        case "backlinks":
          query = buildSimpleQuery(multiPass)
          const sr = await queryArray(query)
          actualResults = parseBindings(sr.results.bindings)
          break

        case "everything":
          query = await buildEverythingQuery(multiPass)
          const bj = await queryArray(query)
          actualResults = await getBlobjectFromResponse(bj, multiPass.filters)
          break

        case "thorpes":
          query = buildThorpeQuery(multiPass)
          const tr = await queryArray(query)
          actualResults = parseBindings(tr.results.bindings, "terms")
          break

        case "domains":
          query = buildDomainQuery(multiPass)
          const dr = await queryArray(query)
          actualResults = parseBindings(dr.results.bindings)
          break

        default:
          throw new Error(`Invalid query type: ${what}`)
      }

      return { 
        success: true,
        results: actualResults,
        multiPass: multiPass,
        what: what
      }
    } catch (err) {
      return {
        success: false,
        error: err.message
      }
    }
  }
}
