import { instance } from '$env/static/private'
import normalizeUrl from 'normalize-url';
import { error, json } from '@sveltejs/kit';

// const thorpePath = instance+"~/"
const thorpePath = "https://octothorp.es/~/"

// naming convention is nameOfthing (processed) To nameOfThing




export const getBlobjectFromResponse = async (response) => {

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

  export const getUnixDateFromString = (datestring) => { 
  // Utility function for the various places we might want to accept
  // a human readable date but want to send a UNIX date because 
  // they're faster in SPARQL queries. Also functions as a format validator


    if (/^\d+$/.test(datestring)) return parseInt(datestring);
    
    const date = new Date(datestring);
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date: ${datestring}`);
    }
    return Math.floor(date.getTime() / 1000);
  }

  export const getMultiPassFromParams  = (
    params, 
    url,
    sMode = '') => {

    
    // defaults
    let s = ["?s"]
    let o = ["?o"]

    const searchParams = url.searchParams;
    let output = {}

    // TODO actually set params for smode and object type from params
    console.log(params.what)
    console.log(params)

    const objectTypeParams = params.what ? params.what : "all"
    let objectType = "all"
    // assign query terms from request params
    const subjects = searchParams.get('s') ? searchParams.get('s').split(',') : s
    const objects = searchParams.get('o') ? searchParams.get('o').split(',') : o

    // TKTK add validation on filters
    // assign filters from request params

    const limitParams = searchParams.get('limit') ? searchParams.get('limit') : `100`
    const offsetParams = searchParams.get('offset') ? searchParams.get('offset') : `0`
    const whenParam = searchParams.get('when') ? searchParams.get('when') : `default`
    const matchParam = searchParams.get('match') ? searchParams.get('match') : `exact`

    ////////// ?S and ?O //////////

    // utility to normalize input into either valid urls or valid octothorpe terms
    function processUrls (urls, mod = "norm") {
        if (urls === s || urls === o ) {
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

    switch (objectTypeParams) {
      case "thorpes":
          o = processUrls(objects, "pre")
          objectType = "termsOnly"
        break
      case "octothorpes":
          o = processUrls(objects, "pre")
          objectType = "termsOnly"
        break
      case "terms":
          o = processUrls(objects, "pre")
          objectType = "termsOnly"
        break  
      case "termsOnly":
          o = processUrls(objects, "pre")
          objectType = "termsOnly"
        break    
        default:
        o = processUrls(objects)
        break
    }


    ////////// ?MATCH //////////
    // set subjectMode from route or request params or default to exact


    // sMode comes from [mode] and can override params.match 
    // in certain cases, such as WEBRING

    let subjectMode = "exact"
    let objectMode = "exact"

      if (sMode != "") {
        switch (sMode) {
          case "webring":
            subjectMode = "byParent"
            break;
          case "domain":
            subjectMode = "byParent"
          default:
              console.error(`Invalid parent route "${sMode}":`, error.message);
              throw new Error(`Invalid parent route. Either omit or use "webring" or "domain"`);
            break;
        }
      }
      else {
        switch (matchParam) {
          case "exact":
              subjectMode = "exact"
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
              console.error(`Invalid match type "${matchParam}":`, error.message)
              throw new Error(`Invalid match type. Either omit or use one of the following: fuzzy, fuzzy-s OR fuzzy-subject, fuzzy-o OR fuzzy-object, or exact`)
            break;
        }
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


  ////////// ?WHEN //////////
    let dateFilter = {};


    if (whenParam != "default") {
      if (whenParam === 'recent') {
        const now = Math.floor(Date.now() / 1000);
        const twoWeeksAgo = now - (14 * 24 * 60 * 60);
        dateFilter["after"] = twoWeeksAgo
      }
      else {
      const [command, ...dateParts] = whenParam.split('-');
          const dateString = dateParts.join('-');

          try {
            switch (command) {
              case 'after':
                dateFilter.after = getUnixDateFromString(dateString);
                break;
              case 'before':
                dateFilter.before = getUnixDateFromString(dateString);
                break;
              case 'between': {
                const [start, end] = dateString.split('-and-');
                if (!start || !end) {
                  throw new Error('Between filter requires both start and end dates');
                }
                dateFilter.after = getUnixDateFromString(start);
                dateFilter.before = getUnixDateFromString(end);
                break;
              }
              default:
                throw new Error(`Unknown date filter type: ${command}`);
            }
            } catch (error) {
            console.error(`Date parsing failed for "${whenParam}":`, error.message);
            throw new Error(`Invalid time filter. Use: recent, after-DATE, before-DATE, or between-DATE-and-DATE`);
          }
      }

    } 
    
    output = {
      subjectList: s,
      objectList: o,
      subjectMode: subjectMode,
      objectMode: objectMode,
      objectType: objectType,
      limitResults: limitParams,
      offsetResults: offsetParams,
      dateRange: dateFilter
    }

    return output
}



  
