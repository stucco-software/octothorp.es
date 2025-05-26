import { instance } from '$env/static/private'
const thorpePath = instance+"~/"


export const queryToBlobject = async (response) => {

    const urlMap = {};
  
    response.results.bindings.forEach(binding => {
      const url = binding.s.value;
      
      if (!urlMap[url]) {
        urlMap[url] = {
          '@id': url,
          title: null,
          description: null,
          octothorpes: []
        };
      }
  
      const current = urlMap[url];
  
      // Set title and description at top level if they exist
      if (binding.title?.value && !current.title) {
        current.title = binding.title.value;
      }
      if (binding.description?.value && !current.description) {
        current.description = binding.description.value;
      }
  
      // Process octothorpe links
      if (binding.o?.value) {
        const targetUrl = binding.o.value;
        const isTerm = binding.type?.value === 'Term';
  
        if (isTerm) {
          // For Terms, only include if starts with instance
          if (targetUrl.startsWith(instance)) {
            // Trim to value after last /
            const termValue = targetUrl.substring(targetUrl.lastIndexOf('/') + 1);
            if (!current.octothorpes.includes(termValue)) {
              current.octothorpes.push(termValue);
            }
          }
        } else {
          // For Pages, determine type
          let pageType = 'link';
          if (binding.blankNodeObj?.value?.startsWith('octo:')) {
            pageType = binding.blankNodeObj.value.substring(5); // Remove 'octo:' prefix
          }
  
          // Check if this target already exists in the array
          const existingIndex = current.octothorpes.findIndex(
            item => typeof item === 'object' && item.target === targetUrl
          );

          // TKTK handle blank nodes, incl terms on triples like hashtagged bookmarks

          if (existingIndex === -1) {
            current.octothorpes.push({
              uri: targetUrl,
              type: pageType
            });
          } else if (pageType !== 'link') {
            // Update existing entry if we have a more specific type
            current.octothorpes[existingIndex].type = pageType;
          }
        }
      }
    });
  
    return Object.values(urlMap);
  }

  export const buildQueryTermsFromParams = async ({
    // params, 
    url,
    sMode = 'exact',
    objectType = 'all' }) => {

    // defaults
    let s = "?s"
    let o = "?o"

    const searchParams = url.searchParams;
    let output = {filters:{}, queryTerms: {}}

    // assign query terms from request params
    const subjects = searchParams.get('s') ? searchParams.get('s').split(',') : `?s`
    const objects = searchParams.get('o') ? searchParams.get('o').split(',') : `?o`

    // assign filters from request params

    output.filters['limit'] = searchParams.get('limit') ? searchParams.get('limit') : `0`
    output.filters['format'] = searchParams.get('format') ? searchParams.get('format') : `json`
    const whenParam = searchParams.get('when') ? searchParams.get('when') : `default`
    const matchParam = searchParams.get('match') ? searchParams.get('match') : `exact`


  ////////// ?MATCH //////////


  // TKTK add validation on filters

  // set subjectMode from route or request params or default to exact

  // this should be a function check to parse the params

/*
      check matchtpe for any mode that applies to subject
      check sMode -- which is a route param passed directly to the function
      if neither are fuzzy-s, do the final default check
      return fuzzy / exact accordingly
*/

    // sMode comes from [mode] and can override params.match 
    // in certain cases, such as WEBRING

    let subjectMode = sMode
    let objectMode = "exact"

    switch (matchParam) {
      case "fuzzy":
        subjectMode = "fuzzy"
        objectMode = "fuzzy"
        break;
      case "fuzzy-s":
        subjectMode = "fuzzy"    
        break;    
      case "fuzzy-subject":
        subjectMode = "fuzzy"    
        break;
      case "fuzzy-o":
        objectMode = "fuzzy"    
      case "fuzzy-object":
        objectMode = "fuzzy"    
      
      default:
        break;
    }

    // check if they provided inexact URLs
    function isFuzzy (uris) { 
      let output = false 
        uris.forEach((string) => {
          try {
            new URL(string);
            output = true;
          } catch (_) {
            
          }
         })
        return output
    }

    // override default mode if inexact urls were provided
    if (subjectMode != "fuzzy" && subjectMode != "byParent") {
      if ( isFuzzy(subjects) ) {
        subjectMode = "fuzzy"
      } 
    }

    ////////// ?S and ?O //////////

    // utility to normalize input into either valid urls or valid octothorpe terms
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

    // normalize subjects.
    s = processUrls(subjects)

  // The /terms route should accept ?o as strings (ie "octothorpe") rather than full urls
  // and prepend them with the local server's octothorpe path and filter objects to rdf:type octo:Term
  // all other modes should treat ?o as it is given

  switch (objectType) {
    case "termsOnly":
        o = processUrls(objects, "pre")
      break
    default:
      o = processUrls(objects)
      break
  }

  ////////// ?WHEN //////////

    function getUnixTime(dateInput) {
      // If input is already a Unix timestamp
      if (/^\d+$/.test(dateInput)) {
        return parseInt(dateInput);
      }
      
      // Try parsing as ISO date
      const date = new Date(dateInput);
      if (!isNaN(date.getTime())) {
        return Math.floor(date.getTime() / 1000);
      }
      
      throw new Error(`Invalid date format: ${dateInput}`);
  }

  function buildTimeFilter(whenParam) {
    if (!whenParam) return '';
    
    const now = Math.floor(Date.now() / 1000);
    const twoWeeksAgo = now - (14 * 24 * 60 * 60);
    
    // Handle "recent" as special case
    if (whenParam === 'recent') {
      return `FILTER (?unixTime >= ${twoWeeksAgo})`;
    }
    
    // Parse combined parameters
    const parts = whenParam.split('-');
    
    // After filter: ?when=after-1672531200
    if (parts[0] === 'after' && parts[1]) {
      const timestamp = getUnixTime(parts[1]);
      return `FILTER (?unixTime >= ${timestamp})`;
    }
    
    // Before filter: ?when=before-1672531200
    if (parts[0] === 'before' && parts[1]) {
      const timestamp = getUnixTime(parts[1]);
      return `FILTER (?unixTime <= ${timestamp})`;
    }
    
    // Between filter: ?when=between-1672531200-and-1704067199
    if (parts[0] === 'between' && parts[1] && parts[2] === 'and' && parts[3]) {
      const start = getUnixTime(parts[1]);
      const end = getUnixTime(parts[3]);
      return `FILTER (?unixTime >= ${start} && ?unixTime <= ${end})`;
    }
    
    throw new Error(`Invalid when parameter format: ${whenParam}`);
  }

  output["dateFilter"] = " "
  if (whenParam != "default") {
    output.filters["dateFilter"] = buildTimeFilter(whenParam)
  }


// // Example usage in your API route
// function handleRequest(queryParams) {
//   try {
//     const timeFilter = buildTimeFilter(queryParams.when);
    
//     const sparqlQuery = `
//       SELECT ?s ?o ?unixTime WHERE {
//         ?s octo:octothorpes ?o .
//         ?s octo:indexed ?unixTime .
//         ${timeFilter}
//       }
//       LIMIT 100
//     `;
    
//     console.log('Generated SPARQL:', sparqlQuery);
//     return sparqlQuery;
//   } catch (error) {
//     console.error('Error building query:', error.message);
//     throw error; // Or return a default query
//   }
// }

// // Test cases
// console.log(handleRequest({ when: 'recent' }));
// console.log(handleRequest({ when: 'after-1672531200' }));
// console.log(handleRequest({ when: 'between-1672531200-and-1704067199' }));

    output.queryTerms = {
    subjectList: s,
    objectList: o,
    subjectMode: subjectMode,
    objectMode: objectMode,
    objectType: objectType
    }

    output.filters = {

    }

    return output
  }