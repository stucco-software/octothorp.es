import { json, error } from '@sveltejs/kit'
import { queryArray, enrichBlobjectTargets, createDateFilter } from '$lib/sparql.js'
import { getBlobjectFromResponse } from '$lib/converters.js'
import { parseDateStrings } from '$lib/utils.js'

export async function GET({ url }) {
  // Parse params
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200)
  const offset = parseInt(url.searchParams.get('offset') || '0')
  const whenParam = url.searchParams.get('when') || ''
  const createdParam = url.searchParams.get('created') || ''
  const indexedParam = url.searchParams.get('indexed') || ''

  // Parse date filters
  let dateRange, createdRange, indexedRange
  try {
    dateRange = parseDateStrings(whenParam)
    createdRange = parseDateStrings(createdParam)
    indexedRange = parseDateStrings(indexedParam)
  } catch (err) {
    return json({ error: 'Invalid date filter' }, { status: 400 })
  }

  // Build date filter clauses
  const dateFilter = Object.keys(dateRange).length
    ? createDateFilter(dateRange, 'postDate') : ''
  const createdFilter = Object.keys(createdRange).length
    ? createDateFilter(createdRange, 'createdDate') : ''
  const indexedFilter = Object.keys(indexedRange).length
    ? createDateFilter(indexedRange, 'indexedDate') : ''

  // Phase 1: get page URIs
  const phase1 = `
    SELECT DISTINCT ?s WHERE {
      ?s rdf:type <octo:Page> .
      ?origin octo:hasPart ?s .
      ?origin octo:verified "true" .
      OPTIONAL { ?s octo:postDate ?postDate }
      OPTIONAL { ?s octo:indexed ?indexedDate }
      ${createdFilter ? `OPTIONAL { ?s octo:created ?createdDate } ${createdFilter}` : ''}
      ${indexedFilter ? `OPTIONAL { ?s octo:indexed ?indexedDate } ${indexedFilter}` : ''}
      ${dateFilter}
    }
    ORDER BY DESC(COALESCE(?postDate, ?indexedDate))
    LIMIT ${limit} OFFSET ${offset}
  `

  const phase1Result = await queryArray(phase1)
  const uris = phase1Result.results.bindings
    .filter(b => b.s && b.s.type === 'uri')
    .map(b => b.s.value)
    .filter((v, i, a) => a.indexOf(v) === i)

  if (uris.length === 0) {
    return json({ results: [] })
  }

  // Phase 2: full blobject data
  const values = uris.map(u => `<${u}>`).join(' ')
  const phase2 = `
    SELECT DISTINCT ?s ?o ?title ?description ?image ?date ?postDate ?pageType ?ot ?od ?oimg ?oType ?blankNode ?blankNodePred ?blankNodeObj
    WHERE {
      {
        VALUES ?s { ${values} }
        ?s rdf:type ?pageType .
        ?s octo:octothorpes ?o .
        ?s octo:created ?date .
        OPTIONAL { ?o rdf:type ?oType }
        OPTIONAL { ?s octo:title ?title }
        OPTIONAL { ?s octo:image ?image }
        OPTIONAL { ?s octo:description ?description }
        OPTIONAL { ?s octo:postDate ?postDate }
        OPTIONAL { ?o octo:title ?ot }
        OPTIONAL { ?o octo:description ?od }
        OPTIONAL { ?o octo:image ?oimg }
        OPTIONAL {
          ?s ?blankNodePred ?blankNode .
          FILTER(isBlank(?blankNode))
          ?blankNode ?bnp ?blankNodeObj .
          FILTER(!isBlank(?blankNodeObj))
        }
      }
      UNION
      {
        VALUES ?s { ${values} }
        ?s rdf:type ?pageType .
        ?s octo:created ?date .
        OPTIONAL { ?s octo:title ?title }
        OPTIONAL { ?s octo:image ?image }
        OPTIONAL { ?s octo:description ?description }
        OPTIONAL { ?s octo:postDate ?postDate }
        OPTIONAL {
          ?s ?blankNodePred ?blankNode .
          FILTER(isBlank(?blankNode))
          ?blankNode ?bnp ?blankNodeObj .
          FILTER(!isBlank(?blankNodeObj))
        }
        BIND("" AS ?o)
        BIND("" AS ?oType)
        BIND("" AS ?ot)
        BIND("" AS ?od)
        BIND("" AS ?oimg)
        FILTER NOT EXISTS {
          ?s octo:octothorpes ?anyObject .
        }
      }
    }
  `

  const phase2Result = await queryArray(phase2)
  const filters = { limitResults: String(limit), offsetResults: '0' }
  let results = await getBlobjectFromResponse(phase2Result, filters)
  results = await enrichBlobjectTargets(results)

  return json({ results })
}
