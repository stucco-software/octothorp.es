import { queryBoolean, queryArray } from '$lib/sparql.js'
import { getBlobject } from '$lib/processors.js'

import { instance } from '$env/static/private'
import normalizeUrl from 'normalize-url';

// TKTK seeing a parseRequest utility that we can break out from the query builder
// and thinking we should structure the API to put distinct query builds on their own endpoints
// and use parseRequest to talk to them and return results




export async function processParams(params, url) {
    
// const thorpePath = instance+"~/"
  const thorpePath = "https://octothorp.es/~/"

  const subjects = searchParams.get('s') ? searchParams.get('s').split(',') : `?s`
  const objects = searchParams.get('o') ? searchParams.get('o').split(',') : `?o` 
  // flag will probably change when you update the API structure
  const mode = params.mode
  const flag = params.flag

  // defaults
  let query = ""
  let s = "?s"
  let o = "?o"
  let matchType = "distinct"




  // Set matchType based on params or subject structure
  // TKTK the check function should probably be outsourced to a matcher
  if (params.flag) {

    else {
          return "Error: not a supported flag. Try any of the following flags, or no flag at all: distinct, contains, fuzzy"
    }
  }

  // return all this shit in a well-ordered object
  }


  // this needs to be part of the core URL process function
  export function fuzzyOrNot (sub, flag) {
    // set by flag
    
      subjects.forEach((s) => {
        if (!s.startsWith("http")) {
      console.log('NOT TRUEEE')
      matchType = "contains"
    }
    });
  }

  // TKTK does this need to be exported? yes
  export function processUrls (urls, mod = "norm") {
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


export async function load({ params, url }) {

  // processParams
  // processUrls according to mode/endpoint
  // query = buildSparqlQuery(s, o, mode)
  // const sr = await queryArray(query)
  // getBlobject(flag) << need a handler for whether to return blobject or 


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

  // ==============================


          
    // Add subject filters to the VALUES clause if subject is specified

    /* BUILD VALUE ARRAY
        if (sub != "?s") {
          query += `VALUES ?sub {`
          sub.forEach((s) => {
            query += ` "${s}" `;
          });
          query += `
              }`;  
        }
      query +=`
*/

const filterStatement = buildSubjectFilter(XXXX)

function buildSubjectFilter(flag){
  switch (flag) {
    case 'contains':
          return `FILTER(CONTAINS(STR(?s), ?sub))`
    case 'distinct':
        `FILTER(?s = IRI(?sub))`
      }
}

      /* 
a query is 

  DESCRIBE
  -- OR --
  SELECT
    ?vars
    WHERE
      ?s something ?o
      {filterStatemnt}
      BIND subject type 
      OPTIONAL { 
        blank node shit
        }
      BIND other subject type << right now we just have pages and Terms, but wondering. maybe should just output rdf:type and trim it like on link types
      OPTIONAL {
        subject properties
        title, etc.
      }
      


      */



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
          WHERE {${valueArray}
        ?s octo:octothorpes ?o . 
        ${filterStatement}
        {
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
    //   add more subject info here
  }
  else {

  // Base query structure
  query += `
    SELECT DISTINCT ?s ?o ${metadataFields}
  `;

  // Add metadata fields to the SELECT clause
  metadataFields.forEach((field) => {
    query += ` ?${field}`;
  });
//   TKTK does this matter now? I think getblobject is the layer where this will happen
//   and since they're optional just, like, pass them


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

    // TKTK type could be something to pass 
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
    // dunno how important it is to make this conditional
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



