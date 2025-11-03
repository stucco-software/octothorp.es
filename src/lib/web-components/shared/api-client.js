/**
 * Octothorpes API Client for Web Components
 * Provides a clean interface to query the Octothorpes Protocol API
 */

/**
 * Main API client class
 */
export class OctothorpesAPIClient {
  constructor(baseUrl = 'https://octothorp.es') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /**
   * Generic fetch wrapper with error handling
   * @param {string} endpoint - API endpoint path
   * @param {Object} options - Fetch options
   * @returns {Promise<Object>} JSON response
   */
  async fetch(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Accept': 'application/json',
          ...options.headers
        }
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('API fetch failed:', error);
      throw error;
    }
  }

  /**
   * Build query string from multiPass-like parameters
   * @param {Object} params - Query parameters
   * @returns {string} Query string
   */
  buildQueryString(params) {
    const searchParams = new URLSearchParams();
    
    // Subject filters
    if (params.s && params.s.length > 0) {
      searchParams.set('s', Array.isArray(params.s) ? params.s.join(',') : params.s);
    }
    if (params.notS && params.notS.length > 0) {
      searchParams.set('not-s', Array.isArray(params.notS) ? params.notS.join(',') : params.notS);
    }
    
    // Object filters
    if (params.o && params.o.length > 0) {
      searchParams.set('o', Array.isArray(params.o) ? params.o.join(',') : params.o);
    }
    if (params.notO && params.notO.length > 0) {
      searchParams.set('not-o', Array.isArray(params.notO) ? params.notO.join(',') : params.notO);
    }
    
    // Match mode
    if (params.match) {
      searchParams.set('match', params.match);
    }
    
    // Limit and offset
    if (params.limit !== undefined) {
      searchParams.set('limit', params.limit);
    }
    if (params.offset !== undefined) {
      searchParams.set('offset', params.offset);
    }
    
    // Date filter
    if (params.when) {
      searchParams.set('when', params.when);
    }
    
    // Feed metadata (for RSS)
    if (params.feedtitle) {
      searchParams.set('feedtitle', params.feedtitle);
    }
    if (params.feeddescription) {
      searchParams.set('feeddescription', params.feeddescription);
    }
    if (params.feedauthor) {
      searchParams.set('feedauthor', params.feedauthor);
    }
    if (params.feedimage) {
      searchParams.set('feedimage', params.feedimage);
    }
    
    const queryString = searchParams.toString();
    return queryString ? `?${queryString}` : '';
  }

  /**
   * Query the /get API with multiPass-like parameters
   * @param {string} what - What to get (pages, thorpes, everything, etc.)
   * @param {string} by - How to filter (thorped, linked, posted, etc.)
   * @param {Object} params - Query parameters (s, o, not-s, not-o, match, limit, etc.)
   * @param {string} as - Output format (optional: 'rss', 'debug')
   * @returns {Promise<Object>} API response
   */
  async query(what = 'everything', by = 'posted', params = {}, as = '') {
    const queryString = this.buildQueryString(params);
    const asPath = as ? `/${as}` : '';
    const endpoint = `/get/${what}/${by}${asPath}${queryString}`;
    return this.fetch(endpoint);
  }

  /**
   * Get pages tagged with specific terms
   * @param {string|Array<string>} terms - Terms to filter by
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} API response
   */
  async getPagesThorped(terms, options = {}) {
    return this.query('pages', 'thorped', {
      o: terms,
      ...options
    });
  }

  /**
   * Get everything tagged with specific terms
   * @param {string|Array<string>} terms - Terms to filter by
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} API response
   */
  async getEverythingThorped(terms, options = {}) {
    return this.query('everything', 'thorped', {
      o: terms,
      ...options
    });
  }

  /**
   * Get pages linked to specific URLs
   * @param {string|Array<string>} urls - URLs to filter by
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} API response
   */
  async getPagesLinked(urls, options = {}) {
    return this.query('pages', 'linked', {
      o: urls,
      ...options
    });
  }

  /**
   * Get pages from specific subjects
   * @param {string|Array<string>} subjects - Subject URLs to filter by
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} API response
   */
  async getPagesPosted(subjects, options = {}) {
    return this.query('pages', 'posted', {
      s: subjects,
      ...options
    });
  }

  /**
   * Get domains in a webring
   * @param {string} webringUrl - Webring index URL
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} API response
   */
  async getDomainsInWebring(webringUrl, options = {}) {
    return this.query('domains', 'in-webring', {
      s: webringUrl,
      ...options
    });
  }

  /**
   * Get pages in a webring
   * @param {string} webringUrl - Webring index URL
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} API response
   */
  async getPagesInWebring(webringUrl, options = {}) {
    return this.query('pages', 'in-webring', {
      s: webringUrl,
      ...options
    });
  }

  /**
   * Get data for a specific octothorpe/term
   * @param {string} thorpe - The octothorpe/term to look up
   * @returns {Promise<Object>} API response
   */
  async getThorpe(thorpe) {
    return this.fetch(`/~/${encodeURIComponent(thorpe)}`);
  }

  /**
   * Get backlinks to specific URLs
   * @param {string|Array<string>} urls - URLs to find backlinks for
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} API response
   */
  async getBacklinks(urls, options = {}) {
    return this.query('pages', 'backlinked', {
      o: urls,
      ...options
    });
  }

  /**
   * Get bookmarks of specific URLs
   * @param {string|Array<string>} urls - URLs to find bookmarks for
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} API response
   */
  async getBookmarks(urls, options = {}) {
    return this.query('pages', 'bookmarked', {
      o: urls,
      ...options
    });
  }
}

/**
 * Create a singleton instance for convenience
 */
const defaultClient = new OctothorpesAPIClient();

/**
 * Convenience function to create a client with custom base URL
 * @param {string} baseUrl - Custom base URL
 * @returns {OctothorpesAPIClient} API client instance
 */
export const createClient = (baseUrl) => new OctothorpesAPIClient(baseUrl);

/**
 * Export convenience functions that use the default client
 */
export const query = (...args) => defaultClient.query(...args);
export const getPagesThorped = (...args) => defaultClient.getPagesThorped(...args);
export const getEverythingThorped = (...args) => defaultClient.getEverythingThorped(...args);
export const getPagesLinked = (...args) => defaultClient.getPagesLinked(...args);
export const getPagesPosted = (...args) => defaultClient.getPagesPosted(...args);
export const getDomainsInWebring = (...args) => defaultClient.getDomainsInWebring(...args);
export const getPagesInWebring = (...args) => defaultClient.getPagesInWebring(...args);
export const getThorpe = (...args) => defaultClient.getThorpe(...args);
export const getBacklinks = (...args) => defaultClient.getBacklinks(...args);
export const getBookmarks = (...args) => defaultClient.getBookmarks(...args);
