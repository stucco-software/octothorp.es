import { instance } from '$env/static/private';

/** @constant {string} context - JSON-LD context URL for harmonizer schemas */
const context = `${instance}context.json`;

/** @constant {string} baseId - Base URL for harmonizer resource identifiers */
const baseId = `${instance}harmonizer/`;

/**
 * Predefined harmonizer schemas for extracting metadata from web content
 * @constant {Object} localHarmonizers
 * @property {Object} default - Default Octothorpe harmonizer for HTML content
 * @property {Object} openGraph - OpenGraph Protocol harmonizer
 * @property {Object} keywords - Meta keywords to octothorpes harmonizer
 * @property {Object} ghost - Ghost CMS tags to octothorpes harmonizer
 */
const localHarmonizers = {
  "default": {
        "@context": context,
        "@id": `${baseId}default`,
        "@type": "harmonizer",
        "title": "Default Octothorpe Harmonizer",
        // mode:html expects css selectors
        // mode:json expects json dot notation
        // mode:xpath expects xpath
        "mode": "html",
        "schema" : {
          // one subject per blobject
          "subject": {
            // s can be defined in the same way as o but also
            // accepts the string "source" for the source of the request
            // TKTK support for non-source uris
            "s": "source",
            "title" : [
                {
                  "selector": "title",
                  "attribute": "textContent"
                }
              ],
            "description": [{
                "selector": "meta[name='description']",
                "attribute": "content"
              }],
            "image" :
              [
                {
                  "selector": "meta[property='og:image']",
                  "attribute": "content"
                },
                {
                  "selector": "link[rel='octo:image']",
                  "attribute": "href"
                },
                {
                  "selector": "[data-octo-image]",
                  "attribute": "href"
                },
                {
                  "selector": "[data-octo-image]",
                  "attribute": "src"
                }
            ],
            "contact":
              [{
                "selector": "meta[property='octo:contact']",
                "attribute": "content"
              }],
              // Pages can have multiple types
              // All public URLs are typed as octo:page by default
            "type":
              [{
                "selector": "meta[property='octo:type']",
                "attribute": "content"
              }]
            },

          // definition keys become type labels in the
          // blobject.octothorpes, hence are singular

          "hashtag": {
              "s": "source",
              "o": [
                // criteria is additive, so this harmonizer will return
                // results for EVERY condition listed here
                {
                  "selector": "octo-thorpe",
                  "attribute": "textContent"
                },
                {
                  "selector": "a[rel='octo:octothorpes']",
                  "attribute": "href",
                  // postProcess alters the returned strings.
                  // if you want to instead filter results
                  // use filterResults. postProcess runs last
                  // both accept the regex method
                  "postProcess": {
                    "method": "regex",
                    "params": `${instance}~/([^/]+)`
                  }
                },
                {
                  "selector": "link[rel='octo:octothorpes']",
                  "attribute": "href"
                }
              ]
            },
          "link": {
              "s": "source",
              "o": [
                {
                  "selector": `a[rel='octo:octothorpes']:not([href*='${instance}~/'])`,
                  "attribute": "href"
                }
              ]
            },
          "endorse": {
            "s": "source",
            "o": [
              {
                "selector": `[rel='octo:endorses']:not([href*='${instance}~/'])`,
                "attribute": "href"
              }
            ]
          },
            "bookmark": {
              "s": "source",
              "o": [
                {
                  "selector": `[rel='octo:bookmarks']:not([href*='${instance}~/'])`,
                  "attribute": "href"
                }
              ]
            },
            "cite": {
              "s": "source",
              "o": [
                {
                  "selector": `[rel='octo:cites']:not([href*='${instance}~/'])`,
                  "attribute": "href"
                }
              ]
            }
          }
    },
    "openGraph": {
      "@context": context,
      "@id": `${baseId}openGraph`,
      "@type": "harmonizer",
      "title": "Opengraph Protocol Harmonizer",
      "mode": "html",
      "schema" : {
        "subject": {
          "s": "source",
          "title" : [
              {
                "selector": "meta[property='og:title']",
                "attribute": "content"
                }
            ],
          "description": [{
              "selector": "meta[property='og:description']",
              "attribute": "content"
            }],
          "image" : [{
              "selector": "meta[property='og:image']",
              "attribute": "content"
          }]
      }
    }
  },
  "keywords": {
    "@context": context,
    "@id": `${baseId}keywords`,
    "@type": "harmonizer",
    "title": "Meta Kewords to Octothorpes Harmonizer",
    "mode": "html",
    "schema" : {
      "hashtag": {
        "s": "source",
        "o": [{
          "selector": "meta[name='keywords']",
          "attribute": "content",
          "postProcess": {
            "method": "split",
            "params": `,`
          }
        }]
    }
  }
},
"ghost": {
  "@context": context,
  "@id": `${baseId}ghost`,
  "@type": "harmonizer",
  "title": "Ghost Tags to Octothorpes Harmonizer",
  "mode": "html",
  "schema" : {
    "hashtag": {
      "s": "source",
      "o": [{
        "selector": `a.gh-article-tag`,
        "attribute": "textContent"
      }]
  }
}
}
};

/**
 * Fetches a harmonizer schema by ID from predefined local harmonizers
 * @async
 * @param {string} id - The harmonizer ID (e.g., "default", "openGraph", "keywords", "ghost")
 * @returns {Promise<Object>} The harmonizer schema object
 * @throws {Error} If ID is invalid or harmonizer not found
 * @returns {Object} harmonizer - The harmonizer schema
 * @returns {string} harmonizer['@context'] - JSON-LD context URL
 * @returns {string} harmonizer['@id'] - Harmonizer resource identifier
 * @returns {string} harmonizer['@type'] - Resource type ("harmonizer")
 * @returns {string} harmonizer.title - Human-readable title
 * @returns {string} harmonizer.mode - Extraction mode ("html", "json", or "xpath")
 * @returns {Object} harmonizer.schema - Extraction schema configuration
 * @returns {Object} harmonizer.schema.subject - Subject extraction configuration
 * @returns {Object} harmonizer.schema.[objectType] - Object extraction configurations
 */
export async function getHarmonizer(id) {
    // Validate the ID
    if (!id || typeof id !== 'string') {
        throw new Error('Invalid harmonizer ID');
    }



    // Fetch the harmonizer schema (from predefined harmonizers or an external source)
    const harmonizer = localHarmonizers[id];

    // Validate the harmonizer
    if (!harmonizer) {
        throw new Error('Harmonizer not found');
    }


    // Return the harmonizer schema
    return harmonizer;
}
