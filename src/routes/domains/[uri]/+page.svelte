<script type="text/javascript">
  import { page } from '$app/stores'
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { browser } from '$app/environment'
  import Loading from '$lib/components/Loading.svelte'
  import RSSFeed from '$lib/components/RSSFeed.svelte'

  let domain = ''
  let thorpes = []
  let pages = []
  let loading = true
  let error = null
  let thorpesUrl = ''
  let pagesUrl = ''
  let thorpesData = null
  let pagesData = null
  let selectedTerm = null
  let domainForQuery = ''

  // Group thorpes by type and deduplicate
  $: termThorpes = Array.from(new Map(thorpes.filter(t => t.type === 'Term').map(t => [t.term, t])).values())
  $: backlinks = Array.from(new Map(thorpes.filter(t => t.type === 'Backlink').map(t => [t.term, t])).values())
  $: bookmarks = Array.from(new Map(thorpes.filter(t => t.type === 'Bookmark').map(t => [t.term, t])).values())
  $: cites = Array.from(new Map(thorpes.filter(t => t.type === 'Cite').map(t => [t.term, t])).values())
  $: links = Array.from(new Map(thorpes.filter(t => t.type === 'Link').map(t => [t.term, t])).values())
  $: otherThorpes = Array.from(new Map(thorpes.filter(t => !['Term', 'Backlink', 'Bookmark', 'Cite', 'Link'].includes(t.type)).map(t => [t.term, t])).values())

  // Filter pages by selected term
  $: filteredPages = selectedTerm 
    ? pages.filter(p => p.octothorpes && p.octothorpes.some(t => 
        (typeof t === 'string' && t === selectedTerm) || 
        (typeof t === 'object' && t.term === selectedTerm)
      ))
    : pages

  // Update URL params when selected term changes
  $: if (browser && domainForQuery) {
    const url = new URL(window.location.href)
    if (selectedTerm) {
      url.searchParams.set('o', selectedTerm)
    } else {
      url.searchParams.delete('o')
    }
    goto(`?${url.searchParams.toString()}`, { replaceState: true, noScroll: true, keepFocus: true })
  }

  function filterByTerm(term) {
    selectedTerm = selectedTerm === term ? null : term
  }

  onMount(async () => {
    domain = decodeURIComponent($page.params.uri)
    
    // Strip protocol to get just the domain for fuzzy matching
    domainForQuery = domain.replace(/^https?:\/\//, '')
    
    // Update URL with query params to match the API call
    if (browser) {
      const currentUrl = new URL(window.location.href)
      if (!currentUrl.searchParams.has('s')) {
        currentUrl.searchParams.set('s', domainForQuery)
        currentUrl.searchParams.set('match', 'fuzzy-s')
        currentUrl.searchParams.set('limit', '1000')
        goto(`?${currentUrl.searchParams.toString()}`, { replaceState: true, noScroll: true, keepFocus: true })
      }
    }
    
    try {
      // Fetch thorpes used by this domain (force fuzzy-s matching)
      thorpesUrl = `/get/thorpes/thorped?s=${encodeURIComponent(domainForQuery)}&match=fuzzy-s`
      const thorpesRes = await fetch(thorpesUrl)
      if (!thorpesRes.ok) throw new Error('Failed to fetch thorpes')
      thorpesData = await thorpesRes.json()
      thorpes = thorpesData.results || []

      // Fetch pages from this domain (force fuzzy-s matching, get as "everything" to include octothorpes)
      pagesUrl = `/get/everything/thorped?s=${encodeURIComponent(domainForQuery)}&match=fuzzy-s&limit=1000`
      const pagesRes = await fetch(pagesUrl)
      if (!pagesRes.ok) throw new Error('Failed to fetch pages')
      pagesData = await pagesRes.json()
      pages = pagesData.results || []
    } catch (err) {
      error = err.message
    } finally {
      loading = false
    }
  })
</script>

<svelte:head>
  <title>{domain} - Octothorpes Protocol</title>
</svelte:head>

<div class="domain-page">
  <header>
    <h1><a href={domain} target="_blank" rel="noopener noreferrer">{domain}</a></h1>
    <RSSFeed />
  </header>

  {#if loading}
    <Loading message="Loading domain data..." />
  {:else if error}
    <div class="error">Error: {error}</div>
  {:else}
    <div class="content-wrapper">
      <!-- Sidebar with Octothorpes -->
      <aside class="sidebar">
        <h2>Octothorpes</h2>
        
        {#if termThorpes.length > 0}
          <section class="thorpe-group">
            <h3>Terms ({termThorpes.length})</h3>
            <div class="thorpe-list">
              {#each termThorpes as thorpe}
                <button 
                  type="button"
                  class="tag tag-button"
                  class:active={selectedTerm === thorpe.term}
                  on:click={() => filterByTerm(thorpe.term)}>
                  #{thorpe.term}
                </button>
              {/each}
            </div>
          </section>
        {/if}

        {#if backlinks.length > 0}
          <section class="thorpe-group">
            <h3>Backlinks ({backlinks.length})</h3>
            <div class="thorpe-list">
              {#each backlinks as thorpe}
                <button 
                  type="button"
                  class="tag tag-button tag-backlink"
                  class:active={selectedTerm === thorpe.term}
                  on:click={() => filterByTerm(thorpe.term)}>
                  #{thorpe.term}
                </button>
              {/each}
            </div>
          </section>
        {/if}

        {#if bookmarks.length > 0}
          <section class="thorpe-group">
            <h3>Bookmarks ({bookmarks.length})</h3>
            <div class="thorpe-list">
              {#each bookmarks as thorpe}
                <button 
                  type="button"
                  class="tag tag-button tag-bookmark"
                  class:active={selectedTerm === thorpe.term}
                  on:click={() => filterByTerm(thorpe.term)}>
                  #{thorpe.term}
                </button>
              {/each}
            </div>
          </section>
        {/if}

        {#if cites.length > 0}
          <section class="thorpe-group">
            <h3>Cites ({cites.length})</h3>
            <div class="thorpe-list">
              {#each cites as thorpe}
                <button 
                  type="button"
                  class="tag tag-button tag-cite"
                  class:active={selectedTerm === thorpe.term}
                  on:click={() => filterByTerm(thorpe.term)}>
                  #{thorpe.term}
                </button>
              {/each}
            </div>
          </section>
        {/if}

        {#if links.length > 0}
          <section class="thorpe-group">
            <h3>Links ({links.length})</h3>
            <div class="thorpe-list">
              {#each links as thorpe}
                <button 
                  type="button"
                  class="tag tag-button tag-link"
                  class:active={selectedTerm === thorpe.term}
                  on:click={() => filterByTerm(thorpe.term)}>
                  #{thorpe.term}
                </button>
              {/each}
            </div>
          </section>
        {/if}

        {#if otherThorpes.length > 0}
          <section class="thorpe-group">
            <h3>Other ({otherThorpes.length})</h3>
            <div class="thorpe-list">
              {#each otherThorpes as thorpe}
                <button 
                  type="button"
                  class="tag tag-button"
                  class:active={selectedTerm === thorpe.term}
                  on:click={() => filterByTerm(thorpe.term)}>
                  #{thorpe.term}
                </button>
              {/each}
            </div>
          </section>
        {/if}

        {#if thorpes.length === 0}
          <p class="no-data">No octothorpes found.</p>
        {/if}

        <!-- Debug Panel -->
        <details class="debug-panel">
          <summary>Debug</summary>
          <div class="debug-content">
            <p><a href={thorpesUrl} target="_blank" rel="noopener noreferrer">Thorpes API</a></p>
            <p><a href={pagesUrl} target="_blank" rel="noopener noreferrer">Pages API</a></p>
          </div>
        </details>
      </aside>

      <!-- Main Content with Pages -->
      <main class="main-content">
        <div class="pages-header">
          <h2>Pages</h2>
          <p class="page-count">
            {#if selectedTerm}
              Showing {filteredPages.length} of {pages.length} pages with #{selectedTerm}
            {:else}
              {pages.length} pages
            {/if}
          </p>
        </div>
        
        {#if filteredPages.length > 0}
          <div class="page-list">
            {#each filteredPages as pg}
              <article class="page-item">
                <h3 class="page-title">
                  <a href={pg['@id'] || pg.uri} target="_blank" rel="noopener noreferrer">
                    {pg.title || pg['@id'] || pg.uri}
                  </a>
                </h3>
                <div class="page-url">{pg['@id'] || pg.uri}</div>
                {#if pg.description}
                  <p class="page-description">{pg.description}</p>
                {/if}
                {#if pg.octothorpes && pg.octothorpes.length > 0}
                  <div class="page-tags">
                    {#each pg.octothorpes as thorpe}
                      {#if typeof thorpe === 'string'}
                        <a href="/~/{thorpe}" class="tag-small">#{thorpe}</a>
                      {:else if thorpe.term}
                        <a href="/~/{thorpe.term}" class="tag-small tag-{thorpe.type?.toLowerCase()}">{thorpe.type}: #{thorpe.term}</a>
                      {/if}
                    {/each}
                  </div>
                {/if}
              </article>
            {/each}
          </div>
        {:else if selectedTerm}
          <p class="no-data">No pages found with #{selectedTerm}</p>
        {:else}
          <p class="no-data">No pages found for this domain.</p>
        {/if}
      </main>
    </div>
  {/if}
</div>

<style>
  .domain-page {
    max-width: 1200px;
    margin: 0 auto;
    padding: 1rem;
  }

  header {
    margin-block-end: 1rem;
    padding-block-end: 0.5rem;
  }

  h1 {
    font-family: var(--serif-stack);
    font-size: var(--txt-2);
    margin: 0;
  }

  h1 a {
    color: var(--txt-color);
    text-decoration: none;
  }

  h1 a:hover {
    background-color: yellow;
  }

  h2 {
    font-family: var(--sans-stack);
    font-size: var(--txt-1);
    margin-block-end: 0.75rem;
    margin-block-start: 0;
  }

  h3 {
    font-family: var(--sans-stack);
    font-size: var(--txt-0);
    margin: 0 0 0.5rem 0;
    font-weight: bold;
  }

  .content-wrapper {
    display: grid;
    grid-template-columns: 280px 1fr;
    gap: 1.5rem;
    align-items: start;
  }

  .sidebar {
    position: sticky;
    top: 1rem;
    max-height: calc(100vh - 2rem);
    overflow-y: auto;
    border: 1px solid var(--txt-color);
    padding: 0.75rem;
    background-color: var(--bg-color);
  }

  .sidebar h2 {
    font-size: var(--txt-0);
    margin-block-end: 0.5rem;
  }

  .main-content {
    min-height: 400px;
  }

  .pages-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-block-end: 1rem;
    padding-block-end: 0.5rem;
    border-bottom: 1px solid var(--txt-color);
  }

  .page-count {
    font-family: var(--mono-stack);
    font-size: var(--txt--1);
    color: #666;
    margin: 0;
  }

  .error {
    padding: 1rem;
    text-align: center;
    border: 2px solid red;
    background-color: #ffeeee;
  }

  .thorpe-group {
    margin-block-end: 1rem;
  }

  .thorpe-group:last-child {
    margin-block-end: 0;
  }

  .thorpe-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .tag {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    background-color: lightgoldenrodyellow;
    border: 1px solid var(--txt-color);
    font-family: var(--mono-stack);
    font-size: var(--txt--2);
    text-decoration: none;
    color: var(--txt-color);
  }

  .tag:hover {
    background-color: yellow;
  }

  .tag-button {
    cursor: pointer;
  }

  .tag-button.active {
    background-color: yellow;
    font-weight: bold;
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

  .page-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .page-item {
    border-bottom: 1px solid #e0e0e0;
    padding-block-end: 0.75rem;
  }

  .page-item:last-child {
    border-bottom: none;
    padding-block-end: 0;
  }

  .page-title {
    margin: 0 0 0.25rem 0;
    font-family: var(--serif-stack);
    font-size: var(--txt-0);
    font-weight: normal;
    line-height: 1.3;
  }

  .page-title a {
    color: var(--txt-color);
    text-decoration: none;
  }

  .page-title a:hover {
    background-color: yellow;
  }

  .page-url {
    font-family: var(--mono-stack);
    font-size: var(--txt--2);
    color: #666;
    margin-block-end: 0.5rem;
    word-break: break-all;
  }

  .page-description {
    margin: 0.5rem 0;
    font-size: var(--txt--1);
    line-height: 1.5;
    color: #333;
  }

  .page-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-block-start: 0.5rem;
  }

  .tag-small {
    display: inline-block;
    padding: 0.125rem 0.375rem;
    background-color: #f0f0f0;
    border: 1px solid #ccc;
    font-family: var(--mono-stack);
    font-size: var(--txt--2);
    color: #666;
    text-decoration: none;
  }

  .tag-small:hover {
    background-color: yellow;
  }

  .tag-small.tag-term {
    background-color: lightgoldenrodyellow;
    border-color: var(--txt-color);
    color: var(--txt-color);
  }

  .tag-small.tag-backlink {
    background-color: #e8f4f8;
  }

  .tag-small.tag-cite {
    background-color: #f0e8f8;
  }

  .tag-small.tag-bookmark {
    background-color: #f8f0e8;
  }

  .tag-small.tag-link {
    background-color: #e8f8e8;
  }

  .no-data {
    color: #666;
    font-style: italic;
    font-size: var(--txt--1);
  }

  .debug-panel {
    background-color: #f5f5f5;
    border: 1px solid #ccc;
    padding: 0.25rem;
    margin-block-start: 0.5rem;
  }

  .debug-panel summary {
    cursor: pointer;
    font-weight: bold;
    padding: 0.125rem 0.25rem;
    font-family: var(--mono-stack);
    font-size: var(--txt--2);
  }

  .debug-panel summary:hover {
    background-color: yellow;
  }

  .debug-content {
    margin-block-start: 0.25rem;
    font-family: var(--mono-stack);
    font-size: var(--txt--2);
  }

  .debug-content p {
    margin: 0.125rem 0;
    padding: 0.125rem 0;
  }

  .debug-content a {
    color: blue;
    text-decoration: underline;
    font-size: var(--txt--2);
  }

  /* Responsive */
  @media (max-width: 900px) {
    .content-wrapper {
      grid-template-columns: 1fr;
    }

    .sidebar {
      position: static;
      max-height: none;
      margin-block-end: 1.5rem;
    }
  }
</style>
