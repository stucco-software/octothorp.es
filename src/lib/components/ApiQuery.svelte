<script>
  import { onMount, createEventDispatcher } from 'svelte'
  import { browser } from '$app/environment'
  import { getMultiPassFromParams } from '$lib/converters.js'
  import { buildEverythingQuery, buildSimpleQuery, buildThorpeQuery, buildDomainQuery, buildBookmarksWithTermsQuery } from '$lib/sparql.js'

  const dispatch = createEventDispatcher()

  // Props
  export let multiPass = null
  export let queryType = 'everything' // everything, pages, thorpes, domains
  export let queryMethod = 'posted' // posted, thorped, linked, bookmarked, etc.
  export let outputFormat = 'json' // json, rss, debug
  export let autoExecute = true
  export let showLoading = true
  export let showError = true
  export let showDebug = false

  // Reactive state
  let loading = false
  let error = null
  let result = null
  let debugInfo = null
  let queryString = ''
  let multiPassData = null

  // Computed properties
  $: hasMultiPass = multiPass && typeof multiPass === 'object'
  $: canExecute = hasMultiPass || (multiPass === null && autoExecute && browser)

  // Build SPARQL query based on query type and method
  function buildQuery(multiPassData) {
    try {
      switch (queryType) {
        case 'everything':
          return buildEverythingQuery(multiPassData)
        case 'pages':
        case 'links':
          return buildSimpleQuery(multiPassData)
        case 'thorpes':
        case 'terms':
          return buildThorpeQuery(multiPassData)
        case 'domains':
          return buildDomainQuery(multiPassData)
        case 'bookmarksWithTerms':
          return buildBookmarksWithTermsQuery(multiPassData)
        default:
          throw new Error(`Unknown query type: ${queryType}`)
      }
    } catch (err) {
      throw new Error(`Failed to build query: ${err.message}`)
    }
  }

  // Execute the API query
  async function executeQuery() {
    if (!canExecute || !browser) return

    loading = true
    error = null
    result = null
    debugInfo = null

    try {
      multiPassData = multiPass

      // If no MultiPass provided, create a default one
      if (!multiPassData) {
        if (browser) {
          const url = new URL(window.location.href)
          multiPassData = getMultiPassFromParams(
            { what: queryType, by: queryMethod },
            url
          )
        } else {
          // Create a minimal MultiPass for SSR
          multiPassData = {
            meta: { resultMode: queryType },
            subjects: { mode: 'all', include: ['example.com'], exclude: [] },
            objects: { type: 'all', mode: 'all', include: [], exclude: [] },
            filters: { limitResults: 10, offsetResults: 0, dateRange: {} }
          }
        }
      }

      // Ensure MultiPass has required fields
      if (!multiPassData.subjects) {
        multiPassData.subjects = { mode: 'all', include: [], exclude: [] }
      }
      if (!multiPassData.objects) {
        multiPassData.objects = { type: 'all', mode: 'all', include: [], exclude: [] }
      }
      if (!multiPassData.filters) {
        multiPassData.filters = { limitResults: 10, offsetResults: 0, dateRange: {} }
      }

      // Ensure at least one subject or object is provided
      if ((!multiPassData.subjects.include || multiPassData.subjects.include.length === 0) &&
          (!multiPassData.objects.include || multiPassData.objects.include.length === 0)) {
        // Add a default subject if none provided
        multiPassData.subjects.include = ['example.com']
      }

      // Build the SPARQL query
      queryString = buildQuery(multiPassData)

      // For debug mode, return the query and MultiPass data
      if (outputFormat === 'debug') {
        debugInfo = {
          query: queryString,
          multiPass: multiPassData,
          queryType,
          queryMethod,
          outputFormat
        }
        result = debugInfo
        return
      }

      // Execute the query against the SPARQL endpoint
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: queryString,
          format: outputFormat
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      result = data

      // Dispatch success event
      dispatch('success', {
        result: data,
        query: queryString,
        multiPass: multiPassData
      })

    } catch (err) {
      error = err.message
      console.error('ApiQuery error:', err)
      
      // Dispatch error event
      dispatch('error', {
        error: err.message,
        query: queryString,
        multiPass: multiPassData
      })
    } finally {
      loading = false
    }
  }

  // Execute query when component mounts or props change (only in browser)
  $: if (canExecute && autoExecute && browser) {
    executeQuery()
  }

  // Manual execution function
  function execute() {
    executeQuery()
  }

  // Reset component state
  function reset() {
    loading = false
    error = null
    result = null
    debugInfo = null
    queryString = ''
    multiPassData = null
  }

  // Expose methods to parent
  export { execute, reset }
</script>

<div class="api-query" class:loading>
  <!-- Loading State -->
  {#if loading && showLoading}
    <div class="loading">
      <div class="spinner"></div>
      <span>Querying API...</span>
    </div>
  {/if}

  <!-- Error State -->
  {#if error && showError}
    <div class="error">
      <h3>Error</h3>
      <p>{error}</p>
      <button on:click={execute}>Retry</button>
    </div>
  {/if}

  <!-- Debug Mode -->
  {#if debugInfo && showDebug}
    <div class="debug">
      <h3>Debug Information</h3>
      <details>
        <summary>Query</summary>
        <pre>{queryString}</pre>
      </details>
      <details>
        <summary>MultiPass Data</summary>
        <pre>{JSON.stringify(multiPassData, null, 2)}</pre>
      </details>
      <details>
        <summary>Configuration</summary>
        <pre>{JSON.stringify({
          queryType,
          queryMethod,
          outputFormat
        }, null, 2)}</pre>
      </details>
    </div>
  {/if}

  <!-- Results -->
  {#if result && !debugInfo}
    <div class="results">
      <slot {result} {queryString} {multiPass}>
        <!-- Default result display -->
        <h3>API Results</h3>
        {#if result.results}
          <p>Found {result.results.length} results</p>
          <ul>
            {#each result.results as item}
              <li>
                {#if item.title}
                  <strong>{item.title}</strong>
                {:else if item['@id']}
                  <code>{item['@id']}</code>
                {:else}
                  <code>{JSON.stringify(item)}</code>
                {/if}
              </li>
            {/each}
          </ul>
        {:else}
          <pre>{JSON.stringify(result, null, 2)}</pre>
        {/if}
      </slot>
    </div>
  {/if}

  <!-- Manual Controls -->
  {#if !autoExecute}
    <div class="controls">
      <button on:click={execute} disabled={loading}>
        {loading ? 'Querying...' : 'Execute Query'}
      </button>
      <button on:click={reset} disabled={loading}>
        Reset
      </button>
    </div>
  {/if}
</div>

<style>
  .api-query {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    border: 1px solid #e1e5e9;
    border-radius: 8px;
    padding: 1rem;
    background: white;
  }

  .api-query.loading {
    opacity: 0.7;
  }

  .loading {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #666;
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid #f3f3f3;
    border-top: 2px solid #3498db;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .error {
    background: #fee;
    border: 1px solid #fcc;
    border-radius: 4px;
    padding: 1rem;
    color: #c33;
  }

  .error h3 {
    margin: 0 0 0.5rem 0;
    color: #a00;
  }

  .error button {
    background: #c33;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
  }

  .error button:hover {
    background: #a00;
  }

  .debug {
    background: #f8f9fa;
    border: 1px solid #dee2e6;
    border-radius: 4px;
    padding: 1rem;
  }

  .debug h3 {
    margin: 0 0 1rem 0;
    color: #495057;
  }

  .debug details {
    margin-bottom: 1rem;
  }

  .debug summary {
    cursor: pointer;
    font-weight: bold;
    color: #495057;
    margin-bottom: 0.5rem;
  }

  .debug pre {
    background: white;
    border: 1px solid #dee2e6;
    border-radius: 4px;
    padding: 0.5rem;
    overflow-x: auto;
    font-size: 0.875rem;
    margin: 0;
  }

  .results {
    margin-top: 1rem;
  }

  .results h3 {
    margin: 0 0 1rem 0;
    color: #495057;
  }

  .results ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .results li {
    padding: 0.5rem 0;
    border-bottom: 1px solid #f1f3f4;
  }

  .results li:last-child {
    border-bottom: none;
  }

  .results code {
    background: #f8f9fa;
    padding: 0.125rem 0.25rem;
    border-radius: 3px;
    font-size: 0.875rem;
  }

  .controls {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  .controls button {
    background: #007bff;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
  }

  .controls button:hover:not(:disabled) {
    background: #0056b3;
  }

  .controls button:disabled {
    background: #6c757d;
    cursor: not-allowed;
  }
</style> 