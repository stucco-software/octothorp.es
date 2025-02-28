import { queryBoolean, queryArray } from '$lib/sparql.js'
import { instance } from '$env/static/private'
import normalizeUrl from 'normalize-url';




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
        let inst = instance+"~/"
        output = urls.map((item) => inst + item)
      }
      // 
      return output
    }
  }

  /**
 * Builds a SPARQL query to filter records by subjects and objects.
 *
 * @param {string[]} sub - An array of subject filters (e.g., URLs or domains).
 * @param {string[]} obj - An array of object filters (e.g., terms or categories).
 * @param {string[]} [metadataFields=[]] - Optional metadata fields to include (e.g., ["title", "description"]).
 * @returns {string} - The generated SPARQL query.
 */
function buildSparqlQuery(sub, obj, mode ="", metadataFields = ["title", "description"]) {
  // Base query structure
  let query = `
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
    query += ` "${s}" `;
  });

  query += `
      }`;  
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
            query += `FILTER(CONTAINS(STR(?s), ?sub))`;
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

  return query.replace(/[\r\n]+/gm, '')
}


  const mode = params.mod
    let query = ""
    let s = "?s"
    let o = "?o"

  if (mode === "thorpes" || mode === "octothorpes") {
    s = processUrls(subjects)
    o = processUrls(objects, "pre")
  }
  else if ( mode === "backlinks") {
    // OK, figured out the difference. Backlinks should only return 
    // objects that dont' contain the instance. And Thorpes are the reverse.
    // so there needs to be a hook for adding a FILTER NOT EXISTS
    s = processUrls(subjects)
    o = processUrls(objects)
  }
  else {
    return "Error: not a supported mode. Use 'thorpes' or 'backlinks'"
  }
  
  query = buildSparqlQuery(s, o, mode)
  const sr = await queryArray(query)

  // TKTK Maybe we should consider making a "getResults" utility since I lifted this from [thorpe].
  
  const getResults = sr.results.bindings
    .map(b => {
      return {
        subject: {
          uri: b.s.value,
          title: b.title ? b.title.value : null,
          description: b.description ? b.description.value : null
      },
        object: {
          uri: b.o.value,
          title: b.ot ? b.ot.value : null,
          description: b.od ? b.od.value : null
        }
      }
    })
  return {
      query: {
        mode: params.mod,
        subjects,
        objects   
      },
      results: getResults
  };

}