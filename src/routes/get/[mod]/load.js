import { queryBoolean, queryArray } from '$lib/sparql.js'
import { instance } from '$env/static/private'
import normalizeUrl from 'normalize-url';




export async function load({ params, url }) {
  const searchParams = url.searchParams;
  const subs = searchParams.get('sub') ? searchParams.get('sub').split(',') : `?s`
  const objs = searchParams.get('obj') ? searchParams.get('obj').split(',') : `?o` 


  function processUrls (urls, _func ="norm") {
    if (urls === `?s` || urls === `?o`) {
      return urls
    }
    else {
      let processedUrls = []
      if (_func === "norm") {
        processedUrls = urls.map((item) => normalizeUrl(item, {forceHttps: true}))
      }
      else if (_func === "pre") {
        let inst = instance+"~/"
        processUrls = urls.map((item) => inst + item)
      }
      return processedUrls.join('|')
    }
  }

  function thorpeQuery (subjects, objects) {

    let s = processUrls(subjects)
    let o = processUrls(objects, "pre")

      let query = `SELECT DISTINCT ?s ?o ?t ?d
      WHERE {
        ?s octo:octothorpes ?o
        VALUES ?url {
        "${s}"
        }
          VALUES ?thorpes {
          "${o}"

        }
        FILTER(CONTAINS(STR(?s), ?url))
        FILTER(CONTAINS(STR(?o), ?thorpes))
        OPTIONAL { ?s octo:title ?t . }
        OPTIONAL { ?s octo:description ?d . }
      }
      `
      return query.replace(/[\r\n]+/gm, '');

  }

  function backlinkQuery (subjects, objects) {

    let s = processUrls(subjects);
    let o = processUrls(objects);
    // process subjects
    // process objects
    
    // let query = `SELECT DISTINCT ?uri ?t ?d {
    //   ?s octo:octothorpes <${}> .
    //   ?s octo:uri ?uri .
    //   optional { ?s octo:title ?t . }
    //   optional { ?s octo:description ?d . }
    //  }`
  
     let query = `SELECT DISTINCT ?s ?o ?t ?d
      WHERE {
        ?s octo:octothorpes ?o ;
          (octo:title|octo:description)? ?t .
        FILTER(REGEX(STR(?s), "${s}"))
        FILTER(REGEX(STR(?o), "${o}"))
        OPTIONAL { ?s octo:title ?t }
        OPTIONAL { ?s octo:description ?d }
      }`
      return query.replace(/[\r\n]+/gm, '');
  }


  const mode = params.mod
  let query = ""

  if (mode === "thorpes") {
    query = thorpeQuery(subs, objs)
  }
  else if ( mode === "backlinks") {
    query = backlinkQuery(subs, objs)
  }
  

  const sr = await queryArray(query)
  const getResults = sr.results.bindings
    .map(b => {
      return {
        uri: b.s.value,
        title: b.t ? b.t.value : null,
        description: b.d ? b.d.value : null
      }
    })
  return {
      func: params.mod,
      subs,
      objs,
      results: getResults,
      query: query
  };
}