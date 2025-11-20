<!--
  OCTOTHORPES WEB COMPONENT TEMPLATE
  
  Use this template to create new web components following the store pattern.
  
  STEPS TO CREATE A NEW COMPONENT:
  
  1. Copy this file to: src/lib/web-components/your-component/YourComponent.svelte
  2. Change the customElement name (line 18)
  3. Set the query endpoint (line 45) - what/by parameters
  4. Customize the render logic (starting at line 71)
  5. Add to vite.config.components.js entry points
  6. Run: npm run build:components
  
  EXAMPLE ENDPOINTS:
  - createOctoQuery('pages', 'thorped')      - Pages tagged with octothorpes
  - createOctoQuery('pages', 'linked')       - Pages linking to URLs
  - createOctoQuery('pages', 'posted')       - Pages from specific domains
  - createOctoQuery('pages', 'backlinked')   - Pages backlinking to URLs
  - createOctoQuery('domains', 'in-webring') - Domains in a webring
  - createOctoQuery('thorpes', 'used')       - Octothorpes used
  - createOctoQuery('everything', 'posted')  - Everything from domains
-->

<svelte:options customElement="component-name" />

<script>
  import { onMount } from 'svelte';
  import { createOctoQuery } from '../shared/octo-store.js';
  import { getTitle, getUrl, formatDate } from '../shared/display-helpers.js';
  
  // ============================================================================
  // STANDARD PROPS - Copy these for every component
  // ============================================================================
  
  export let server = 'https://octothorp.es';
  export let s = '';           // Subjects (domains) - comma-separated
  export let o = '';           // Objects (terms/URLs) - comma-separated
  export let nots = '';        // Exclude subjects
  export let noto = '';        // Exclude objects
  export let match = '';       // Match mode: exact, fuzzy, fuzzy-o, fuzzy-s, very-fuzzy
  export let limit = '10';     // Result limit
  export let offset = '0';     // Result offset (pagination)
  export let when = '';        // Date filter: recent, after-DATE, before-DATE, between-DATE-and-DATE
  export let autoload = false; // Auto-load on mount
  export let render = 'list';  // Render mode: list, cards, compact, count (customize as needed)
  
  // Build params object reactively
  $: params = { server, s, o, nots, noto, match, limit, offset, when };
  
  // ============================================================================
  // CUSTOMIZE: Set your query endpoint
  // ============================================================================
  
  // Change 'pages' and 'thorped' to match your desired /get/[what]/[by] endpoint
  const query = createOctoQuery('pages', 'thorped');
  
  // ============================================================================
  // STANDARD METHODS - Usually don't need to change these
  // ============================================================================
  
  async function load() {
    await query.fetch(params);
  }
  
  onMount(() => {
    if (autoload || autoload === '') {
      load();
    }
  });
  
  // ============================================================================
  // COMPONENT-SPECIFIC HELPERS - Add any custom helpers here
  // ============================================================================
  
  // Common display helpers (getTitle, getUrl, formatDate) are imported from display-helpers.js
  // Add component-specific helper functions here if needed
</script>

<!-- ========================================================================== -->
<!-- CUSTOMIZE: Your component template below                                  -->
<!-- ========================================================================== -->

{#if render === 'count'}
  <!-- Count mode - inline display -->
  {#if $query.loading}
    <span class="count-loading">…</span>
  {:else if $query.error}
    <span class="count-error">✗</span>
  {:else}
    <span class="count">{$query.count}</span>
  {/if}

{:else}
  <!-- Full component display -->
  <div class="component-container">
    
    <!-- Loading prompt -->
    {#if !$query.results.length && !$query.loading && !$query.error}
      <button on:click={load} class="load-button">
        Load data
      </button>
    {/if}
    
    <!-- Loading state -->
    {#if $query.loading}
      <div class="loading">
        <div class="spinner"></div>
        <p>Loading...</p>
      </div>
    {/if}
    
    <!-- Error state -->
    {#if $query.error}
      <div class="error">
        <p><strong>Error:</strong> {$query.error}</p>
        <button on:click={load} class="retry-button">Retry</button>
      </div>
    {/if}
    
    <!-- Results -->
    {#if $query.results.length > 0 && !$query.loading}
      
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
      
      <!-- Result count -->
      <div class="meta">
        <span class="result-count">{$query.count} result{$query.count === 1 ? '' : 's'}</span>
      </div>
      
    {/if}
    
  </div>
{/if}

<!-- ========================================================================== -->
<!-- STYLES - Customize as needed                                              -->
<!-- Use CSS custom properties (--var-name) for user customization             -->
<!-- ========================================================================== -->

<style>
  /* CSS Custom Properties - users can override these */
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
  
  .component-container {
    background: var(--octo-background);
  }
  
  /* Count mode (inline) */
  .count,
  .count-loading,
  .count-error {
    font-weight: bold;
  }
  
  .count-loading {
    opacity: 0.5;
  }
  
  .count-error {
    color: var(--octo-error);
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
  
  /* Meta info */
  .meta {
    margin-top: var(--octo-spacing);
    padding-top: var(--octo-spacing);
    border-top: 1px solid var(--octo-border);
    text-align: right;
  }
  
  .result-count {
    font-size: 0.875rem;
    color: #666;
  }
</style>
