import { queryBoolean, queryArray, buildQuery } from '$lib/sparql.js'
import { queryToBlobject } from '$lib/processors.js'

import { instance } from '$env/static/private'
import normalizeUrl from 'normalize-url';


// searchParams is in get string
    // params is api path

    // object mode should come from params
    /*
      FORMAT << params
        rss
        concise < short blobject
        raw < nonblobject
        default: json
        (yaml, trtl?)
      LIMIT
        default: 100
        int
      OFFSET
        > note that you can define an OFFSET statement but
        > cursor-based (ie after a certain record) is better
      WHEN
        RECENT
        after-timestamp
        before-timestamp
      MATCH
        exact
        fuzzy
        fuzzy-s
        fuzzy-o
    
    */







export async function load({ params, url }) {

  // processParams
  // processUrls according to mode/endpoint
  // query = buildSparqlQuery(s, o, mode)
  // const sr = await queryArray(query)
  // getBlobject(flag) << need a handler for whether to return blobject or 


    const queryTerms = processParams(params)
    const query = buildQuery(queryTerms)
    const sr = await queryArray(query)  
    const getResults = await queryToBlobject(sr)
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
