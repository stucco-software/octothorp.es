import { buildMultiPass } from './multipass.js'
import { getBlobjectFromResponse } from './blobject.js'
import { createQueryBuilders } from './queryBuilders.js'
import { parseBindings } from './utils.js'

/**
 * Creates the OP API service layer.
 * @param {Object} config
 * @param {string} config.instance - OP instance URL
 * @param {Function} config.queryArray - SPARQL SELECT query function
 * @param {Function} config.queryBoolean - SPARQL ASK query function
 * @param {Function} config.insert - SPARQL INSERT function
 * @param {Function} config.query - SPARQL UPDATE function
 * @returns {Object} API with get() and fast.*
 */
export const createApi = (config) => {
  const { instance, queryArray, queryBoolean, insert, query: sparqlQuery } = config
  const builders = createQueryBuilders(instance, queryArray)

  /**
   * General-purpose query API (MultiPass pipeline).
   * Equivalent to the /get/[what]/[by]/[[as]] route.
   * @param {string} what - 'everything', 'pages', 'thorpes', 'domains', etc.
   * @param {string} by - 'thorped', 'linked', 'backlinked', 'posted', etc.
   * @param {Object} [options] - Query options (s, o, match, limit, offset, when, as)
   * @returns {Object} Query results
   */
  const get = async (what, by, options = {}) => {
    const multiPass = buildMultiPass(what, by, options, instance)
    const as = options.as

    // Early return for multipass endpoint
    if (as === 'multipass') {
      let query = ''
      switch (what) {
        case 'pages':
        case 'links':
        case 'backlinks':
          query = builders.buildSimpleQuery(multiPass)
          break
        case 'everything':
        case 'blobjects':
        case 'whatever':
          query = await builders.buildEverythingQuery(multiPass)
          break
        case 'thorpes':
        case 'octothorpes':
        case 'tags':
        case 'terms':
          query = builders.buildThorpeQuery(multiPass)
          break
        case 'domains':
          query = builders.buildDomainQuery(multiPass)
          break
        default:
          throw new Error('Invalid route.')
      }
      return { multiPass, query }
    }

    let query = ''
    let actualResults = ''

    switch (what) {
      case 'pages':
      case 'links':
      case 'backlinks': {
        query = builders.buildSimpleQuery(multiPass)
        const sr = await queryArray(query)
        actualResults = parseBindings(sr.results.bindings)
        break
      }
      case 'everything':
      case 'blobjects':
      case 'whatever': {
        query = await builders.buildEverythingQuery(multiPass)
        const bj = await queryArray(query)
        actualResults = await getBlobjectFromResponse(bj, multiPass.filters)
        break
      }
      case 'thorpes':
      case 'octothorpes':
      case 'tags':
      case 'terms': {
        query = builders.buildThorpeQuery(multiPass)
        const tr = await queryArray(query)
        actualResults = parseBindings(tr.results.bindings, 'terms')
        break
      }
      case 'domains': {
        query = builders.buildDomainQuery(multiPass)
        const dr = await queryArray(query)
        actualResults = parseBindings(dr.results.bindings)
        break
      }
      default:
        throw new Error('Invalid route.')
    }

    if (as === 'debug') {
      return { multiPass, query, actualResults }
    }

    return { results: actualResults }
  }

  /**
   * Fast API -- direct SPARQL queries, raw bindings output.
   * Each method returns the raw SPARQL bindings array.
   */
  const fast = {
    /** All terms with usage timestamps, pages, and domains. */
    async terms() {
      const sr = await queryArray(`
        SELECT ?t ?time ?url ?domain {
          ?t rdf:type <octo:Term> .
          ?url ?t ?time .
          ?domain octo:hasPart ?url .
        }
      `)
      return sr.results.bindings
    },

    /** Pages and bookmarks for a single term. Accepts 'demo' or full URI. */
    async term(termOrUri) {
      let o
      try {
        new URL(termOrUri)
        o = termOrUri
      } catch {
        o = `${instance}~/${termOrUri}`
      }

      const sr = await queryArray(`
        SELECT DISTINCT ?s ?t ?d ?postDate ?date {
          ?s octo:octothorpes <${o}> .
          optional { ?s octo:title ?t . }
          optional { ?s octo:description ?d . }
          optional { ?s octo:postDate ?postDate . }
          optional { ?s octo:indexed ?date . }
        }
      `)

      const sa = await queryArray(`
        SELECT DISTINCT ?uri ?t ?d ?postDate ?date {
          ?s octo:octothorpes <${o}> .
          ?s octo:uri ?uri .
          optional { ?s octo:title ?t . }
          optional { ?s octo:description ?d . }
          optional { ?s octo:postDate ?postDate . }
          optional { ?s octo:indexed ?date . }
        }
      `)

      return {
        pages: sr.results.bindings,
        bookmarks: sa.results.bindings,
      }
    },

    /** All verified, non-banned domains. */
    async domains() {
      const sr = await queryArray(`SELECT * {
        ?d rdf:type <octo:Origin> .
        ?d octo:verified "true" .
        optional { ?d octo:banned ?b . }
      }`)
      return sr.results.bindings.filter(node => !node.b)
    },

    /** Backlinks and bookmarks for a single domain. */
    async domain(uri) {
      let origin
      try {
        origin = new URL(uri).origin
      } catch {
        origin = uri
      }

      const sr = await queryArray(`
        SELECT ?s ?p ?o {
          <${origin}/> octo:hasPart ?s .
          ?s octo:octothorpes ?o .
        }
      `)

      const sa = await queryArray(`
        SELECT ?uri ?term {
          <${origin}/> octo:asserts ?s .
          ?s octo:uri ?uri .
          ?s octo:octothorpes ?term .
        }
      `)

      return {
        backlinks: sr.results.bindings,
        bookmarks: sa.results.bindings,
      }
    },

    /** All page-to-page relationships. */
    async backlinks() {
      const sr = await queryArray(`
        SELECT ?from ?to ?ft ?fd ?tt ?td {
          ?to rdf:type <octo:Page> .
          ?from octo:octothorpes ?to .
          optional { ?to octo:title ?tt . }
          optional { ?to octo:description ?td . }
          optional { ?from octo:title ?ft . }
          optional { ?from octo:description ?fd . }
        }
      `)
      return sr.results.bindings
    },

    /** All bookmarks with tags. */
    async bookmarks() {
      const sr = await queryArray(`
        SELECT ?uri ?t ?d ?o {
          ?s octo:octothorpes ?o .
          ?s octo:uri ?uri .
          optional { ?s octo:title ?t . }
          optional { ?s octo:description ?d . }
        }
      `)
      return sr.results.bindings
    },
  }

  return { get, fast }
}
