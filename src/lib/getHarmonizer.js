import { instance } from '$env/static/private';

// Shared context and base ID
const context = `${instance}context.json`;
const baseId = `${instance}harmonizer/`;

// Predefined harmonizer schemas (can be loaded from a file or database)
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
                "selector": "meta[name='octo:contact']",
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
                },
                {
                  "selector": "meta[name='keywords']",
                  "attribute": "content",
                  "postProcess": {
                    "method": "split",
                    "params": `,`
                  }
                },
              ]
            },
          "link": {
              "s": "source",
              "o": [
                {
                  "selector": `[rel='octo:octothorpes']:not([href*='${instance}~/'])`,
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
  }
};

/**
 * Fetches a harmonizer schema by ID.
 * @param {string} id - The harmonizer ID.
 * @returns {Promise<object|null>} - The harmonizer schema or null if not found.
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

/*


*/