import { queryArray } from '$lib/sparql.js'
import { isSparqlSafe } from '$lib/utils.js'
import { error } from '@sveltejs/kit'

const thorpePath = 'https://octothorp.es/~/'

export async function load({ params }) {
  const domain = decodeURIComponent(params.uri)
  const domainForQuery = domain.replace(/^https?:\/\//, '')

  // Validate input before interpolating into SPARQL
  const validation = isSparqlSafe(domainForQuery)
  if (!validation.valid) {
    throw error(400, validation.error)
  }

  const response = await queryArray(`
    SELECT DISTINCT ?s ?title ?description ?image ?date ?postDate ?o ?oType ?blankNodeObj
    WHERE {
      ?s rdf:type <octo:Page> .
      FILTER(CONTAINS(STR(?s), "${domainForQuery}"))
      OPTIONAL { ?s octo:title ?title . }
      OPTIONAL { ?s octo:description ?description . }
      OPTIONAL { ?s octo:image ?image . }
      OPTIONAL { ?s octo:indexed ?date . }
      OPTIONAL { ?s octo:postDate ?postDate . }
      OPTIONAL {
        ?s octo:octothorpes ?o .
        OPTIONAL { ?o rdf:type ?oType . }
      }
      OPTIONAL {
        ?s ?bnPred ?blankNode .
        FILTER(isBlank(?blankNode))
        ?blankNode ?bnp ?blankNodeObj .
        FILTER(!isBlank(?blankNodeObj))
      }
    }
    ORDER BY DESC(?date)
  `)

  // Group bindings into blobject-like structure (mirrors getBlobjectFromResponse)
  const urlMap = {}

  response.results.bindings.forEach(binding => {
    const url = binding.s.value

    if (!urlMap[url]) {
      urlMap[url] = {
        '@id': url,
        title: null,
        description: null,
        image: null,
        date: null,
        postDate: null,
        octothorpes: []
      }
    }

    const current = urlMap[url]

    if (binding.title?.value && !current.title) {
      current.title = binding.title.value
    }
    if (binding.description?.value && !current.description) {
      current.description = binding.description.value
    }
    if (binding.image?.value && !current.image) {
      current.image = binding.image.value
    }
    if (binding.date?.value && !current.date) {
      current.date = parseInt(binding.date.value)
    }
    if (binding.postDate?.value && !current.postDate) {
      current.postDate = parseInt(binding.postDate.value)
    }

    // Process octothorpes
    if (binding.o?.value) {
      const targetUrl = binding.o.value
      let oType = binding.oType?.value || ''

      if (oType.startsWith('octo:')) {
        oType = oType.substring(5)
      }

      if (oType === 'Term') {
        const termValue = targetUrl.substring(targetUrl.lastIndexOf('~/') + 2)
        if (!current.octothorpes.includes(termValue)) {
          current.octothorpes.push(termValue)
        }
      } else {
        oType = 'link'
        if (binding.blankNodeObj?.value?.startsWith('octo:')) {
          oType = binding.blankNodeObj.value.substring(5)
        }

        let relationTerm = null
        if (binding.blankNodeObj?.value?.includes('/~/')) {
          relationTerm = binding.blankNodeObj.value.substring(
            binding.blankNodeObj.value.lastIndexOf('~/') + 2
          )
        }

        const existingIndex = current.octothorpes.findIndex(
          item => typeof item === 'object' && item.uri === targetUrl
        )

        if (existingIndex === -1) {
          const newEntry = { uri: targetUrl, type: oType }
          if (relationTerm) newEntry.terms = [relationTerm]
          current.octothorpes.push(newEntry)
        } else {
          if (oType !== 'link') {
            current.octothorpes[existingIndex].type = oType
          }
          if (relationTerm) {
            if (!current.octothorpes[existingIndex].terms) {
              current.octothorpes[existingIndex].terms = []
            }
            if (!current.octothorpes[existingIndex].terms.includes(relationTerm)) {
              current.octothorpes[existingIndex].terms.push(relationTerm)
            }
          }
        }
      }
    }
  })

  const pages = Object.values(urlMap)

  // Derive thorpes list from the same data -- collect all octothorpes across all pages
  const thorpeMap = new Map()
  for (const page of pages) {
    for (const t of page.octothorpes) {
      if (typeof t === 'string') {
        if (!thorpeMap.has(t)) thorpeMap.set(t, { term: t, type: 'Term' })
      } else if (t.uri) {
        // For page relationships, extract a display name from the URI
        const term = t.uri.startsWith(thorpePath)
          ? t.uri.substring(thorpePath.length)
          : t.uri
        if (!thorpeMap.has(term)) thorpeMap.set(term, { term, type: t.type })
      }
    }
  }
  const thorpes = Array.from(thorpeMap.values())

  return { domain, domainForQuery, pages, thorpes }
}
