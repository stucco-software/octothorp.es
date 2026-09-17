/**
 * Typed errors for the query/publish surface.
 *
 * Core throws; the transport layer maps. A QueryError is a CALLER error (bad
 * route word, bad match mode, unbounded query, unknown publisher) — never a
 * bug — so a route can turn it into a 4xx with the message as the whole body.
 * Anything else escaping core is a genuine 500.
 */
export class QueryError extends Error {
  /**
   * @param {string} message - short, specific, and the entire response body
   * @param {Object} [opts]
   * @param {number} [opts.status=400] - HTTP status the transport should use
   */
  constructor(message, { status = 400 } = {}) {
    super(message)
    this.name = 'QueryError'
    this.status = status
  }
}

/** True for anything a transport should surface as a 4xx rather than a 500. */
export const isQueryError = (e) => e instanceof QueryError || typeof e?.status === 'number'
