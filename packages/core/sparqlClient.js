import prefixes from './ld/prefixes.js'

/**
 * Creates a framework-agnostic SPARQL client.
 * @param {Object} config
 * @param {string} config.endpoint - SPARQL endpoint URL (e.g. 'http://localhost:7878')
 * @param {string} [config.user] - SPARQL auth username
 * @param {string} [config.password] - SPARQL auth password
 * @returns {{ queryArray, queryBoolean, query, insert }}
 */
export const createSparqlClient = (config) => {
  const { endpoint, user, password } = config

  const headers = new Headers()
  if (user && password) {
    headers.set('Authorization', 'Basic ' + btoa(user + ':' + password))
  }

  const getTriples = () => async (query) =>
    await fetch(`${endpoint}/query`, {
      method: 'POST',
      headers,
      body: new URLSearchParams({
        query: `${prefixes}\n${query}`,
      }),
    })

  const queryArray = async (q) => {
    const result = await getTriples()(q)
    if (!result.ok) {
      const text = await result.text()
      console.error('SPARQL Error:', text)
      throw new Error(`SPARQL query failed: ${text}`)
    }
    return result.json()
  }

  const queryBoolean = async (q) => {
    const result = await getTriples()(q)
    if (!result.ok) {
      const text = await result.text()
      console.error('SPARQL Error:', text)
      throw new Error(`SPARQL query failed: ${text}`)
    }
    return result.json().then((r) => r.boolean)
  }

  const query = async (q) => {
    const result = await fetch(`${endpoint}/update`, {
      method: 'POST',
      headers,
      body: new URLSearchParams({
        update: `${prefixes}\n${q}`,
      }),
    })
    if (!result.ok) {
      const text = await result.text()
      console.error('SPARQL Error:', text)
      throw new Error(`SPARQL update failed: ${text}`)
    }
    return result
  }

  const insert = async (q) => {
    const result = await fetch(`${endpoint}/update`, {
      method: 'POST',
      headers,
      body: new URLSearchParams({
        update: `${prefixes}\nINSERT DATA {\n${q}\n}`,
      }),
    })
    if (!result.ok) {
      const text = await result.text()
      console.error('SPARQL Error:', text)
      throw new Error(`SPARQL insert failed: ${text}`)
    }
    return result
  }

  return { queryArray, queryBoolean, query, insert }
}
