import { json, error } from '@sveltejs/kit'
import {rdfa2triples} from '$lib/ld/rdfa2triples'
import context from '$lib/ld/context.json'
import jsonld from 'jsonld'
import getRdfaGraph from 'graph-rdfa-processor'
import jsonldRdfaParser from 'jsonld-rdfa-parser'
// TKTK import testHarmonizer for more fun
import { JSDOM } from 'jsdom'
import normalizeUrl from 'normalize-url'

// This could be a new harmonizer api
// this functions sucks ass tho
const getBookmarks = async (input) => {
  let dom = await JSDOM.fromURL(input)
  let doc = dom.window.document
  let opts = {baseURI: input};
  let graph = getRdfaGraph(doc, opts)
  let dataset = Object.values(graph.subjects)
    .map(s => {
      let obj = {
        '@id': s.id
      }
      let p = Object.values(s.predicates)
        .map(val => {
          obj[val.id] = val.objects.map(o => o.value)
          return obj
        })
      return obj
    })
  const flat = await jsonld.compact(dataset, {
    "@base": "https://vocab.octothorp.es",
    "@vocab": "#",
    "type": "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
    "Bookmark": "https://vocab.octothorp.es#Bookmark"
  })
  let bookmarks = flat['@graph']
    .filter(n => n["@id"] !== input)
  let blanks = bookmarks.map(n => n["@id"])
  bookmarks = [{
    "@id": input,
    "bookmarks": blanks
  }, ...bookmarks]
  return bookmarks
}

export async function GET({url}) {
  let defaultURL = 'https://demo.ideastore.dev'
  let uri = url.searchParams.get('uri') ?? defaultURL
  uri = new URL(uri)
  let s = normalizeUrl(`${uri.origin}${uri.pathname}`)
  let origin = normalizeUrl(uri.origin)
  let r
  try {
    r = await getBookmarks(s)
  } catch (e) {
    console.log(e)
  }
  console.log(r)
  return json(r)
}


