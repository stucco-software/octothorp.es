/**
 * Creates a harmonizer registry parameterized with instance URL.
 * @param {string} instance - The OP instance URL
 * @returns {{ getHarmonizer: Function, localHarmonizers: Object }}
 */
export const createHarmonizerRegistry = (instance) => {
  const context = `${instance}context.json`
  const baseId = `${instance}harmonizer/`

  const localHarmonizers = {
    "default": {
          "@context": context,
          "@id": `${baseId}default`,
          "@type": "harmonizer",
          "title": "Default Octothorpe Harmonizer",
          "mode": "html",
          "schema" : {
            "subject": {
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
              "type":
                [{
                  "selector": "meta[property='octo:type']",
                  "attribute": "content"
                }],
              "postDate":
                [
                  {
                    "selector": "meta[property='article:published_time']",
                    "attribute": "content"
                  },
                  {
                    "selector": "time[datetime]",
                    "attribute": "datetime"
                  },
                  {
                    "selector": "meta[property='octo:postDate']",
                    "attribute": "content"
                  },
                  {
                    "selector": "[data-octodate]",
                    "attribute": "data-octodate"
                  }
                ],
              "indexPolicy":
                [
                  {
                    "selector": "meta[name='octo-policy']",
                    "attribute": "content"
                  }
                ],
              "indexServer":
                [
                  {
                    "selector": "link[rel='octo:index']",
                    "attribute": "href"
                  }
                ],
              "indexHarmonizer":
                [
                  {
                    "selector": "meta[name='octo-harmonizer']",
                    "attribute": "content"
                  },
                  {
                    "selector": "link[rel='octo:harmonizer']",
                    "attribute": "href"
                  }
                ]
              },

            "hashtag": {
                "s": "source",
                "o": [
                  {
                    "selector": "octo-thorpe",
                    "attribute": "textContent"
                  },
                  {
                    "selector": "a[rel~='octo:octothorpes']",
                    "attribute": "href",
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
                    "attribute": "href",
                    "terms": {
                      "attribute": "data-octothorpes"
                    }
                  }
                ]
              },
            "endorse": {
              "s": "source",
              "o": [
                {
                  "selector": `[rel~='octo:endorses']:not([href*='${instance}~/'])`,
                  "attribute": "href",
                  "terms": {
                    "attribute": "data-octothorpes"
                  }
                }
              ]
            },
              "bookmark": {
                "s": "source",
                "o": [
                  {
                    "selector": `[rel~='octo:bookmarks']:not([href*='${instance}~/'])`,
                    "attribute": "href",
                    "terms": {
                      "attribute": "data-octothorpes"
                    }
                  }
                ]
              },
              "cite": {
                "s": "source",
                "o": [
                  {
                    "selector": `[rel~='octo:cites']:not([href*='${instance}~/'])`,
                    "attribute": "href",
                    "terms": {
                      "attribute": "data-octothorpes"
                    }
                  }
                ]
              },
              "button": {
                "s": "source",
                "o": [
                  {
                    "selector": `[rel~='octo:button']`,
                    "attribute": "href",
                    "terms": {
                      "attribute": "data-octothorpes"
                    }
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
  },
  "standardSite": {
    "@context": context,
    "@id": `${baseId}standardSite`,
    "@type": "harmonizer",
    "title": "Gets a documentRecord for extra content expected by the ATProto lexicon site.standard.document",
    "mode": "html",
    "schema" : {
      "documentRecord": {
        "textContent": [
          { "selector": "article", "attribute": "textContent" },
          { "selector": "main", "attribute": "textContent" },
          { "selector": "body", "attribute": "textContent" }
        ],
        "site": [
          { "selector": "link[rel='canonical']", "attribute": "href" }
        ],
        "path": [
          { "selector": "link[rel='canonical']", "attribute": "href" }
        ]
      }
  }
  }
  };

  const getHarmonizer = async (id) => {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid harmonizer ID')
    }
    const harmonizer = localHarmonizers[id]
    if (!harmonizer) {
      throw new Error('Harmonizer not found')
    }
    return harmonizer
  }

  const register = (name, harmonizer) => {
    if (localHarmonizers[name]) throw new Error(`Harmonizer "${name}" already exists`)
    if (!harmonizer.mode) throw new Error('Harmonizer must have a mode field')
    localHarmonizers[name] = harmonizer
  }

  const getHarmonizersForMode = (mode) => {
    return Object.fromEntries(
      Object.entries(localHarmonizers).filter(([_, h]) => h.mode === mode)
    )
  }

  return { getHarmonizer, localHarmonizers, list: () => localHarmonizers, register, getHarmonizersForMode }
}
