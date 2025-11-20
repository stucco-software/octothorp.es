<svelte:options customElement="octo-multipass" />

<script>
  import { onMount } from 'svelte';
  import { createOctoQuery } from '../shared/octo-store.js';
  import { parseMultipass, multipassToParams, extractWhatBy } from '../shared/multipass-utils.js';
  import { getTitle, getUrl, formatDate } from '../shared/display-helpers.js';
  
  // Accept MultiPass as JSON string or object
  export let multipass = '';
  export let autoload = false;
  export let render = 'list';  // list, cards, compact, count
  
  // Internal state
  let parsedMultiPass = null;
  let queryParams = null;
  let what = 'pages';
  let by = 'thorped';
  let query = null;
  
  // Parse and process multipass input whenever it changes
  $: {
    parsedMultiPass = parseMultipass(multipass);
    
    if (parsedMultiPass) {
      // Extract endpoint parameters
      ({ what, by } = extractWhatBy(parsedMultiPass));
      
      // Convert to query params
      queryParams = multipassToParams(parsedMultiPass);
      
      // Create query store
      query = createOctoQuery(what, by);
    } else {
      query = null;
      queryParams = null;
    }
  }
  
  // Load function
  async function load() {
    if (!query || !queryParams) return;
    await query.fetch(queryParams);
  }
  
  // Auto-load on mount if requested
  onMount(() => {
    if (autoload && parsedMultiPass) {
      load();
    }
  });
  
  // (Common display helpers imported from display-helpers.js)
</script>

{#if !parsedMultiPass}
  <!-- Invalid or missing MultiPass -->
  <div class="octo-multipass error-container">
    <div class="error">
      <p><strong>Invalid MultiPass</strong></p>
      <p>Component requires a valid MultiPass object.</p>
    </div>
  </div>

{:else if render === 'count'}
  <!-- Count mode - inline display -->
  {#if query && $query.loading}
    <span class="count-loading">…</span>
  {:else if query && $query.error}
    <span class="count-error">✗</span>
  {:else if query && $query.results}
    <span class="count">{$query.count}</span>
  {:else}
    <span class="count-pending">?</span>
  {/if}

{:else}
  <!-- Full component display -->
  <div class="octo-multipass">
    
    <!-- MultiPass metadata header -->
    {#if parsedMultiPass.meta?.title}
      <h2 class="multipass-title">{parsedMultiPass.meta.title}</h2>
    {/if}
    
    {#if parsedMultiPass.meta?.description}
      <p class="multipass-description">{parsedMultiPass.meta.description}</p>
    {/if}
    
    {#if parsedMultiPass.meta?.author}
      <p class="multipass-author">by {parsedMultiPass.meta.author}</p>
    {/if}
    
    <!-- Load button (if not autoloaded) -->
    {#if query && !$query.results.length && !$query.loading && !$query.error}
      <button on:click={load} class="load-button">
        Load Results
      </button>
    {/if}
    
    <!-- Loading state -->
    {#if query && $query.loading}
      <div class="loading">
        <div class="spinner"></div>
        <p>Loading...</p>
      </div>
    {/if}
    
    <!-- Error state -->
    {#if query && $query.error}
      <div class="error">
        <p><strong>Error:</strong> {$query.error}</p>
        <button on:click={load} class="retry-button">Retry</button>
      </div>
    {/if}
    
    <!-- Results -->
    {#if query && $query.results.length > 0 && !$query.loading}
      
      {#if render === 'list'}
        <!-- List mode -->
        <ul class="list">
          {#each $query.results as item}
            <li>
              <a href={getUrl(item)} target="_blank" rel="noopener noreferrer">
                {getTitle(item)}
              </a>
              {#if item.description}
                <p class="description">{item.description}</p>
              {/if}
              {#if item.date}
                <time class="date">{formatDate(item.date)}</time>
              {/if}
              {#if item.octothorpes && item.octothorpes.length > 0}
                <div class="tags">
                  {#each item.octothorpes as thorpe}
                    {#if typeof thorpe === 'string'}
                      <span class="tag">#{thorpe}</span>
                    {/if}
                  {/each}
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      
      {:else if render === 'cards'}
        <!-- Card grid mode -->
        <div class="cards">
          {#each $query.results as item}
            <article class="card">
              {#if item.image}
                <img src={item.image} alt={getTitle(item)} loading="lazy" />
              {/if}
              <h3>
                <a href={getUrl(item)} target="_blank" rel="noopener noreferrer">
                  {getTitle(item)}
                </a>
              </h3>
              {#if item.description}
                <p class="description">{item.description}</p>
              {/if}
              {#if item.date}
                <time class="date">{formatDate(item.date)}</time>
              {/if}
            </article>
          {/each}
        </div>
      
      {:else if render === 'compact'}
        <!-- Compact inline mode -->
        <div class="compact">
          {#each $query.results as item, i}
            <a href={getUrl(item)} target="_blank" rel="noopener noreferrer">
              {getTitle(item)}
            </a>{#if i < $query.results.length - 1}, {/if}
          {/each}
        </div>
      {/if}
      
      <!-- Result count footer -->
      <div class="meta">
        <span class="result-count">{$query.count} result{$query.count === 1 ? '' : 's'}</span>
        {#if parsedMultiPass.meta?.author}
          <span class="author-credit"> • curated by {parsedMultiPass.meta.author}</span>
        {/if}
      </div>
      
    {/if}
    
  </div>
{/if}

<style>
  /* CSS Custom Properties */
  :host {
    --octo-font: system-ui, -apple-system, sans-serif;
    --octo-primary: #3c7efb;
    --octo-background: #ffffff;
    --octo-text: #333333;
    --octo-border: #e0e0e0;
    --octo-error: #d32f2f;
    --octo-spacing: 1rem;
    --octo-radius: 4px;
    
    display: block;
    font-family: var(--octo-font);
    color: var(--octo-text);
  }
  
  .octo-multipass {
    background: var(--octo-background);
  }
  
  /* Count mode (inline) */
  .count,
  .count-loading,
  .count-error,
  .count-pending {
    font-weight: bold;
  }
  
  .count-loading,
  .count-pending {
    opacity: 0.5;
  }
  
  .count-error {
    color: var(--octo-error);
  }
  
  /* MultiPass metadata */
  .multipass-title {
    margin: 0 0 0.5rem 0;
    font-size: 1.5rem;
    font-weight: bold;
    color: var(--octo-text);
  }
  
  .multipass-description {
    margin: 0 0 0.5rem 0;
    color: #666;
    line-height: 1.5;
  }
  
  .multipass-author {
    margin: 0 0 1rem 0;
    font-size: 0.875rem;
    font-style: italic;
    color: #999;
  }
  
  /* Buttons */
  .load-button,
  .retry-button {
    background: var(--octo-primary);
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    font-size: 1rem;
    font-family: var(--octo-font);
    border-radius: var(--octo-radius);
    cursor: pointer;
    transition: opacity 0.2s;
  }
  
  .load-button:hover,
  .retry-button:hover {
    opacity: 0.9;
  }
  
  .retry-button {
    background: var(--octo-error);
  }
  
  /* Loading state */
  .loading {
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
  
  .loading p {
    margin: 0;
    color: #666;
  }
  
  /* Error state */
  .error-container {
    padding: var(--octo-spacing);
  }
  
  .error {
    padding: var(--octo-spacing);
    background: #ffebee;
    border: 1px solid var(--octo-error);
    border-radius: var(--octo-radius);
    text-align: center;
  }
  
  .error p {
    color: var(--octo-error);
    margin: 0 0 var(--octo-spacing) 0;
  }
  
  .error p:last-child {
    margin-bottom: 0;
  }
  
  /* List mode */
  .list {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  
  .list li {
    padding: var(--octo-spacing);
    border-bottom: 1px solid var(--octo-border);
  }
  
  .list li:last-child {
    border-bottom: none;
  }
  
  /* Card grid mode */
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: var(--octo-spacing);
  }
  
  .card {
    padding: var(--octo-spacing);
    border: 1px solid var(--octo-border);
    border-radius: var(--octo-radius);
    background: var(--octo-background);
  }
  
  .card img {
    width: 100%;
    height: auto;
    border-radius: var(--octo-radius);
    margin-bottom: 0.5rem;
  }
  
  .card h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.125rem;
  }
  
  /* Compact mode */
  .compact {
    line-height: 1.5;
  }
  
  /* Common elements */
  a {
    color: var(--octo-primary);
    text-decoration: none;
  }
  
  a:hover {
    text-decoration: underline;
  }
  
  .description {
    margin: 0.5rem 0 0 0;
    color: #666;
    font-size: 0.875rem;
    line-height: 1.4;
  }
  
  .date {
    display: block;
    margin-top: 0.25rem;
    font-size: 0.75rem;
    color: #999;
  }
  
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-top: 0.5rem;
  }
  
  .tag {
    display: inline-block;
    padding: 0.125rem 0.375rem;
    background: #f0f0f0;
    border-radius: var(--octo-radius);
    font-size: 0.75rem;
    color: #666;
  }
  
  /* Meta info */
  .meta {
    margin-top: var(--octo-spacing);
    padding-top: var(--octo-spacing);
    border-top: 1px solid var(--octo-border);
    text-align: right;
    font-size: 0.875rem;
    color: #666;
  }
  
  .result-count {
    font-weight: bold;
  }
  
  .author-credit {
    font-style: italic;
  }
</style>
