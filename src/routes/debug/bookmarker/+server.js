import { json, error } from '@sveltejs/kit'
import {rdfa2triples} from '$lib/ld/rdfa2triples'
import {asyncMap} from '$lib/asyncmap'
import getRdfaGraph from 'graph-rdfa-processor'
import context from '$lib/ld/context.json'
import jsonld from 'jsonld'
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
  const smolctx = {
    "@base": "https://vocab.octothorp.es",
    "@vocab": "#",
    "type": "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
    "Bookmark": "https://vocab.octothorp.es#Bookmark",
    "bookmarks": {
      "@id": "bookmarks",
      "@type": "@id"
    }
  }
  const flat = await jsonld.compact(dataset, smolctx)
  let bookmarks = flat['@graph']
    .filter(n => n["@id"] !== input)
  let blanks = bookmarks.map(n => n["@id"])
  bookmarks = [{
    "@id": input,
    "bookmarks": blanks
  }, ...bookmarks]
  let framed = await jsonld.frame({
    "@context": smolctx,
    '@graph': bookmarks
  }, {
    '@id': input,
    'bookmarks': {
      '@id': {},
      'url': {},
      "octothorpes": {}
    }
  })
  return framed
}

export async function GET({url}) {
  let defaultURL = 'https://demo.ideastore.dev'
  let uris = url
    .searchParams
    .get('uri')
    .split(',') ?? [defaultURL]
  let urls = uris
    .map(url => new URL(url))
    .map(url => normalizeUrl(`${url.origin}${url.pathname}`))
  let r
  try {
    r = await asyncMap(urls, getBookmarks)
  } catch (e) {
    console.log(e)
  }
  console.log(r)
  return json(r)
}


