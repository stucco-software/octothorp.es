<script type="text/javascript">
  import { browser } from '$app/environment'
  import { goto } from '$app/navigation'
  import { page } from '$app/stores'

  // Initialize from URL params if available
  $: urlParams = browser ? new URLSearchParams($page.url.search) : new URLSearchParams()

  // Form state
  let what = 'everything'
  let by = 'thorped'
  let format = 'json'

  // Query parameters
  let subjects = ''
  let objects = ''
  let notSubjects = ''
  let notObjects = ''
  let subjectMatch = 'auto'
  let objectMatch = 'auto'
  let limit = 20
  let offset = 0
  let when = ''

  // Results
  let results = null
  let loading = false
  let queryUrl = ''
  let error = null

  // Load state from URL params on mount and execute query if params exist
  let hasLoadedFromUrl = false
  if (browser) {
    const params = new URLSearchParams(window.location.search)
    const hasParams = params.toString().length > 0
    
    if (params.has('what')) what = params.get('what')
    if (params.has('by')) by = params.get('by')
    if (params.has('format')) format = params.get('format')
    if (params.has('subjects')) subjects = params.get('subjects')
    if (params.has('objects')) objects = params.get('objects')
    if (params.has('notSubjects')) notSubjects = params.get('notSubjects')
    if (params.has('notObjects')) notObjects = params.get('notObjects')
    if (params.has('subjectMatch')) subjectMatch = params.get('subjectMatch')
    if (params.has('objectMatch')) objectMatch = params.get('objectMatch')
    if (params.has('limit')) limit = parseInt(params.get('limit'))
    if (params.has('offset')) offset = parseInt(params.get('offset'))
    if (params.has('when')) when = params.get('when')
    
    // If URL has params, execute query after a brief delay to ensure reactive statements run
    if (hasParams) {
      hasLoadedFromUrl = true
      setTimeout(() => executeQuery(), 50)
    }
  }

  // Update URL params when form values change
  $: {
    if (browser) {
      const params = new URLSearchParams()
      if (what !== 'everything') params.set('what', what)
      if (by !== 'thorped') params.set('by', by)
      if (format !== 'json') params.set('format', format)
      if (subjects) params.set('subjects', subjects)
      if (objects) params.set('objects', objects)
      if (notSubjects) params.set('notSubjects', notSubjects)
      if (notObjects) params.set('notObjects', notObjects)
      if (subjectMatch !== 'auto') params.set('subjectMatch', subjectMatch)
      if (objectMatch !== 'auto') params.set('objectMatch', objectMatch)
      if (limit !== 20) params.set('limit', limit.toString())
      if (offset !== 0) params.set('offset', offset.toString())
      if (when) params.set('when', when)

      const newUrl = params.toString() ? `?${params.toString()}` : '/explore'
      if (window.location.search !== '?' + params.toString()) {
        goto(newUrl, { replaceState: true, noScroll: true, keepFocus: true })
      }
    }
  }

  // Generate API URL reactively
  $: {
    if (browser) {
      const base = window.location.origin
      let url = `${base}/get/${what}/${by}`
      if (format !== 'json') url += `/${format}`

      const params = new URLSearchParams()
      if (subjects) params.append('s', subjects)
      if (objects) params.append('o', objects)
      if (notSubjects) params.append('not-s', notSubjects)
      if (notObjects) params.append('not-o', notObjects)
      
      // Determine match strategy based on subject/object settings
      let match = 'auto'
      if (subjectMatch === 'fuzzy' && objectMatch === 'auto') {
        match = 'fuzzy-s'
      } else if (objectMatch === 'fuzzy' && subjectMatch === 'auto') {
        match = 'fuzzy-o'
      } else if (objectMatch === 'very-fuzzy') {
        match = 'very-fuzzy-o'
      } else if (subjectMatch === 'fuzzy' || objectMatch === 'fuzzy') {
        match = 'fuzzy'
      }
      
      if (match !== 'auto') params.append('match', match)
      if (limit) params.append('limit', limit)
      if (offset) params.append('offset', offset)
      if (when) params.append('when', when)

      queryUrl = url + (params.toString() ? '?' + params : '')
    }
  }

  async function executeQuery() {
    if (!browser) return

    loading = true
    error = null
    results = null

    try {
      const response = await fetch(queryUrl)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      if (format === 'json' || format === 'debug') {
        results = await response.json()
      } else if (format === 'rss') {
        results = await response.text()
      } else {
        results = await response.json()
      }
    } catch (err) {
      error = err.message
    } finally {
      loading = false
    }
  }

  function copyUrl() {
    if (browser && navigator.clipboard) {
      navigator.clipboard.writeText(queryUrl)
    }
  }

  async function loadPreset(preset) {
    switch(preset) {
      case 'wwo':
        what = 'everything'
        by = 'thorped'
        objects = 'weirdweboctober'
        when = 'recent'
        limit = 50
        break
      case 'my-bookmarks':
        what = 'pages'
        by = 'bookmarked'
        subjects = 'example.com'
        break
      case 'backlinks':
        what = 'pages'
        by = 'backlinked'
        objects = 'https://example.com/page'
        break
      case 'webring':
        what = 'everything'
        by = 'in-webring'
        subjects = 'https://example.com/webring'
        break
    }
    // Wait for reactive statement to update queryUrl
    await new Promise(resolve => setTimeout(resolve, 0))
    // Execute query after loading preset
    executeQuery()
  }
</script>

<svelte:head>
  <title>API Explorer - Octothorpes Protocol</title>
</svelte:head>

<h1>Octothorpe Explorer</h1>


<div class="explorer-container">
  <!-- Sidebar with Form -->
  <aside class="sidebar">
    <form on:submit|preventDefault={executeQuery}>
      <!-- Quick Presets -->
      <fieldset class="compact">
        <legend>Presets</legend>
        <button type="button" on:click={() => loadPreset('wwo')}>
          Recent #weirdweboctober
        </button>
        <button type="button" on:click={() => loadPreset('my-bookmarks')}>
          My bookmarks
        </button>
        <button type="button" on:click={() => loadPreset('backlinks')}>
          Backlinks
        </button>
        <button type="button" on:click={() => loadPreset('webring')}>
          Webring
        </button>
      </fieldset>

      <fieldset class="compact">
        <legend>What</legend>
        <select bind:value={what}>
          <option value="everything">Everything</option>
          <option value="pages">Pages</option>
          <option value="thorpes">Thorpes</option>
          <option value="domains">Domains</option>
        </select>
      </fieldset>

      <fieldset class="compact">
        <legend>Filter by</legend>
        <select bind:value={by}>
          <option value="thorped">Thorped</option>
          <option value="linked">Linked</option>
          <option value="backlinked">Backlinked</option>
          <option value="bookmarked">Bookmarked</option>
          <option value="posted">Posted</option>
          <option value="in-webring">In Webring</option>
        </select>
      </fieldset>

      <fieldset class="compact">
        <legend>Filters</legend>
        <div class="field-with-toggle">
          <label>
            Subjects
            <input
              type="text"
              bind:value={subjects}
              placeholder="example.com">
          </label>
          <div class="toggle-buttons">
            <button 
              type="button" 
              class:active={subjectMatch === 'auto'}
              on:click={() => subjectMatch = 'auto'}>
              Auto
            </button>
            <button 
              type="button" 
              class:active={subjectMatch === 'fuzzy'}
              on:click={() => subjectMatch = 'fuzzy'}>
              Fuzzy
            </button>
          </div>
        </div>
        <div class="field-with-toggle">
          <label>
            Objects
            <input
              type="text"
              bind:value={objects}
              placeholder="demo">
          </label>
          <div class="toggle-buttons">
            <button 
              type="button" 
              class:active={objectMatch === 'auto'}
              on:click={() => objectMatch = 'auto'}>
              Auto
            </button>
            <button 
              type="button" 
              class:active={objectMatch === 'fuzzy'}
              on:click={() => objectMatch = 'fuzzy'}>
              Fuzzy
            </button>
            <button 
              type="button" 
              class:active={objectMatch === 'very-fuzzy'}
              on:click={() => objectMatch = 'very-fuzzy'}>
              Very
            </button>
          </div>
        </div>
        <label>
          Exclude Subjects
          <input
            type="text"
            bind:value={notSubjects}
            placeholder="spam.com">
        </label>
        <label>
          Exclude Objects
          <input
            type="text"
            bind:value={notObjects}
            placeholder="test">
        </label>
      </fieldset>

      <fieldset class="compact">
        <legend>Date</legend>
        <label>
          When
          <input
            type="text"
            bind:value={when}
            placeholder="recent">
        </label>
        <div class="quick-dates">
          <button type="button" on:click={() => when = 'recent'}>Recent</button>
          <button type="button" on:click={() => when = ''}>Clear</button>
        </div>
      </fieldset>

      <fieldset class="compact">
        <legend>Options</legend>
        <label>
          Limit
          <input
            type="number"
            bind:value={limit}
            min="1"
            max="100">
        </label>
        <label>
          Offset
          <input
            type="number"
            bind:value={offset}
            min="0">
        </label>
      </fieldset>

      {#if objectMatch === 'very-fuzzy' && when}
        <div class="warning">
          Warning: Very fuzzy + date is slow!
        </div>
      {/if}

      <div class="actions">
        <button type="submit" disabled={loading}>
          Execute
        </button>
        <button type="button" on:click={copyUrl}>Copy URL</button>
      </div>
    </form>

    <!-- Generated URL -->
    <section class="url-section">
      <h4>URL</h4>
      <code>{queryUrl}</code>
    </section>
  </aside>

  <!-- Main Results Area -->
  <main class="results-area">
    {#if loading}
      <div class="loading-state">
        <p>Loading...</p>
      </div>
    {:else if error}
      <section class="results error">
        <h3>Error</h3>
        <pre>{error}</pre>
      </section>
    {:else if results}
      <section class="results">
        <div class="results-header">
          <h3>Results</h3>
          <p class="result-count">
            {results.results?.length || 0} result{results.results?.length === 1 ? '' : 's'}
          </p>
        </div>
        {#if format === 'rss'}
          <pre>{results}</pre>
        {:else if format === 'debug'}
          <details>
            <summary>MultiPass Object</summary>
            <pre>{JSON.stringify(results.multiPass, null, 2)}</pre>
          </details>
          <details>
            <summary>SPARQL Query</summary>
            <pre>{results.query}</pre>
          </details>
          <details open>
            <summary>Actual Results ({results.actualResults?.length || 0})</summary>
            <pre>{JSON.stringify(results.actualResults, null, 2)}</pre>
          </details>
        {:else if what === 'everything'}
          <!-- Formatted blobjects display -->
          <div class="result-list">
            {#each results.results || [] as item}
              <article class="result-item">
                <h4 class="result-title">
                  <a href={item['@id']} target="_blank" rel="noopener noreferrer">
                    {item.title || item['@id']}
                  </a>
                </h4>
                <div class="result-url">{item['@id']}</div>
                {#if item.description}
                  <p class="result-description">{item.description}</p>
                {/if}
                {#if item.octothorpes && item.octothorpes.length > 0}
                  <div class="result-tags">
                    {#each item.octothorpes as thorpe}
                      {#if typeof thorpe === 'string'}
                        <a href="/~/{thorpe}" class="tag">#{thorpe}</a>
                      {:else if thorpe.type}
                        <span class="tag tag-{thorpe.type.toLowerCase()}">{thorpe.type}</span>
                      {/if}
                    {/each}
                  </div>
                {/if}
              </article>
            {/each}
          </div>
        {:else if what === 'pages'}
          <!-- Formatted pages display -->
          <div class="result-list">
            {#each results.results || [] as item}
              <article class="result-item">
                <h4 class="result-title">
                  <a href={item.uri} target="_blank" rel="noopener noreferrer">
                    {item.title || item.uri}
                  </a>
                </h4>
                <div class="result-url">{item.uri}</div>
                {#if item.description}
                  <p class="result-description">{item.description}</p>
                {/if}
              </article>
            {/each}
          </div>
        {:else if what === 'thorpes'}
          <!-- Formatted thorpes display -->
          <div class="result-list">
            {#each results.results || [] as item}
              <div class="thorpe-item">
                <span class="tag tag-large">#{item.term}</span>
              </div>
            {/each}
          </div>
        {:else if what === 'domains'}
          <!-- Formatted domains display -->
          <div class="result-list">
            {#each results.results || [] as item}
              <div class="domain-item">
                <a href={item.origin || item} target="_blank" rel="noopener noreferrer">
                  {item.origin || item}
                </a>
              </div>
            {/each}
          </div>
        {:else}
          <!-- Fallback to raw JSON -->
          <pre>{JSON.stringify(results, null, 2)}</pre>
        {/if}
      </section>
    {:else}
      <div class="empty-state">
        <p>Configure your query and click Execute to see results</p>
      </div>
    {/if}
  </main>
</div>

<style type="text/css">
  h1 {
    font-family: var(--serif-stack);
    margin-block-end: var(--baseline);
  }

  .description {
    max-width: 100%;
    margin-block-end: var(--baseline);
  }

  .explorer-container {
    display: grid;
    grid-template-columns: 320px 1fr;
    gap: 1.5rem;
    max-width: 1200px;
    margin-inline: auto;
    align-items: start;
  }

  /* Sidebar */
  .sidebar {
    position: sticky;
    top: 1rem;
    max-height: calc(100vh - 2rem);
    overflow-y: auto;
  }

  .sidebar form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  /* Compact fieldsets */
  fieldset.compact {
    border: 1px solid var(--txt-color);
    padding: 0.5rem;
    margin: 0;
    background-color: var(--bg-color);
  }

  fieldset.compact legend {
    font-weight: bold;
    padding-inline: 0.25rem;
    font-family: var(--sans-stack);
    font-size: var(--txt--1);
  }

  /* Preset buttons */
  fieldset.compact button[type="button"] {
    display: block;
    width: 100%;
    margin-block-end: 0.25rem;
    text-align: left;
    padding: 0.375rem 0.5rem;
    font-size: var(--txt--2);
  }

  fieldset.compact button[type="button"]:last-child {
    margin-block-end: 0;
  }

  /* Form controls */
  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-family: var(--sans-stack);
    font-size: var(--txt--2);
    margin-block-end: 0.5rem;
  }

  label:last-child {
    margin-block-end: 0;
  }

  .field-with-toggle {
    margin-block-end: 0.75rem;
  }

  .field-with-toggle label {
    margin-block-end: 0.25rem;
  }

  .toggle-buttons {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(50px, 1fr));
    gap: 0.25rem;
  }

  .toggle-buttons button {
    padding: 0.25rem 0.5rem;
    font-size: var(--txt--2);
    background-color: var(--bg-color);
  }

  .toggle-buttons button.active {
    background-color: lightgoldenrodyellow;
    font-weight: bold;
  }

  .toggle-buttons button:hover {
    background-color: yellow;
  }

  input[type="text"],
  input[type="number"],
  select {
    padding: 0.375rem;
    border: 1px solid var(--txt-color);
    font-family: var(--mono-stack);
    font-size: var(--txt--2);
    width: 100%;
  }

  input[type="text"]:focus,
  input[type="number"]:focus,
  select:focus {
    outline: 2px solid yellow;
    outline-offset: 2px;
  }

  .quick-dates {
    display: flex;
    gap: 0.25rem;
    margin-block-start: 0.5rem;
  }

  .quick-dates button {
    flex: 1;
    padding: 0.375rem 0.5rem;
    font-size: var(--txt--2);
  }

  button {
    padding: 0.5rem 0.75rem;
    background-color: var(--bg-color);
    border: 1px solid var(--txt-color);
    cursor: pointer;
    font-family: var(--sans-stack);
    font-size: var(--txt--1);
  }

  button:hover {
    background-color: yellow;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }

  .actions button {
    font-size: var(--txt--2);
    padding: 0.5rem;
  }

  .warning {
    background-color: yellow;
    border: 1px solid orange;
    padding: 0.5rem;
    font-size: var(--txt--2);
    font-weight: bold;
  }

  /* URL section in sidebar */
  .url-section {
    background-color: var(--bg-color);
    border: 1px solid var(--txt-color);
    padding: 0.5rem;
    margin-block-start: 0.75rem;
  }

  .url-section h4 {
    margin: 0 0 0.5rem 0;
    font-family: var(--sans-stack);
    font-size: var(--txt--1);
  }

  .url-section code {
    display: block;
    background-color: lightgoldenrodyellow;
    padding: 0.375rem;
    overflow-wrap: break-word;
    word-break: break-all;
    font-family: var(--mono-stack);
    font-size: var(--txt--2);
    line-height: 1.3;
  }

  /* Main results area */
  .results-area {
    min-height: 400px;
  }

  .empty-state {
    padding: 2rem;
    text-align: center;
    color: #666;
    border: 2px dashed var(--txt-color);
  }

  .loading-state {
    padding: 2rem;
    text-align: center;
    border: 2px solid var(--txt-color);
    background-color: lightgoldenrodyellow;
  }

  .loading-state p {
    margin: 0;
    font-family: var(--sans-stack);
    font-weight: bold;
  }

  .results {
    background-color: var(--bg-color);
    border: 2px solid var(--txt-color);
    padding: 1rem;
  }

  .results.error {
    background-color: #ffeeee;
    border-color: red;
  }

  .results-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-block-end: 1rem;
    padding-block-end: 0.5rem;
    border-bottom: 1px solid var(--txt-color);
  }

  .results h3 {
    margin: 0;
    font-family: var(--sans-stack);
    font-size: var(--txt-0);
  }

  .result-count {
    font-family: var(--mono-stack);
    font-size: var(--txt--1);
    color: #666;
    margin: 0;
  }

  /* Result list */
  .result-list {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .result-item {
    border-bottom: 1px solid #e0e0e0;
    padding-block-end: 1rem;
  }

  .result-item:last-child {
    border-bottom: none;
    padding-block-end: 0;
  }

  .result-title {
    margin: 0 0 0.25rem 0;
    font-family: var(--serif-stack);
    font-size: var(--txt-1);
    font-weight: normal;
    line-height: 1.3;
  }

  .result-title a {
    color: var(--txt-color);
    text-decoration: none;
  }

  .result-title a:hover {
    text-decoration: underline;
    background-color: yellow;
  }

  .result-url {
    font-family: var(--mono-stack);
    font-size: var(--txt--2);
    color: #666;
    margin-block-end: 0.5rem;
    word-break: break-all;
  }

  .result-description {
    margin: 0.5rem 0;
    font-size: var(--txt--1);
    line-height: 1.5;
    color: #333;
  }

  .result-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-block-start: 0.75rem;
  }

  .tag {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    background-color: lightgoldenrodyellow;
    border: 1px solid var(--txt-color);
    font-family: var(--mono-stack);
    font-size: var(--txt--2);
    line-height: 1;
    text-decoration: none;
    color: var(--txt-color);
  }

  a.tag:hover {
    background-color: yellow;
    text-decoration: none;
  }

  .tag-large {
    padding: 0.5rem 0.75rem;
    font-size: var(--txt--1);
  }

  .tag-backlink {
    background-color: #e8f4f8;
  }

  .tag-cite {
    background-color: #f0e8f8;
  }

  .tag-bookmark {
    background-color: #f8f0e8;
  }

  .tag-link {
    background-color: #e8f8e8;
  }

  /* Thorpe and domain items */
  .thorpe-item,
  .domain-item {
    padding: 0.5rem 0;
    border-bottom: 1px solid #e0e0e0;
  }

  .thorpe-item:last-child,
  .domain-item:last-child {
    border-bottom: none;
  }

  .domain-item a {
    font-family: var(--mono-stack);
    font-size: var(--txt-0);
    color: var(--txt-color);
    text-decoration: none;
  }

  .domain-item a:hover {
    text-decoration: underline;
    background-color: yellow;
  }

  pre {
    background-color: #f5f5f5;
    padding: 1rem;
    overflow-x: auto;
    font-family: var(--mono-stack);
    font-size: var(--txt--2);
    line-height: 1.4;
    margin: 0;
  }

  details {
    margin-block-end: 1rem;
  }

  details:last-child {
    margin-block-end: 0;
  }

  summary {
    cursor: pointer;
    font-weight: bold;
    padding: 0.5rem;
    background-color: lightgoldenrodyellow;
  }

  summary:hover {
    background-color: yellow;
  }

  /* Responsive adjustments */
  @media (max-width: 900px) {
    .explorer-container {
      grid-template-columns: 1fr;
    }

    .sidebar {
      position: static;
      max-height: none;
    }
  }
</style>
