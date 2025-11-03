<svelte:options customElement="octo-query" />

<script>
  import { onMount } from 'svelte';
  import { createClient } from '../shared/api-client.js';
  
  // MultiPass-inspired attributes
  export let server = 'https://octothorp.es';
  export let what = 'everything';        // what to get: pages, thorpes, everything, domains
  export let by = 'posted';              // how to filter: thorped, linked, posted, backlinked, etc.
  export let s = '';                     // subjects (comma-separated)
  export let o = '';                     // objects (comma-separated)
  export let nots = '';                  // not-s (exclude subjects)
  export let noto = '';                  // not-o (exclude objects)
  export let match = '';                 // match mode: exact, fuzzy, fuzzy-s, fuzzy-o, very-fuzzy
  export let limit = '10';               // limit results
  export let offset = '0';               // offset results
  export let when = '';                  // date filter: recent, after-DATE, before-DATE, between-DATE-and-DATE
  export let autoload = 'false';         // whether to load on mount
  
  // Display options
  export let layout = 'list';            // list, grid, or compact
  export let showmeta = 'true';          // show metadata (description, date, image)
  
  // State
  let data = null;
  let loading = false;
  let error = null;
  let loaded = false;
  
  // Create API client with configured server
  $: client = createClient(server);
  
  // Parse comma-separated strings into arrays
  const parseList = (str) => {
    if (!str || str.trim() === '') return [];
    return str.split(',').map(item => item.trim()).filter(Boolean);
  };
  
  // Build query parameters from attributes
  $: queryParams = {
    s: parseList(s),
    o: parseList(o),
    notS: parseList(nots),
    notO: parseList(noto),
    match: match || undefined,
    limit: parseInt(limit) || 10,
    offset: parseInt(offset) || 0,
    when: when || undefined
  };
  
  async function loadData() {
    if (loading) return;
    
    loading = true;
    error = null;
    
    try {
      const response = await client.query(what, by, queryParams);
      data = response;
      loaded = true;
    } catch (e) {
      error = e.message;
      console.error('OctoQuery error:', e);
    } finally {
      loading = false;
    }
  }
  
  // Auto-load if specified
  onMount(() => {
    if (autoload === 'true') {
      loadData();
    }
  });
  
  // Helper to get display results
  $: results = data?.results || [];
  $: showMetadata = showmeta === 'true';
  
  // Format date
  function formatDate(timestamp) {
    if (!timestamp) return '';
    const date = new Date(parseInt(timestamp));
    return date.toLocaleDateString();
  }
  
  // Get display title
  function getTitle(item) {
    return item.title || item['@id'] || item.uri || 'Untitled';
  }
  
  // Get display URL
  function getUrl(item) {
    return item['@id'] || item.uri || '#';
  }
</script>

<div class="octo-query" class:loading class:error={!!error}>
  {#if !loaded && !loading}
    <div class="load-prompt">
      <button on:click={loadData} class="load-button">
        Load {what} {by}
        {#if queryParams.s.length > 0}from {queryParams.s.join(', ')}{/if}
        {#if queryParams.o.length > 0}to {queryParams.o.join(', ')}{/if}
      </button>
    </div>
  {/if}
  
  {#if loading}
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Loading...</p>
    </div>
  {/if}
  
  {#if error}
    <div class="error-state">
      <p><strong>Error:</strong> {error}</p>
      <button on:click={loadData} class="retry-button">Retry</button>
    </div>
  {/if}
  
  {#if data && !loading}
    <div class="results" class:layout-list={layout === 'list'} class:layout-grid={layout === 'grid'} class:layout-compact={layout === 'compact'}>
      {#if results.length === 0}
        <div class="no-results">
          <p>No results found</p>
        </div>
      {:else}
        {#each results as item}
          <article class="result-item">
            <h3 class="result-title">
              <a href={getUrl(item)} target="_blank" rel="noopener noreferrer">
                {getTitle(item)}
              </a>
            </h3>
            
            {#if showMetadata}
              {#if item.description}
                <p class="result-description">{item.description}</p>
              {/if}
              
              {#if item.image}
                <img src={item.image} alt={getTitle(item)} class="result-image" loading="lazy" />
              {/if}
              
              <div class="result-meta">
                {#if item.date}
                  <span class="result-date">{formatDate(item.date)}</span>
                {/if}
                
                {#if item.octothorpes && item.octothorpes.length > 0}
                  <div class="result-tags">
                    {#each item.octothorpes as tag}
                      {#if typeof tag === 'string'}
                        <span class="tag">#{tag}</span>
                      {:else if tag.type === 'Bookmark'}
                        <span class="tag bookmark">🔖 {tag.uri}</span>
                      {:else if tag.type === 'Cite'}
                        <span class="tag cite">📝 {tag.uri}</span>
                      {:else if tag.type === 'Backlink'}
                        <span class="tag backlink">🔗 {tag.uri}</span>
                      {/if}
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}
          </article>
        {/each}
        
        {#if results.length >= queryParams.limit}
          <div class="load-more">
            <button 
              on:click={() => {
                offset = String(parseInt(offset) + parseInt(limit));
                loadData();
              }}
              class="load-more-button"
            >
              Load more
            </button>
          </div>
        {/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  :host {
    --octo-primary: #3c7efb;
    --octo-background: #ffffff;
    --octo-text: #333333;
    --octo-border: #e0e0e0;
    --octo-error: #d32f2f;
    --octo-spacing: 1rem;
    --octo-radius: 4px;
    
    display: block;
    font-family: system-ui, -apple-system, sans-serif;
    color: var(--octo-text);
  }
  
  .octo-query {
    background: var(--octo-background);
    padding: var(--octo-spacing);
  }
  
  /* Loading prompt */
  .load-prompt {
    text-align: center;
    padding: calc(var(--octo-spacing) * 2);
  }
  
  .load-button {
    background: var(--octo-primary);
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    font-size: 1rem;
    border-radius: var(--octo-radius);
    cursor: pointer;
    transition: opacity 0.2s;
  }
  
  .load-button:hover {
    opacity: 0.9;
  }
  
  /* Loading state */
  .loading-state {
    text-align: center;
    padding: calc(var(--octo-spacing) * 2);
  }
  
  .spinner {
    width: 40px;
    height: 40px;
    margin: 0 auto var(--octo-spacing);
    border: 4px solid var(--octo-border);
    border-top-color: var(--octo-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  /* Error state */
  .error-state {
    padding: var(--octo-spacing);
    background: #ffebee;
    border: 1px solid var(--octo-error);
    border-radius: var(--octo-radius);
    text-align: center;
  }
  
  .error-state p {
    color: var(--octo-error);
    margin: 0 0 var(--octo-spacing) 0;
  }
  
  .retry-button {
    background: var(--octo-error);
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: var(--octo-radius);
    cursor: pointer;
  }
  
  /* Results */
  .results {
    display: flex;
    flex-direction: column;
    gap: var(--octo-spacing);
  }
  
  .layout-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  }
  
  .layout-compact .result-item {
    padding: calc(var(--octo-spacing) / 2);
  }
  
  .result-item {
    padding: var(--octo-spacing);
    border: 1px solid var(--octo-border);
    border-radius: var(--octo-radius);
    background: var(--octo-background);
  }
  
  .result-title {
    margin: 0 0 0.5rem 0;
    font-size: 1.25rem;
  }
  
  .result-title a {
    color: var(--octo-primary);
    text-decoration: none;
  }
  
  .result-title a:hover {
    text-decoration: underline;
  }
  
  .result-description {
    margin: 0.5rem 0;
    color: #666;
    line-height: 1.5;
  }
  
  .result-image {
    max-width: 100%;
    height: auto;
    border-radius: var(--octo-radius);
    margin: 0.5rem 0;
  }
  
  .result-meta {
    margin-top: 0.5rem;
    font-size: 0.875rem;
    color: #666;
  }
  
  .result-date {
    margin-right: 1rem;
  }
  
  .result-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }
  
  .tag {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    background: #f5f5f5;
    border-radius: var(--octo-radius);
    font-size: 0.875rem;
  }
  
  .tag.bookmark {
    background: #fff3e0;
  }
  
  .tag.cite {
    background: #e8f5e9;
  }
  
  .tag.backlink {
    background: #e3f2fd;
  }
  
  .no-results {
    text-align: center;
    padding: calc(var(--octo-spacing) * 2);
    color: #666;
  }
  
  .load-more {
    text-align: center;
    padding-top: var(--octo-spacing);
  }
  
  .load-more-button {
    background: var(--octo-primary);
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: var(--octo-radius);
    cursor: pointer;
  }
  
  .load-more-button:hover {
    opacity: 0.9;
  }
</style>
