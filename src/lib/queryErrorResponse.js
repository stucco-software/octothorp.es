import { isQueryError } from 'octothorpes'

/**
 * Map a core QueryError to a 4xx JSON response. Anything else is a genuine bug
 * and is rethrown so SvelteKit still reports it as a 500.
 * @param {unknown} e
 * @returns {Response}
 */
export const queryErrorResponse = (e) => {
  if (!isQueryError(e)) throw e
  return new Response(JSON.stringify({ error: e.message }), {
    status: e.status ?? 400,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
