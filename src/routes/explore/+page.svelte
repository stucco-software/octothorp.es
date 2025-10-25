<script type="text/javascript">
  import { browser } from '$app/environment'
  import { goto } from '$app/navigation'
  import { page } from '$app/stores'
  import Loading from '$lib/components/Loading.svelte'
  import RSSFeed from '$lib/components/RSSFeed.svelte'
  import PreviewImage from '$lib/components/PreviewImage.svelte'

  // Initialize from URL params if available
  $: urlParams = browser ? new URLSearchParams($page.url.search) : new URLSearchParams()

  // Form state
  let what = 'everything'
  let by = 'thorped'
  let format = 'json'

  // Query parameters
  let subjects = []
  let objects = []
  let notSubjects = []
  let notObjects = []
  let subjectMatch = 'auto'
  let objectMatch = 'auto'
  let limit = 50
  let offset = 0
  let when = ''

  // Input values for tokenized fields
  let subjectsInput = ''
  let objectsInput = ''
  let notSubjectsInput = ''
  let notObjectsInput = ''

  // Results
  let results = null
  let loading = false
  let queryUrl = ''
  let error = null



  // Dynamic labels based on "by" value
  $: subjectLabel = by === 'thorped' ? 'URLs' : by === 'in-webring' ? 'Full Webring URL' : 'From:'
  $: objectLabel = by === 'thorped' ? '#s' : by === 'in-webring' ? '#s' : 'To:'
  $: objectPlaceholder = objectLabel === '#s' ? 'demo' : 'Full or partial URL'

  // Clear objects when "posted" is selected
  $: if (by === 'posted') {
    objects = []
    objectsInput = ''
  }

  // Load state from URL params on mount and execute query if params exist
  let hasLoadedFromUrl = false
  if (browser) {
    const params = new URLSearchParams(window.location.search)
    const hasParams = params.toString().length > 0

    if (params.has('what')) what = params.get('what')
    if (params.has('by')) by = params.get('by')
    if (params.has('format')) format = params.get('format')
    // Support both old and new parameter names
    if (params.has('s')) subjects = params.get('s').split(',').filter(s => s.trim())
    else if (params.has('subjects')) subjects = params.get('subjects').split(',').filter(s => s.trim())
    if (params.has('o')) objects = params.get('o').split(',').filter(s => s.trim())
    else if (params.has('objects')) objects = params.get('objects').split(',').filter(s => s.trim())
    if (params.has('not-s')) notSubjects = params.get('not-s').split(',').filter(s => s.trim())
    else if (params.has('notSubjects')) notSubjects = params.get('notSubjects').split(',').filter(s => s.trim())
    if (params.has('not-o')) notObjects = params.get('not-o').split(',').filter(s => s.trim())
    else if (params.has('notObjects')) notObjects = params.get('notObjects').split(',').filter(s => s.trim())
    // Handle match parameter - convert to subjectMatch/objectMatch
    if (params.has('match')) {
      const match = params.get('match')
      if (match === 'fuzzy-s') {
        subjectMatch = 'fuzzy'
        objectMatch = 'auto'
      } else if (match === 'fuzzy-o') {
        subjectMatch = 'auto'
        objectMatch = 'fuzzy'
      } else if (match === 'very-fuzzy-o') {
        subjectMatch = 'auto'
        objectMatch = 'very-fuzzy'
      } else if (match === 'fuzzy') {
        subjectMatch = 'fuzzy'
        objectMatch = 'fuzzy'
      }
    } else {
      if (params.has('subjectMatch')) subjectMatch = params.get('subjectMatch')
      if (params.has('objectMatch')) objectMatch = params.get('objectMatch')
    }
    if (params.has('limit')) limit = parseInt(params.get('limit'))
    if (params.has('offset')) offset = parseInt(params.get('offset'))
    if (params.has('when')) when = params.get('when')

    // If URL has params, execute query after a brief delay to ensure reactive statements run
    if (hasParams) {
      hasLoadedFromUrl = true
      setTimeout(() => executeQuery(), 50)
    }
  }

  // Update URL params when form values change (use API parameter names)
  $: {
    if (browser) {
      const params = new URLSearchParams()
      if (what !== 'everything') params.set('what', what)
      if (by !== 'thorped') params.set('by', by)
      if (format !== 'json') params.set('format', format)
      if (subjects.length > 0) params.set('s', subjects.join(','))
      if (objects.length > 0) params.set('o', objects.join(','))
      if (notSubjects.length > 0) params.set('not-s', notSubjects.join(','))
      if (notObjects.length > 0) params.set('not-o', notObjects.join(','))

      // Calculate match parameter from subjectMatch/objectMatch
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
      if (match !== 'auto') params.set('match', match)

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

      const params = []
      if (subjects.length > 0) params.push('s=' + subjects.join(','))
      if (objects.length > 0) params.push('o=' + objects.join(','))
      if (notSubjects.length > 0) params.push('not-s=' + notSubjects.join(','))
      if (notObjects.length > 0) params.push('not-o=' + notObjects.join(','))

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

      if (match !== 'auto') params.push('match=' + match)
      if (limit) params.push('limit=' + limit)
      if (offset) params.push('offset=' + offset)
      if (when) params.push('when=' + when)

      queryUrl = url + (params.length > 0 ? '?' + params.join('&') : '')
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
      // Optional: Could add a toast notification here
    }
  }

  async function copyMultipass() {
    if (!browser || !results) return

    try {
      // Fetch the debug endpoint to get the multiPass object
      const debugUrl = queryUrl.replace(/\/get\/([^/]+)\/([^/?]+)(\/[^?]+)?/, '/get/$1/$2/debug')
      const response = await fetch(debugUrl)
      if (!response.ok) throw new Error('Failed to fetch MultiPass')

      const data = await response.json()
      const multiPassJson = JSON.stringify(data.multiPass, null, 2)

      if (navigator.clipboard) {
        await navigator.clipboard.writeText(multiPassJson)
        // Could add visual feedback here
      }
    } catch (err) {
      console.error('Error copying MultiPass:', err)
    }
  }

  async function downloadMultipass() {
    if (!browser || !results) return

    try {
      // Fetch the debug endpoint to get the multiPass object
      const debugUrl = queryUrl.replace(/\/get\/([^/]+)\/([^/?]+)(\/[^?]+)?/, '/get/$1/$2/debug')
      const response = await fetch(debugUrl)
      if (!response.ok) throw new Error('Failed to fetch MultiPass')

      const data = await response.json()
      const multiPassJson = JSON.stringify(data.multiPass, null, 2)

      // Create download
      const blob = new Blob([multiPassJson], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'multipass.json'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Error downloading MultiPass:', err)
    }
  }

  function clearForm() {
    // Reset all form values to defaults
    what = 'everything'
    by = 'thorped'
    format = 'json'
    subjects = []
    objects = []
    notSubjects = []
    notObjects = []
    subjectMatch = 'auto'
    objectMatch = 'auto'
    limit = 20
    offset = 0
    when = ''
    subjectsInput = ''
    objectsInput = ''
    notSubjectsInput = ''
    notObjectsInput = ''
    results = null
    error = null
  }

  async function loadPreset(preset) {
    switch(preset) {
      case 'wwo':
        what = 'everything'
        by = 'thorped'
        objects = ['weirdweboctober']
        when = 'recent'
        limit = 50
        break
      case 'my-bookmarks':
        what = 'pages'
        by = 'bookmarked'
        subjects = ['example.com']
        break
    }
    // Wait for reactive statement to update queryUrl
    await new Promise(resolve => setTimeout(resolve, 0))
    // Execute query after loading preset
    executeQuery()
  }

  // Token handling functions
  function addToken(arrayName, inputName) {
    const arrays = { subjects, objects, notSubjects, notObjects }
    const inputs = { subjectsInput, objectsInput, notSubjectsInput, notObjectsInput }

    const inputValue = inputs[inputName].trim()
    if (!inputValue) return

    const currentArray = arrays[arrayName]
    if (!currentArray.includes(inputValue)) {
      if (arrayName === 'subjects') subjects = [...subjects, inputValue]
      else if (arrayName === 'objects') objects = [...objects, inputValue]
      else if (arrayName === 'notSubjects') notSubjects = [...notSubjects, inputValue]
      else if (arrayName === 'notObjects') notObjects = [...notObjects, inputValue]
    }

    if (inputName === 'subjectsInput') subjectsInput = ''
    else if (inputName === 'objectsInput') objectsInput = ''
    else if (inputName === 'notSubjectsInput') notSubjectsInput = ''
    else if (inputName === 'notObjectsInput') notObjectsInput = ''
  }

  function removeToken(arrayName, value) {
    if (arrayName === 'subjects') subjects = subjects.filter(v => v !== value)
    else if (arrayName === 'objects') objects = objects.filter(v => v !== value)
    else if (arrayName === 'notSubjects') notSubjects = notSubjects.filter(v => v !== value)
    else if (arrayName === 'notObjects') notObjects = notObjects.filter(v => v !== value)
  }

  function handleTokenInput(e, arrayName, inputName) {
    const inputs = { subjectsInput, objectsInput, notSubjectsInput, notObjectsInput }
    const arrays = { subjects, objects, notSubjects, notObjects }

    // Comma adds token
    if (e.key === ',') {
      e.preventDefault()
      addToken(arrayName, inputName)
    }
    // Tab or Enter: if there's text, tokenize it and prevent default
    else if ((e.key === 'Tab' || e.key === 'Enter') && inputs[inputName].trim()) {
      e.preventDefault()
      addToken(arrayName, inputName)
      // For Enter specifically, if input is now empty, submit the form
      if (e.key === 'Enter') {
        // Use setTimeout to let the addToken reactive updates complete
        setTimeout(() => {
          if (!inputs[inputName].trim()) {
            e.target.form.requestSubmit()
          }
        }, 0)
      }
    }
    // Backspace on empty input removes last token
    else if (e.key === 'Backspace' && !inputs[inputName]) {
      e.preventDefault()
      const currentArray = arrays[arrayName]
      if (currentArray.length > 0) {
        if (arrayName === 'subjects') subjects = subjects.slice(0, -1)
        else if (arrayName === 'objects') objects = objects.slice(0, -1)
        else if (arrayName === 'notSubjects') notSubjects = notSubjects.slice(0, -1)
        else if (arrayName === 'notObjects') notObjects = notObjects.slice(0, -1)
      }
    }
    // Enter on empty input: let it submit the form (don't prevent default)
  }
</script>

<svelte:head>
  <title>API Explorer - Octothorpes Protocol</title>
</svelte:head>

<h1>Explore with Octothorpes</h1>

<RSSFeed />

<div class="explorer-container">
  <!-- Sidebar with Form -->
  <aside class="sidebar">
    <form on:submit|preventDefault={executeQuery}>
      <!-- Quick Presets -->
      <fieldset class="compact">
        <legend>Shortcuts</legend>
        <button class="rainbow" type="button" on:click={() => loadPreset('wwo')}>
          Recent #weirdweboctober
        </button>
        <button type="button" on:click={clearForm}>
          Clear Form
        </button>
      </fieldset>

      <fieldset class="compact">
        <legend>Browse</legend>
        <select bind:value={what}>
          <option value="everything">Everything</option>
          <option value="pages">Pages</option>
          <option value="thorpes">Thorpes</option>
        </select>
        <select bind:value={by}>
          <option value="thorped">Tagged</option>
          <option value="posted">Posted</option>
          <option value="linked">Linked</option>
          <option value="backlinked">Backlinked</option>
          <option value="bookmarked">Bookmarked</option>
          <option value="in-webring">In Webring</option>
        </select>
      </fieldset>

      <fieldset class="compact">
        <legend>Parameters</legend>
        <label>
          {subjectLabel}
          <div class="token-input">
            {#each subjects as subject}
              <span class="token">
                {subject}
                <button type="button" class="token-remove" on:click={() => removeToken('subjects', subject)}>×</button>
              </span>
            {/each}
            <input
              type="text"
              bind:value={subjectsInput}
              on:keydown={(e) => handleTokenInput(e, 'subjects', 'subjectsInput')}
              on:blur={() => addToken('subjects', 'subjectsInput')}
              placeholder={subjects.length === 0 ? 'Full or partial URL' : ''}>
          </div>
        </label>
        <label>
          {objectLabel}
          <div class="token-input">
            {#each objects as object}
              <span class="token">
                {object}
                <button type="button" class="token-remove" on:click={() => removeToken('objects', object)}>×</button>
              </span>
            {/each}
            <input
              type="text"
              bind:value={objectsInput}
              on:keydown={(e) => handleTokenInput(e, 'objects', 'objectsInput')}
              on:blur={() => addToken('objects', 'objectsInput')}
              placeholder={objects.length === 0 ? objectPlaceholder : ''}
              disabled={by === 'posted'}>
          </div>
        </label>
      </fieldset>
      <details class="compact">
        <summary>Filters</summary>
        <!--
        <label>
          Exclude {subjectLabel}
          <div class="token-input">
            {#each notSubjects as subject}
              <span class="token">
                {subject}
                <button type="button" class="token-remove" on:click={() => removeToken('notSubjects', subject)}>×</button>
              </span>
            {/each}
            <input
              type="text"
              bind:value={notSubjectsInput}
              on:keydown={(e) => handleTokenInput(e, 'notSubjects', 'notSubjectsInput')}
              on:blur={() => addToken('notSubjects', 'notSubjectsInput')}
              placeholder={notSubjects.length === 0 ? 'Full or partial URL' : ''}>
          </div>
        </label>
        <label>
          Exclude {objectLabel}
          <div class="token-input">
            {#each notObjects as object}
              <span class="token">
                {object}
                <button type="button" class="token-remove" on:click={() => removeToken('notObjects', object)}>×</button>
              </span>
            {/each}
            <input
              type="text"
              bind:value={notObjectsInput}
              on:keydown={(e) => handleTokenInput(e, 'notObjects', 'notObjectsInput')}
              on:blur={() => addToken('notObjects', 'notObjectsInput')}
              placeholder={notObjects.length === 0 ? 'test' : ''}>
          </div>
        </label>
        -->

        <div class="matching-strategy">
          <label>Match Precision</label>
          <div class="radio-group">
            <label class="radio-label">
              <input
                type="radio"
                name="match"
                checked={subjectMatch === 'auto' && objectMatch === 'auto'}
                on:change={() => { subjectMatch = 'auto'; objectMatch = 'auto' }}>
              Auto
            </label>
            <label class="radio-label">
              <input
                type="radio"
                name="match"
                checked={subjectMatch === 'fuzzy' && objectMatch === 'auto'}
                on:change={() => { subjectMatch = 'fuzzy'; objectMatch = 'auto' }}>
              Fuzzy Subjects
            </label>
            <label class="radio-label">
              <input
                type="radio"
                name="match"
                checked={objectMatch === 'fuzzy' && subjectMatch === 'auto'}
                on:change={() => { subjectMatch = 'auto'; objectMatch = 'fuzzy' }}>
              Fuzzy Objects
            </label>
            <label class="radio-label">
              <input
                type="radio"
                name="match"
                checked={subjectMatch === 'fuzzy' && objectMatch === 'fuzzy'}
                on:change={() => { subjectMatch = 'fuzzy'; objectMatch = 'fuzzy' }}>
              Fuzzy Everything
            </label>
            <label class="radio-label">
              <input
                type="radio"
                name="match"
                checked={objectMatch === 'very-fuzzy'}
                on:change={() => { subjectMatch = 'auto'; objectMatch = 'very-fuzzy' }}>
              Very Fuzzy
            </label>
          </div>
        </div>
        <label>
          When
          <small>Accepts: <strong>recent</strong> (last two weeks), <strong>after-DATE</strong>, <strong>before-DATE</strong>, or <strong>between-DATE-and-DATE</strong>. DATE format is <strong>YYYY-MM-DD</strong></small>
          <input
            type="text"
            bind:value={when}
            placeholder="recent">
        </label>
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
      </details>

      {#if objectMatch === 'very-fuzzy' && when}
        <div class="warning">
          Warning: Very fuzzy + date is slow!
        </div>
      {/if}

      <div class="actions">
        <button class="rainbow" type="submit" disabled={loading}>
            EXPLORE
        </button>
      </div>
    </form>
    <details class="compact url-section">
      <summary>Advanced</summary>
    <!-- Generated URL -->
      <label>API URL</label>
      <code class="clickable-url" on:click={copyUrl} on:keydown={(e) => e.key === 'Enter' && copyUrl()} tabindex="0" title="Click to copy">{queryUrl}</code>
      <div class="url-actions">
        <a href={queryUrl.replace(/\/get\/([^/]+)\/([^/?]+)(\/[^?]+)?/, '/get/$1/$2/debug')} target="_blank" rel="noopener noreferrer" class="debug-link">Debug</a>
      </div>

      {#if results}
        <label style="margin-block-start: 0.75rem;">Save MultiPass for Current Query</label>
        <div style="display: flex; gap: 0.25rem;">
          <button type="button" class="small-button" on:click={copyMultipass}>
            Copy
          </button>
          <button type="button" class="small-button" on:click={downloadMultipass}>
            Download
          </button>
        </div>
      {/if}
    </details>
  </aside>

  <!-- Main Results Area -->
  <main class="results-area">
    {#if results}
      <div class="results-header">
        <h3>Results</h3>
        <p class="result-count">
          {results.results?.length || 0} result{results.results?.length === 1 ? '' : 's'}
        </p>
      </div>
    {/if}

    {#if loading}
      <Loading message="Loading results..." />
    {:else if error}
      <section class="results error">
        <h3>Error</h3>
        <pre>{error}</pre>
      </section>
    {:else if results}
      <section class="results">
          <!-- these modes can't currently appear but might be useful in the future -->
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
                <PreviewImage
                  url={item['@id']}
                  image={item.image}
                  title={item.title || item['@id']}
                />
                <div class="result-content">
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
                </div>
              </article>
            {/each}
          </div>
        {:else if what === 'pages'}
          <!-- Formatted pages display -->
          <div class="result-list">
            {#each results.results || [] as item}
              <article class="result-item">
                <PreviewImage
                  url={item.uri}
                  image={item.image}
                  title={item.title || item.uri}
                />
                <div class="result-content">
                  <h4 class="result-title">
                    <a href={item.uri} target="_blank" rel="noopener noreferrer">
                      {item.title || item.uri}
                    </a>
                  </h4>
                  <div class="result-url">{item.uri}</div>
                  {#if item.description}
                    <p class="result-description">{item.description}</p>
                  {/if}
                </div>
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
        <p>Set some query parameters and click "Explore" to discover sites connected to this OP relay.</p>
      </div>
    {/if}
  </main>
</div>

<style type="text/css">
  h1 {
    font-family: var(--serif-stack);
    margin-block-end: 0.5rem;
    font-size: var(--txt-1);
    max-width: 1200px;
    margin-inline: auto;
    padding-inline: 1rem;
  }

  .description {
    max-width: 100%;
    margin-block-end: var(--baseline);
  }

  .explorer-container {
    display: grid;
    grid-template-columns: 280px 1fr;
    gap: 1rem;
    max-width: 1200px;
    margin-inline: auto;
    align-items: start;
  }

  /* Sidebar */
  .sidebar {
    position: sticky;
    padding-top: 1rem;
    padding-right: .5rem;
    top: 1rem;
    max-height: calc(100vh - 2rem);
    overflow-y: auto;
  }

  .sidebar form {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  /* Compact fieldsets */
  fieldset.compact {
      border: 0px;
    border-top: 1px solid var(--txt-color);
    padding: 0.375rem;
    margin: 0;
    background-color: var(--bg-color);
  }

  fieldset.compact legend {
    font-weight: bold;
    padding-inline: 0.25rem;
    font-family: var(--sans-stack);
    font-size: var(--txt--2);
  }

  /* Compact details (collapsible sections) */
  details.compact {
    border: 0px;
    border-top: 1px solid var(--txt-color);
    padding: 0.375rem;
    margin: 0;
    background-color: var(--bg-color);
  }

  details.compact summary {
      background-color: var(--bg-color);
    font-weight: bold;
    padding: 0.125rem 0.25rem;
    font-family: var(--sans-stack);
    font-size: var(--txt--2);
    cursor: pointer;
    list-style-position: inside;
    margin: -0.375rem -0.375rem 0.375rem -0.375rem;
  }

  details.compact summary:hover {
    background-color: yellow;
  }

  details.compact[open] summary {
    margin-bottom: 0.375rem;
  }

  /* Preset buttons */
  fieldset.compact button[type="button"] {
    display: block;
    width: 100%;
    margin-block-end: 0.25rem;
    text-align: left;
    padding: 0.25rem 0.375rem;
    font-size: var(--txt--2);
  }

  fieldset.compact button[type="button"]:last-child {
    margin-block-end: 0;
  }

  /* Form controls */
  label {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    font-family: var(--sans-stack);
    font-size: var(--txt--2);
    margin-block-end: 0.375rem;
  }

  label:last-child {
    margin-block-end: 0;
  }

  .field-with-toggle {
    margin-block-end: 0.5rem;
  }

  .field-with-toggle label {
    margin-block-end: 0.125rem;
  }

  .toggle-buttons {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(50px, 1fr));
    gap: 0.25rem;
  }

  .toggle-buttons button {
    padding: 0.125rem 0.375rem;
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

  .radio-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-block-start: 0.25rem;
  }

  .radio-label {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.375rem;
    padding: 0.125rem 0;
    cursor: pointer;
    font-size: var(--txt--2);
    margin-block-end: 0;
  }

  .radio-label input[type="radio"] {
    width: auto;
    cursor: pointer;
  }

  input[type="text"],
  input[type="number"],
  select {
    padding: 0.25rem;
    font-family: var(--mono-stack);
    font-size: var(--txt--2);
    width: 100%;
  }

  input[type="text"]:focus,
  input[type="number"]:focus,
  select:focus {
    /*outline: 2px solid yellow;
    outline-offset: 2px;*/
  }

  /* Token input */
  .token-input {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    padding: 0.25rem;
    background-color: var(--bg-color);
    min-height: 2rem;
    align-items: center;
  }

  .token-input:focus-within {
    outline: 2px solid yellow;
  }

  .token-input input {
    flex: 1;
    min-width: 80px;
    border: none;
    padding: 0.125rem;
    font-family: var(--mono-stack);
    font-size: var(--txt--2);
    outline: none;
  }

  .token-input input:disabled {
    background-color: #f0f0f0;
    color: #999;
    cursor: not-allowed;
  }

  .token-input:has(input:disabled) {
    background-color: #f0f0f0;
    opacity: 0.6;
  }

  .token-input .token {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.375rem;
    background-color: lightgoldenrodyellow;
    font-family: var(--mono-stack);
    font-size: var(--txt--2);
    line-height: 1.4;
  }

  .token-remove {
    padding: 0;
    margin: 0;
    border: none;
    background: none;
    cursor: pointer;
    font-size: var(--txt-0);
    line-height: 1;
    color: var(--txt-color);
    font-weight: bold;
  }

  .token-remove:hover {
    color: red;
    background: none;
  }

  .quick-dates {
    display: flex;
    gap: 0.25rem;
    margin-block-start: 0.25rem;
  }

  .quick-dates button {
    flex: 1;
    padding: 0.25rem 0.375rem;
    font-size: var(--txt--2);
  }

  small {
      line-height: 110%;
      padding: 5px;
  }
  button {
    padding: 0.25rem 0.5rem;
    height: 2rem;
    background-color: var(--bg-color);
    border: 1px solid var(--txt-color);
    cursor: pointer;
    font-family: var(--sans-stack);
    font-size: var(--txt--2);
    margin: 0.125rem;
  }

  button:hover {
    background-color: yellow;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .actions {
    /*display: grid;*/
    grid-template-columns: 1fr 1fr;
    gap: 0.25rem;
  }

  .actions button {
    font-size: var(--txt--2);
    padding: 0px .5rem;
    width: 90%;
    text-align: center;
    margin: 10px auto 3rem;
  }

  .rainbow {
      box-shadow: 1px 1px 2px blue, 3px 3px 2px red, 5px 5px 2px lime, 7px 7px 2px yellow;
      margin-bottom: 25px;
  }

  .rainbow:hover {
      box-shadow: 5px 5px 8px blue, 10px 10px 8px red, 15px 15px 8px lime, 22px 22px 8px yellow;
  }

  .warning {
    background-color: yellow;
    border: 1px solid orange;
    padding: 0.375rem;
    font-size: var(--txt--2);
    font-weight: bold;
  }

  /* URL section in sidebar */
  .url-section {
    background-color: var(--bg-color);
    border-top: 1px solid var(--txt-color);
    padding: 0.375rem;
    margin-block-start: 0.5rem;
  }

  .url-section h4 {
    margin: 0 0 0.25rem 0;
    font-family: var(--sans-stack);
    font-size: var(--txt--2);
  }

  .url-section code {
    display: block;
    background-color: lightgoldenrodyellow;
    padding: 0.25rem;
    overflow-wrap: break-word;
    word-break: break-all;
    color: var(--txt-0);
    font-family: var(--mono-stack);
    font-size: var(--txt--2);
    line-height: 1.2;
  }

  .clickable-url {
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .clickable-url:hover {
    background-color: yellow !important;
  }

  .clickable-url:active {
    background-color: orange !important;
  }

  .url-actions {
    display: flex;
    gap: 0.25rem;
    margin-block-start: 0.25rem;
  }

  .small-button {
    padding: 0.125rem 0.375rem;
    height: 1.5rem;
    font-size: var(--txt--2);
  }

  .debug-link {
    display: inline-flex;
    align-items: center;
    padding: 0.125rem 0.375rem;
    height: 1.5rem;
    background-color: var(--bg-color);
    border: 1px solid var(--txt-color);
    font-family: var(--sans-stack);
    font-size: var(--txt--2);
    text-decoration: none;
    color: var(--txt-color);
  }

  .debug-link:hover {
    background-color: yellow;
  }

  /* Main results area */
  .results-area {
    min-height: 300px;
  }

  .empty-state {
    padding: 1rem;
    text-align: center;
    color: #666;
    border: 2px dashed var(--txt-color);
    font-size: var(--txt--1);
  }

  .results {
    background-color: var(--bg-color);
    padding: 0.5rem;
  }

  .results.error {
    background-color: #ffeeee;
    background-image: none;
    border-color: red;
  }

  .results-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-block-end: 0.5rem;
    padding-block-end: 0.25rem;
    padding-inline: 0.25rem;
    border-bottom: 1px solid var(--txt-color);
    background-color: var(--bg-color);
  }

  .results-header h3 {
    margin: 0;
    font-family: var(--sans-stack);
    font-size: var(--txt--1);
  }

  .result-count {
    font-family: var(--mono-stack);
    font-size: var(--txt--2);
    color: #666;
    margin: 0;
  }

  /* Result list */
  .result-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .result-item {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.75rem;
    border-bottom: 1px solid #e0e0e0;
    padding-block-end: 0.75rem;
    align-items: start;
  }

  .result-item:has(.preview-image[style*="display: none"]) {
    grid-template-columns: 1fr;
  }

  .result-item:last-child {
    border-bottom: none;
    padding-block-end: 0;
  }

  .result-content {
    min-width: 0; /* Allow text truncation */
  }

  .result-title {
    margin: 0 0 0.125rem 0;
    font-family: var(--serif-stack);
    font-size: var(--txt-0);
    font-weight: normal;
    line-height: 1.2;

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
    margin-block-end: 0.25rem;
    word-break: break-all;

  }

  .result-description {
    margin: 0.25rem 0;
    font-size: var(--txt--2);
    line-height: 1.4;
    color: #333;
  }

  .result-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-block-start: 0.375rem;
  }

  .tag {
    display: inline-block;
    padding: 0.125rem 0.375rem;
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
    padding: 0.25rem 0.5rem;
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
    padding: 0.25rem 0;
    border-bottom: 1px solid #e0e0e0;
  }

  .thorpe-item:last-child,
  .domain-item:last-child {
    border-bottom: none;
  }

  .domain-item a {
    font-family: var(--mono-stack);
    font-size: var(--txt--1);
    color: var(--txt-color);
    text-decoration: none;
  }

  .domain-item a:hover {
    text-decoration: underline;
    background-color: yellow;
  }

  pre {
    background-color: #f5f5f5;
    padding: 0.5rem;
    overflow-x: auto;
    font-family: var(--mono-stack);
    font-size: var(--txt--2);
    line-height: 1.4;
    margin: 0;
  }

  details {
    margin-block-end: 0.5rem;
  }

  details:last-child {
    margin-block-end: 0;
  }

  summary {
    cursor: pointer;
    font-weight: bold;
    padding: 0.25rem;
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
