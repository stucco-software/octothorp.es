import { queryBoolean, queryArray, buildQuery } from '$lib/sparql.js'
import { getBlobject } from '$lib/processors.js'

import { instance } from '$env/static/private'
import normalizeUrl from 'normalize-url';

// TKTK seeing a parseRequest utility that we can break out from the query builder
// and thinking we should structure the API to put distinct query builds on their own endpoints
// and use parseRequest to talk to them and return results


export async function processParams(params, url) {


  const thorpePath = instance+"~/"
  
    // defaults
    let s = "?s"
    let o = "?o"
    const searchParams = url.searchParams;
    // searchParams is in get string
    // params is api path

    const subjects = searchParams.get('s') ? searchParams.get('s').split(',') : `?s`
    const objects = searchParams.get('o') ? searchParams.get('o').split(',') : `?o` 


  // TKTK process flags and filters once you set the structure

    let subjectMode = ""
    let objectMode = "exact"
    // let objectType = objFlag <<<


    function isFuzzy (uris, flag) { 
      let output = false 
      if ( flag === "fuzzySubject" || flag === "something else?") {
        output = true
      }
      else {
        uris.forEach((s) => {
          if (!s.startsWith("http")) {
            output = true
          }
        })
      }
      return output
  }

  function processUrls (urls, mod = "norm") {
      if (urls === `?s` || urls === `?o`) {
        return urls
      }
      else {
        let output = []
        if (mod === "norm") {
          // this should probably respect http: when set explicitly
          output = urls.map((item) => normalizeUrl(item, {forceHttps: true}))
        }
        else if (mod === "pre") {
          let inst = thorpePath
          output = urls.map((item) => inst + item)
        }
        // 
        return output
      }
    }

    if ( objFlag === "fuzzy") {
        objectMode = "fuzzy"
    }
    
    if ( isFuzzy(subjects) ) {
      subjectMode = "fuzzy"
    }
    else {
      subjectMode = "exact"
    }

    // mode = thorpes
      s = processUrls(subjects)
      o = processUrls(objects, "pre")

    // mode = links 

    o = processUrls(objects)


    const queryTerms = {
    subjectList: s,
    objectList: o,
    subjectMode: subjectMode,
    objectMode: objectMode,
    objectType: objectType
    }

    return queryTerms
  }




  // Set matchType based on params or subject structure
  // TKTK the check function should probably be outsourced to a matcher
  if (params.flag) {

    // else {
    //       return "Error: not a supported flag. Try any of the following flags, or no flag at all: distinct, contains, fuzzy"
    // }
  }


export async function load({ params, url }) {

  // processParams
  // processUrls according to mode/endpoint
  // query = buildSparqlQuery(s, o, mode)
  // const sr = await queryArray(query)
  // getBlobject(flag) << need a handler for whether to return blobject or 


    const queryTerms = processParams(params)
    const query = buildQuery(queryTerms)
    const sr = await queryArray(query)  
    const getResults = await getBlobject(sr)
    console.log(getResults)
    return {
        query: {
          mode: params.mode,
          flag: params.flag,
          subjects,
          objects   
        },
              queryString: query,
        results: getResults
    }
  }


// >> This logic moves to the api structure

  if (mode === "thorpes" || mode === "octothorpes" || mode === "everything") {
    s = processUrls(subjects)
    o = processUrls(objects, "pre")
  }
  else if ( mode === "backlinks") {
    
    // UPDATE 3/27 -- this now happens in the harmonizer step, so this should check for type 
    // TKTK -- to be thorough we should also have matchType checking here
    // and the previous UPDATE is no longer valid if we move to inferring link types instead of using blank nodes

    s = processUrls(subjects)
    o = processUrls(objects)
  }
  /* TKTK add modes:
      - mentions
      - bookmarks
      - webring << is this a flag??
  */

      // TKTK -- set up a matcher function
  else {
    return "Error: not a supported mode. Use 'thorpes' or 'backlinks'"
  }
  
  // TKTK return s, o, mode and flag maybe. 
  // actually return an array of all the things

  

  // TKTK we should bring back the ability to return object-focused results for when blobjects aren't necessarily useful
  // previous approach is below. Example would be on the /thorpes/ endpoint
  // thinking that it should just be a blobject that only has the subject object on it

  // const getResults = sr.results.bindings
  //   .map(b => {
  //     return {
  //       subject: {
  //         uri: b.s.value,
  //         title: b.title ? b.title.value : null,
  //         description: b.description ? b.description.value : null
  //     },
  //       object: {
  //         uri: b.o.value,
  //         title: b.ot ? b.ot.value : null,
  //         description: b.od ? b.od.value : null
  //       }
  //     }
  //   })








// concise blobject

// {
//   "@id": "https://example.url",
//   "title": "url title",
//   "description": "url description",
//   "image": "https://example.url/og-image.jpg",
//   "contact": "contact@example.url",
//   "type": "",
//   "octothorpes": [
//     "octothorpes",
//     "demo"
//   ]
// }


