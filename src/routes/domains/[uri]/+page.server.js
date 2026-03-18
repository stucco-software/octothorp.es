import { queryArray } from '$lib/sparql.js'
import { isSparqlSafe } from 'octothorpes'
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
    SELECT DISTINCT ?s ?title ?description ?image ?date ?postDate ?o ?oType ?bnUrl ?bnType ?bnTerm
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
        OPTIONAL { ?o octo:url ?bnUrl . }
        OPTIONAL { ?o rdf:type ?bnType . }
        OPTIONAL { ?o octo:octothorpes ?bnTerm . }
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
      const isBlankNode = binding.o.type === 'bnode'
      let oType = binding.oType?.value || ''
      if (oType.startsWith('octo:')) oType = oType.substring(5)

      if (oType === 'Term') {
        // Term octothorpe (always a URI, never a blank node)
        const termValue = binding.o.value.substring(binding.o.value.lastIndexOf('~/') + 2)
        if (!current.octothorpes.includes(termValue)) {
          current.octothorpes.push(termValue)
        }
      } else if (isBlankNode && binding.bnUrl?.value) {
        // Blank node with subtype (Bookmark, Cite, Backlink)
        const targetUrl = binding.bnUrl.value
        let bnType = binding.bnType?.value || 'Link'
        if (bnType.startsWith('octo:')) bnType = bnType.substring(5)

        let relationTerm = null
        if (binding.bnTerm?.value?.includes('/~/')) {
          relationTerm = binding.bnTerm.value.substring(
            binding.bnTerm.value.lastIndexOf('~/') + 2
          )
        }

        const existingIndex = current.octothorpes.findIndex(
          item => typeof item === 'object' && item.uri === targetUrl
        )

        if (existingIndex === -1) {
          const newEntry = { uri: targetUrl, type: bnType }
          if (relationTerm) newEntry.terms = [relationTerm]
          current.octothorpes.push(newEntry)
        } else {
          // Prefer subtype over generic 'link'
          if (bnType !== 'Link' && bnType !== 'Page') {
            current.octothorpes[existingIndex].type = bnType
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
      } else if (!isBlankNode) {
        // Direct page-to-page link (URI, not a blank node, not a Term)
        const targetUrl = binding.o.value
        const existingIndex = current.octothorpes.findIndex(
          item => typeof item === 'object' && item.uri === targetUrl
        )
        if (existingIndex === -1) {
          current.octothorpes.push({ uri: targetUrl, type: 'Link' })
        }
      }
      // Skip blank nodes without bnUrl (shouldn't happen, but defensive)
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
