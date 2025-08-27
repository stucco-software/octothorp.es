<script>
  import ApiQuery from './ApiQuery.svelte'

  // Example: Query for recent bookmarks with specific tags
  const bookmarksMultiPass = {
    meta: {
      title: 'Recent Tech Bookmarks',
      description: 'Recent bookmarks tagged with tech-related terms',
      resultMode: 'everything'
    },
    subjects: {
      mode: 'all',
      include: [],
      exclude: []
    },
    objects: {
      type: 'termsOnly',
      mode: 'exact',
      include: ['tech', 'programming', 'ai'],
      exclude: []
    },
    filters: {
      subtype: 'Bookmark',
      limitResults: 10,
      offsetResults: 0,
      dateRange: { after: Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60) } // Last 7 days
    }
  }

  function handleSuccess(event) {
    console.log('Bookmarks loaded:', event.detail.result.results.length)
  }

  function handleError(event) {
    console.error('Failed to load bookmarks:', event.detail.error)
  }
</script>

<div class="bookmarks-widget">
  <h2>Recent Tech Bookmarks</h2>
  
  <ApiQuery 
    multiPass={bookmarksMultiPass}
    queryType="bookmarksWithTerms"
    queryMethod="bookmarked"
    outputFormat="json"
    autoExecute={true}
    showLoading={true}
    showError={true}
    on:success={handleSuccess}
    on:error={handleError}
  >
    <svelte:fragment slot="default" let:result>
      {#if result.results && result.results.length > 0}
        <div class="bookmarks-list">
          {#each result.results as bookmark}
            <div class="bookmark-item">
              <div class="bookmark-header">
                {#if bookmark.title}
                  <h3>{bookmark.title}</h3>
                {:else}
                  <h3>Untitled Bookmark</h3>
                {/if}
                {#if bookmark.date}
                  <span class="date">{new Date(bookmark.date * 1000).toLocaleDateString()}</span>
                {/if}
              </div>
              
              {#if bookmark['@id']}
                <a href={bookmark['@id']} target="_blank" class="bookmark-url">
                  {bookmark['@id']}
                </a>
              {/if}
              
              {#if bookmark.description}
                <p class="description">{bookmark.description}</p>
              {/if}
              
              {#if bookmark.octothorpes && bookmark.octothorpes.length > 0}
                <div class="tags">
                  {#each bookmark.octothorpes as tag}
                    <span class="tag">{tag}</span>
                  {/each}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {:else if result.results}
        <p class="no-results">No recent bookmarks found.</p>
      {/if}
    </svelte:fragment>
  </ApiQuery>
</div>

<style>
  .bookmarks-widget {
    max-width: 800px;
    margin: 0 auto;
    padding: 1rem;
  }

  .bookmarks-widget h2 {
    color: #2c3e50;
    margin-bottom: 1rem;
    text-align: center;
  }

  .bookmarks-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .bookmark-item {
    background: white;
    border: 1px solid #e1e5e9;
    border-radius: 8px;
    padding: 1rem;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }

  .bookmark-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 0.5rem;
  }

  .bookmark-header h3 {
    margin: 0;
    color: #2c3e50;
    font-size: 1.1rem;
  }

  .date {
    color: #7f8c8d;
    font-size: 0.875rem;
    white-space: nowrap;
  }

  .bookmark-url {
    color: #007bff;
    text-decoration: none;
    font-size: 0.875rem;
    word-break: break-all;
    display: block;
    margin-bottom: 0.5rem;
  }

  .bookmark-url:hover {
    text-decoration: underline;
  }

  .description {
    color: #6c757d;
    font-size: 0.875rem;
    margin: 0.5rem 0;
    line-height: 1.4;
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-top: 0.5rem;
  }

  .tag {
    background: #007bff;
    color: white;
    padding: 0.25rem 0.5rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .no-results {
    text-align: center;
    color: #6c757d;
    font-style: italic;
    padding: 2rem;
  }
</style> 