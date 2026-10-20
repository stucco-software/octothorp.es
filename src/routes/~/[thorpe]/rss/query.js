import { caseInsensitiveTermClause } from 'octothorpes'

/**
 * Builds the SPARQL for the term RSS feed (#253 follow-up). Must select the
 * same result set as the term search page (../load.js): term names match
 * case-insensitively via the shared clause; full-URL params (backlink
 * targets) keep exact matching. The timestamp triple hangs off the bound
 * term IRI (`?term`), so it follows the stored casing.
 * @param {string} instance - Instance base URL with trailing slash
 * @param {string} thorpe - Term name or full URL
 * @returns {string} SPARQL query text
 */
export const termFeedQuery = (instance, thorpe) => {
  let matchClause, timePredicate
  try {
    new URL(thorpe)
    matchClause = `?s octo:octothorpes <${thorpe}> .`
    timePredicate = `<${thorpe}>`
  } catch (err) {
    matchClause = caseInsensitiveTermClause(instance, thorpe)
    timePredicate = '?term'
  }
  return `
    SELECT * {
     ${matchClause}
     optional { ?s ${timePredicate} ?t . }
    }
  `
}
