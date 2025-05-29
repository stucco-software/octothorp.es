import { queryBoolean, queryArray } from '$lib/sparql.js'
import { getBlobject } from '$lib/processors.js'

import { instance } from '$env/static/private'
import normalizeUrl from 'normalize-url';

// TKTK seeing a parseRequest utility that we can break out from the query builder
// and thinking we should structure the API to put distinct query builds on their own endpoints
// and use parseRequest to talk to them and return results


// const thorpePath = instance+"~/"
const thorpePath = "https://octothorp.es/~/"

export async function load({ params, url }) {
  const searchParams = url.searchParams;
  const subjects = searchParams.get('s') ? searchParams.get('s').split(',') : `?s`
  const objects = searchParams.get('o') ? searchParams.get('o').split(',') : `?o` 


  function processUrls (urls, mod = "norm") {
    if (urls === `?s` || urls === `?o`) {
      return urls
    }
    else {
      let output = []
      if (mod === "norm") {
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

  // ==============================


  /**
 * Builds a SPARQL query to filter records by subjects and objects.
 *
 * @param {string[]} sub - An array of subject filters (e.g., URLs or domains).
 * @param {string[]} obj - An array of object filters (e.g., terms or categories).
 * @param {string[]} [metadataFields=[]] - Optional metadata fields to include (e.g., ["title", "description"]).
 * @returns {string} - The generated SPARQL query.
 */
function buildSparqlQuery(sub, obj, mode ="", metadataFields = ["title", "description"]) {
  let query = ""
  if (mode === "everything") {

    query += `SELECT DISTINCT ?s ?o ?title ?description ?ot ?od ?type ?blankNode ?blankNodePred ?blankNodeObj
          WHERE {`
          
    // Add subject filters to the VALUES clause if subject is specified
        if (sub != "?s") {
          query += `VALUES ?sub {`
          sub.forEach((s) => {
            query += ` "${s}" `;
          });
          query += `
              }`;  
        }
      query +=`
        ?s octo:octothorpes ?o .`
      if (matchType === 'contains') {
        query +=`FILTER(CONTAINS(STR(?s), ?sub))`
      }
      else if (matchType === 'distinct') {
        query += `FILTER(?s = IRI(?sub))`
      }
        
      query +=`{
          ?o rdf:type <octo:Page> .
          BIND("Page" AS ?type)
          
          OPTIONAL {
            ?o ?blankNodePred ?blankNode .
            FILTER(isBlank(?blankNode))
            
            OPTIONAL {
              ?blankNode ?bnp ?blankNodeObj .
              FILTER(!isBlank(?blankNodeObj)) 
            }
          }
        }
        UNION
        {
          ?o rdf:type <octo:Term> .
          BIND("Term" AS ?type)
        }
        
        OPTIONAL { ?s octo:title ?title . }
        OPTIONAL { ?s octo:description ?description . }
        OPTIONAL { ?o octo:title ?ot . }
        OPTIONAL { ?o octo:description ?od . }
      }`;
  }
  else {

  // Base query structure
  query += `
    SELECT DISTINCT ?s ?o
  `;

  // Add metadata fields to the SELECT clause
  metadataFields.forEach((field) => {
    query += ` ?${field}`;
  });
  if (mode === "backlinks") {
    query += ` ?ot ?od`;
  }
  query += `
    WHERE {`;

// Add subject filters to the VALUES clause if subject is specified
if (sub != "?s") {
  query += `VALUES ?sub {`
  sub.forEach((s) => {
    query += ` "${s}" `

  })

  query += `
      }`
}

if (obj != "?o") {

    query += `VALUES ?obj {`;

    // Add object filters to the VALUES clause
    obj.forEach((o) => {
      query += ` "${o}" }`;
    });
}

  query += `
      ?s octo:octothorpes ?o.`;
  if (sub != "?s") {
      if (matchType === 'contains') {
        query +=`FILTER(CONTAINS(STR(?s), ?sub))`
      }
      else if (matchType === 'distinct') {
        query += `FILTER(?s = IRI(?sub))`
      }
      }
      if (obj != "?o") {
        query += `FILTER(CONTAINS(STR(?o), ?obj))`;
    }
    if (mode === "thorpes" || mode === "octothorpes") {
      //  only want term urls
      query += `?o rdf:type <octo:Term> .`
    }
    if (mode === "backlinks") {
      // only want things that are NOT term urls
      query += `?o rdf:type <octo:Page> .`
    }
  // Add optional metadata fields
  metadataFields.forEach((field) => {
      query += `
      OPTIONAL { ?s octo:${field} ?${field} . }
    `;
  });
  if (mode === "backlinks") {
    // get the metadata for the objects when they're pages
  query += `
    OPTIONAL { ?o octo:title ?ot. }
    OPTIONAL { ?o octo:description ?od. }
    `;
  }

  query += `
    }
  `;
}
  return query.replace(/[\r\n]+/gm, '')
}

//  ================================== //

  const mode = params.mode
  const flag = params.flag

  // defaults
  let query = ""
  let s = "?s"
  let o = "?o"
  let matchType = "distinct"

  // process api params


  if (params.flag) {
    if (flag === "distinct" || flag === "contains" || flag === "fuzzy") {
      matchType = flag
    }
    else {
          return "Error: not a supported flag. Try any of the following flags, or no flag at all: distinct, contains, fuzzy"

    }
  }
  else {
      subjects.forEach((s) => {
        if (!s.startsWith("http")) {
      console.log('NOT TRUEEE')
      matchType = "contains"
    }
    });
  }


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
  else {
    return "Error: not a supported mode. Use 'thorpes' or 'backlinks'"
  }
  
  query = buildSparqlQuery(s, o, mode)
  const sr = await queryArray(query)
  
  const getResults = await getBlobject(sr, thorpePath)
  console.log(getResults)

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


  return {
      query: {
        mode: params.mode,
        flag: params.flag,
        subjects,
        objects   
      },
            queryString: query,
      results: getResults
  };

}



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


/*
describe
get
default? everything
  - [[webring]]
  - pages << everything

  - links
      octo:Page
  - backlinks
  - bookmarks
    [[with blan nodes??]]
  - endorsements
  - feed



  - parent relationship? (part of a webring?, something else someday)
  - what kind of match -- contains or distinct 
  - what kind of object (term or page)
    - what type of that kind of object (backlink, all links, link only, bookmark only)

...add filters
...add output to subject (date, image, document record)
*/