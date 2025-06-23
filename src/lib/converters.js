import { instance } from '$env/static/private'
import { error, json } from '@sveltejs/kit';
import { getUnixDateFromString, cleanInputs, areUrlsFuzzy, parseDateStrings } from '$lib/utils';

// const thorpePath = instance+"~/"
const thorpePath = "https://octothorp.es/~/"

// naming convention is get nameOfthing (processed) from nameOfThing

export const getBlobjectFromResponse = async (response, filters = { limitResults: 100, offsetResults: 0, dateRange: null  }) => {
    const limit = filters.limitResults
    const offset = filters.offsetResults

    const urlMap = {};

    response.results.bindings.forEach(binding => {
      const url = binding.s.value;

      if (!urlMap[url]) {
        urlMap[url] = {
          '@id': url,
          title: null,
          description: null,
          image: null,
          date: null,
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
      if (binding.image?.value && !current.image) {
        current.image = binding.image.value;
      }
      if (binding.date?.value && !current.date) {
        current.date = parseInt(binding.date.value);
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
    // TKTK get date range from filters, process appropriately

    // Filter by date range if specified
    let filteredMap = urlMap;
    if (filters.dateRange) {
      const { after, before } = filters.dateRange;
      filteredMap = Object.fromEntries(
        Object.entries(urlMap).filter(([_, item]) => {
          if (!item.date) return false;
          if (after && item.date < after) return false;
          if (before && item.date > before) return false;
          return true;
        })
      );
    }

    // Apply limit if specified (0 means no limit)

    const output = limit === 0 ? filteredMap : Object.fromEntries(Object.entries(filteredMap).slice(offset, limit));

    return Object.values(output);
  }

  export const getMultiPassFromParams  = (
    params,
    url) => {

      const searchParams = url.searchParams;
      let s = []
      let o = []
      let notS = []
      let notO = []

      // assign query terms from request params default to empty vars
      const subjects = searchParams.get('s') ? searchParams.get('s').split(',') : s
      const objects = searchParams.get('o') ? searchParams.get('o').split(',') : o
      const notSubjects = searchParams.get('not-s') ? searchParams.get('not-s').split(',') : notS
      const notObjects = searchParams.get('not-o') ? searchParams.get('not-o').split(',') : notO

      console.log (subjects, objects)

      // assign filters from request params
      // TKTK add validation on filters

      const limitParams = searchParams.get('limit') ? searchParams.get('limit') : `100`
      const offsetParams = searchParams.get('offset') ? searchParams.get('offset') : `0`
      const whenParam = searchParams.get('when') ? searchParams.get('when') : []
      const matchFilterParam = searchParams.get('match') ? searchParams.get('match') : `unset`
      const resultParams = params.what ? params.what : "blobjects"
      let subtype = ""

      // TKTK for v1.0 NOT-OBJECTS. remember those will have to be cleaned and set too



      ////////// ?S and ?O //////////

      // default to ask for objects as rdf:type octo:Term
      const matchByParams = params.by ? params.by : "termsOnly"
      let objectType = "all"
      // TKTK for V1.0 compisite objectType handling hashtaggedBookmark

      // default to exact matches
      let subjectMode = "exact"
      let objectMode = "exact"

      // Set objectType and clean object inputs
      switch (matchByParams) {
        case "thorped":
        case "octothorped":
        case "tagged":
        case "termed":
        case "termsOnly":
          objectType = "termsOnly"
          o = cleanInputs(objects)
          notO = cleanInputs(notObjects)
          break
        case "linked":
        case "mentioned":
          o = cleanInputs(objects)
          notO = cleanInputs(notObjects)
          objectType = "pagesOnly"
          break
        case "backlinked":
          subtype = "Backlink"
          o = cleanInputs(objects)
          notO = cleanInputs(notObjects)
          objectType = "pagesOnly"
          break
        case "cited":
          subtype = "Cite"
          o = cleanInputs(objects)
          notO = cleanInputs(notObjects)
          objectType = "pagesOnly"
          break
        case "bookmarked":
          subtype = "Bookmark"
          o = cleanInputs(objects)
          notO = cleanInputs(notObjects)
          objectType = "pagesOnly"
          break
        case "posted":
        case "all":
          // this route by definition does not filter on objects
          // so we stick with the default [o?] value
          // TKTK could throw more specific error when no subject provided
          objectType = "all"
          break
        case "in-webring":
        case "members":
        case "member-of":

        // webrings are a special case. they override subjecMode because the subject must always be
          // the URI of a webring index, and objects can be either terms or pages
          subjectMode = "byParent"
          s = cleanInputs(subjects, "exact")
          notS = cleanInputs(notSubjects)

          if ( areUrlsFuzzy(objects) === true ) {
            objectMode = "fuzzy"
          }
          else {
            objectMode = "exact"
          }
          objectType = "all"
          o = cleanInputs(objects)
          notO = cleanInputs(notObjects)
          break
          default:
            console.error(`Invalid "match by" route "${matchByParams}":`, error.message);
            throw new Error(`Invalid "match by" route. You must specify a valid link, parent, or term type"`);
      }

      ////////// SET S and process ?MATCH //////////
      // set subjectMode from ?match or default to exact
      // set s and clean subject inputs if necessary
      // skip if matching BY parent
      // also set objectMode since we're looking at the matchFilterParam

        if (subjectMode != "byParent") {
          switch (matchFilterParam) {
            case "unset":
              // defaults work like this:
              // providing well-formed URL(s) will run as EXACT
              // otherwise mode is FUZZY.
              // since objects can be terms or URLs
              // we don't check for fuzzy URLs if running as terms only
              // and default to EXACT for objects as terms
              // objects as pages are subject to the same check
              if ( areUrlsFuzzy(subjects) === true || areUrlsFuzzy(notS)) {
                s = cleanInputs(subjects)
                notS = cleanInputs(notSubjects)
                subjectMode = "fuzzy"
              }
              else {
                s = cleanInputs(subjects, "exact")
                subjectMode = "exact"
              }
              if ( objectType === "termsOnly") {
                objectMode = "exact"
              }
              else if ( areUrlsFuzzy(objects) === true ) {
                objectMode = "fuzzy"
              }
              else {
                objectMode = "exact"
              }
              break
            case "exact":
              s = cleanInputs(subjects, "exact")
              subjectMode = "exact"
              break;
            case "fuzzy":
              subjectMode = "fuzzy"
              objectMode = "fuzzy"
              s = cleanInputs(subjects)
              notS = cleanInputs(notSubjects)
              break;
            case "fuzzy-s":
            case "fuzzy-subject":
              subjectMode = "fuzzy"
              s = cleanInputs(subjects)
              notS = cleanInputs(notSubjects)
              break;
            case "fuzzy-o":
            case "fuzzy-object":
              objectMode = "fuzzy"
              s = cleanInputs(subjects, "exact")
              notS = cleanInputs(notSubjects, "exact")
              break;
            case "very-fuzzy-o":
            case "very-fuzzy-object":
              objectMode = "very-fuzzy"
              s = cleanInputs(subjects, "exact")
              notS = cleanInputs(notSubjects, "exact")
              break;
            case "very-fuzzy":
              objectMode = "very-fuzzy"
              subjectMode = "fuzzy"
              s = cleanInputs(subjects)
              notS = cleanInputs(notSubjects)
              break;
            default:
                console.error(`Invalid match type "${matchFilterParam}":`, error.message)
                throw new Error(`Invalid match type. Either omit or use one of the following: fuzzy, fuzzy-s OR fuzzy-subject, fuzzy-o OR fuzzy-object, or exact`)
              break;
          }
        }

      // Set MultiPass.resultMode
      // TKTK update this
        let resultMode = "blobjects"
        switch (resultParams) {
          case "everything":
          case "blobjects":
          case "whatever":
            resultMode = "blobjects"
            break;
          case "links":
          case "mentions":
          case "backlinks":
          case "citations":
          case "bookmarks":
            resultMode = "links"
            break;
          case "thorpes":
          case "octothorpes":
          case "tags":
          case "terms":
            resultMode = "octothorpes"
            break;

          default:
            break;
        }


      // set dateFilter from ?when
      const dateFilter = parseDateStrings(whenParam)

      const MultiPass = {
          meta: {
              title: `Get ${resultMode} matched by ${objectType} (${params.by}) as ${resultMode}`,
              description: `MultiPass auto generated from a request to the ${instance}/get API`,
              server: `${instance}`,
              author: "Octothorpes Protocol",
              image: `${instance}badge.png`,
              version: "1",
              resultMode: resultMode,
          },
          subjects: {
              mode: subjectMode,
              include: s,
              exclude: notS
          },
          objects: {
              type: objectType,
              mode: objectMode,
              include: o,
              exclude: notO
          },
          filters: {
              subtype: subtype,
              limitResults: limitParams,
              offsetResults: offsetParams,
              dateRange: dateFilter
          }
      }

      return MultiPass
}
