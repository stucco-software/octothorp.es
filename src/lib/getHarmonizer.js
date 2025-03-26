import { instance } from '$env/static/private';

// Cache for harmonizer schemas
const harmonizerCache = new Map();

// Shared context and base ID
const context = `${instance}context.json`;
const baseId = `${instance}harmonizer/`;

// Predefined harmonizer schemas (can be loaded from a file or database)
const localHarmonizers = {
    "default": {
        "@context": context,
        "@id": `${baseId}default`,
        "@type": "Harmonizer",
        "title": "Default Octothorpe Harmonizer",
        // mode:html expects css selectors
        // mode:json expects json dot notation
        // mode:xpath expects xpath
        "mode": "html",
        "schema" : {
          // one subject per blobject
          "subject": {
            // subject.s can be defined in the same way as o but also 
            // accepts the string "source" for the source of the request
            "s": "source",
            "o": [
              {
                "key": "title",
                "selector": "title",
                "attribute": "textContent"
              },
              {
                "key": "description",
                "selector": "meta[name='description']",
                "attribute": "content"
              },
              {
                "key": "image",
                "selector": "meta[property='og:image']",
                "attribute": "content"
              }
            ]
          },
          // definition keys become type labels in the 
          // blobject.octothorpes, hence are singular
          // usage will be octothorpes.hashtag, octothorpes.mention, etc

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
                  "postprocess": {
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
            "mention": {
              "s": "source",
              "o": [
                {
                  "selector": `a[rel='octo:octothorpes']:not([href*='${instance}~/'])`,
                  "attribute": "href"
                }
              ]
            },
            "endorsement": {
              "s": "source",
              "o": [
                {
                  // link rev 
                }
              ]
            },

            "webringIndex": {
              "s": "source",
              "o": [
                {
              // link rev. anything else?
                }
              ]
            },
            "bookmark": {
              "s": "source",
              "o": [
                {
                // consider any custom markup to make a bookmark?
                }
              ]
            }
            }     
    },
    "squarespace": {
      "@context": context,
      "@id": `${baseId}instagram`,
      "@type": "Harmonizer",
      "title": "Squarespace Tags to Octothorpes",
      "mode": "html",
      "schema" : {
          "hashtag": {
              "s": "source", // s can be a string
              "o": [
                {
                  "selector": `a[rel="tag"]`,
                  "attribute": "textContent",
                }
              ]
            }
          }
        },
    "instagram": {
        "@context": context,
        "@id": `${baseId}instagram`,
        "@type": "Harmonizer",
        "title": "Instagram Tags to Octothorpes",
        "mode": "html",
        "schema" : {
            "hashtag": {
                "s": "source", // s can be a string
                "o": [
                  {
                    "selector": "octo-thorpe",
                    "attribute": "textContent",
                  },
                  {
                    "selector": "[rel='octo:octothorpes']",
                    "attribute": "href",
                    "postprocess": {
                      "method": "regex",
                      "params": `${instance}~/([^/]+)`
                    },
                  },
                ],
              },
              "mention": {
                "s": {
                  "selector": "link[rel='canonical']", // s can also be a "selector"/attribute group
                  "attribute": "href",
                },
                "o": [
                  {
                    "selector": `[rel='octo:octothorpes']:not([href*='${instance}~/'])`,
                    "attribute": "href"
                  },
                ],
              },
              "subject": {
                "s": "source",
                "o": [
                  {
                    "selector": "title",
                    "attribute": "textContent",
                    "key": "title",
                  },
                  {
                    "selector": "meta[name='description']",
                    "attribute": "content",
                    "key": "description",
                  },
                  {
                    "selector": "meta[property='og:image']",
                    "attribute": "content",
                    "key": "image",
                  },
                ],
              }
            }     
    },
    // no dashes in names
    "webmentionClient": {
        "@context": context,
        "@id": `${baseId}webmention-client`,
        "@type": "Harmonizer",
        "title": "Client-side Webmention to backlink harmonizer",
        "mode": "html",
        "schema": {
            "DocumentRecord": {
                "s": {
                  "selector": "meta[property='og:url']", // s can also have postprocessing
                  "attribute": "content",
                  "postprocess": {
                    "method": "regex",
                    "params": "https?://([^/]+)",
                  },
                },
                "o": [
                  {
                    "selector": ".h-entry .u-author.h-card .p-name",
                    "attribute": "innerHTML",
                    "key": "author.name",
                  },
                  {
                    "selector": ".h-entry .u-author.h-card .u-photo",
                    "attribute": "src",
                    "key": "author.photo",
                  },
                  {
                    "selector": ".h-entry .u-author.h-card .u-url",
                    "attribute": "href",
                    "key": "author.url",
                  },
                  {
                    "selector": ".h-entry .e-content",
                    "attribute": "innerHtml",
                    "key": "content.html"   
                    },
                    {
                        "selector": ".h-entry .e-content",
                        "attribute": "textContent",
                        "key": "content.text"   
                        },
                ],
              },
        "mention": {
            "s": "source",
            "o": [{
                "selector": ".u-in-reply-to",
                "attribute": "href"
            }]
            // no specified "subject" = default to page url
        },

        }
    },
        "article": {
        "@context": context,
        "@id": `${baseId}article`,
        "title": "SKOs: Basic Article Harmonizer",
        "mode": "json",
        "type": "Article",
        "@type": "Harmonizer",
        "schema": {
            // TODO define json schema
            // "DocumentRecord": {
            //     "headline": { "path": "headline" },
            //     "description": { "path": "description" },
            //     "author": { "path": "author.name" },
            //     "datePublished": { "path": "datePublished" },
            //     "publisher": { "path": "publisher.name" },
            //     "image": { "path": "image.url" }
            // }

        }
    },
    "seo": {
        "@context": context,
        "@id": `${baseId}seo`,
        "mode": "html",
        "schema": {
// TODO clean up, integrate with default
            // "DocumentRecord": {
            //     "title": {
            //         "selector": "meta[property='og:title'], meta[name='twitter:title'], title",
            //         "attribute": "content"
            //     },
            //     "description": {
            //         "selector": "meta[property='og:description'], meta[name='twitter:description'], meta[name='description']",
            //         "attribute": "content"
            //     },
            //     "image": {
            //         "selector": "meta[property='og:image'], meta[name='twitter:image']",
            //         "attribute": "content"
            //     }
            // }
        }

    }
    // Add more harmonizers as needed
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

    // Check the cache first
    if (harmonizerCache.has(id)) {
        return harmonizerCache.get(id);
    }

    // Fetch the harmonizer schema (from predefined harmonizers or an external source)
    const harmonizer = localHarmonizers[id];

    // Validate the harmonizer
    if (!harmonizer) {
        throw new Error('Harmonizer not found');
    }

    // Cache the harmonizer
    harmonizerCache.set(id, harmonizer);

    // Return the harmonizer schema
    return harmonizer;
}