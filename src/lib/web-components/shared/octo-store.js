/**
 * Octothorpes API Store
 * 
 * Provides reactive store-based data fetching for web components.
 * Components specify what/by, this handles the rest.
 */

import { writable } from 'svelte/store';

/**
 * Creates a query store for fetching from the Octothorpes API
 * 
 * @param {string} what - What to query (pages, domains, thorpes, everything)
 * @param {string} by - How to filter (thorped, linked, posted, in-webring, etc.)
 * @returns {object} Store with subscribe and fetch methods
 * 
 * @example
 * const query = createOctoQuery('pages', 'thorped');
 * await query.fetch({ server: 'https://octothorp.es', o: 'demo', limit: 10 });
 * $query.results // Array of results
 * $query.loading // Boolean
 * $query.error   // String or null
 */
export function createOctoQuery(what, by) {
  const { subscribe, set, update } = writable({
    results: [],
    loading: false,
    error: null,
    count: 0
  });

  /**
   * Fetch data from API with given parameters
   * 
   * @param {object} params - Query parameters
   * @param {string} [params.server='https://octothorp.es'] - API server URL
   * @param {string|string[]} [params.s] - Subject filter(s)
   * @param {string|string[]} [params.o] - Object filter(s)
   * @param {string|string[]} [params.nots] - Excluded subject(s)
   * @param {string|string[]} [params.noto] - Excluded object(s)
   * @param {string} [params.match] - Match mode (exact, fuzzy, fuzzy-s, fuzzy-o, very-fuzzy)
   * @param {string|number} [params.limit='10'] - Max results
   * @param {string|number} [params.offset='0'] - Result offset
   * @param {string} [params.when] - Date filter (recent, after-DATE, before-DATE, between-DATE-and-DATE)
   */
  async function fetch(params = {}) {
    const {
      server = 'https://octothorp.es',
      s = '',
      o = '',
      nots = '',
      noto = '',
      match = '',
      limit = '10',
      offset = '0',
      when = ''
    } = params;

    // Set loading state
    update(state => ({ ...state, loading: true, error: null }));

    try {
      // Build query string - only include non-empty params
      const searchParams = new URLSearchParams();
      
      if (s) searchParams.set('s', Array.isArray(s) ? s.join(',') : s);
      if (o) searchParams.set('o', Array.isArray(o) ? o.join(',') : o);
      if (nots) searchParams.set('not-s', Array.isArray(nots) ? nots.join(',') : nots);
      if (noto) searchParams.set('not-o', Array.isArray(noto) ? noto.join(',') : noto);
      if (match) searchParams.set('match', match);
      if (limit) searchParams.set('limit', limit);
      if (offset) searchParams.set('offset', offset);
      if (when) searchParams.set('when', when);

      const queryString = searchParams.toString();
      
      // Remove trailing slash from server to avoid double slashes
      const normalizedServer = server.replace(/\/$/, '');
      const url = `${normalizedServer}/get/${what}/${by}${queryString ? '?' + queryString : ''}`;

      const response = await globalThis.fetch(url, {
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const results = data.results || [];

      set({
        results,
        loading: false,
        error: null,
        count: results.length
      });

      return results;
    } catch (error) {
      const errorMessage = error.message || 'Unknown error occurred';
      
      set({
        results: [],
        loading: false,
        error: errorMessage,
        count: 0
      });

      throw error;
    }
  }

  /**
   * Reset the store to initial state
   */
  function reset() {
    set({
      results: [],
      loading: false,
      error: null,
      count: 0
    });
  }

  return {
    subscribe,
    fetch,
    reset
  };
}
