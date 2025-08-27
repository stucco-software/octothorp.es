<script>
  import ApiQuery from '$lib/components/ApiQuery.svelte'
  import { onMount } from 'svelte'

  // Example MultiPass objects
  const exampleMultiPasses = {
    basic: {
      meta: {
        title: 'Basic Query',
        description: 'Simple everything query',
        resultMode: 'everything'
      },
      subjects: {
        mode: 'all',
        include: ['example.com'],
        exclude: []
      },
      objects: {
        type: 'all',
        mode: 'all',
        include: [],
        exclude: []
      },
      filters: {
        subtype: null,
        limitResults: 10,
        offsetResults: 0,
        dateRange: {}
      }
    },
    
    tagged: {
      meta: {
        title: 'Tagged Content',
        description: 'Content tagged with specific terms',
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
        include: ['demo', 'test'],
        exclude: []
      },
      filters: {
        subtype: null,
        limitResults: 20,
        offsetResults: 0,
        dateRange: {}
      }
    },

    bookmarks: {
      meta: {
        title: 'Bookmarks with Terms',
        description: 'Bookmarks with associated hashtags',
        resultMode: 'everything'
      },
      subjects: {
        mode: 'all',
        include: ['example.com'],
        exclude: []
      },
      objects: {
        type: 'all',
        mode: 'all',
        include: [],
        exclude: []
      },
      filters: {
        subtype: 'Bookmark',
        limitResults: 15,
        offsetResults: 0,
        dateRange: {}
      }
    },

    domain: {
      meta: {
        title: 'Domain Query',
        description: 'Query for specific domain',
        resultMode: 'everything'
      },
      subjects: {
        mode: 'exact',
        include: ['example.com'],
        exclude: []
      },
      objects: {
        type: 'all',
        mode: 'all',
        include: [],
        exclude: []
      },
      filters: {
        subtype: null,
        limitResults: 10,
        offsetResults: 0,
        dateRange: {}
      }
    }
  }

  let selectedExample = 'basic'
  let customMultiPass = null
  let showDebug = false
  let autoExecute = true
  let queryType = 'everything'
  let queryMethod = 'posted'
  let outputFormat = 'json'

  // Event handlers
  function handleSuccess(event) {
    console.log('Query successful:', event.detail)
  }

  function handleError(event) {
    console.error('Query failed:', event.detail)
  }

  function updateExample() {
    customMultiPass = exampleMultiPasses[selectedExample]
  }

  function clearMultiPass() {
    customMultiPass = null
  }

  onMount(() => {
    updateExample()
  })
</script>

<svelte:head>
  <title>ApiQuery Component Demo</title>
</svelte:head>

<div class="demo-container">
  <header>
    <h1>ApiQuery Component Demo</h1>
    <p>A general-purpose web component for querying the Octothorpe Protocol API</p>
  </header>

  <div class="controls">
    <div class="control-group">
      <label for="example">Example Query:</label>
      <select id="example" bind:value={selectedExample} on:change={updateExample}>
        <option value="basic">Basic Query</option>
        <option value="tagged">Tagged Content</option>
        <option value="bookmarks">Bookmarks with Terms</option>
        <option value="domain">Domain Query</option>
      </select>
    </div>

    <div class="control-group">
      <label for="queryType">Query Type:</label>
      <select id="queryType" bind:value={queryType}>
        <option value="everything">Everything</option>
        <option value="pages">Pages</option>
        <option value="thorpes">Terms</option>
        <option value="domains">Domains</option>
        <option value="bookmarksWithTerms">Bookmarks with Terms</option>
      </select>
    </div>

    <div class="control-group">
      <label for="queryMethod">Query Method:</label>
      <select id="queryMethod" bind:value={queryMethod}>
        <option value="posted">Posted</option>
        <option value="thorped">Tagged</option>
        <option value="linked">Linked</option>
        <option value="bookmarked">Bookmarked</option>
        <option value="backlinked">Backlinked</option>
      </select>
    </div>

    <div class="control-group">
      <label for="outputFormat">Output Format:</label>
      <select id="outputFormat" bind:value={outputFormat}>
        <option value="json">JSON</option>
        <option value="rss">RSS</option>
        <option value="debug">Debug</option>
      </select>
    </div>

    <div class="control-group">
      <label>
        <input type="checkbox" bind:checked={showDebug}>
        Show Debug Info
      </label>
    </div>

    <div class="control-group">
      <label>
        <input type="checkbox" bind:checked={autoExecute}>
        Auto Execute
      </label>
    </div>

    <div class="control-group">
      <button on:click={clearMultiPass}>Clear MultiPass</button>
    </div>
  </div>

  <div class="examples">
    <h2>Example 1: Simple Test (No Auto-Execute)</h2>
    <ApiQuery 
      multiPass={null}
      queryType="everything"
      queryMethod="posted"
      outputFormat="debug"
      autoExecute={false}
      showDebug={true}
      on:success={handleSuccess}
      on:error={handleError}
    />

    <h2>Example 2: Basic Query</h2>
    <ApiQuery 
      multiPass={customMultiPass}
      {queryType}
      {queryMethod}
      {outputFormat}
      {autoExecute}
      showDebug={showDebug}
      on:success={handleSuccess}
      on:error={handleError}
    />

    <h2>Example 3: Manual Execution</h2>
    <ApiQuery 
      multiPass={exampleMultiPasses.tagged}
      queryType="everything"
      queryMethod="thorped"
      outputFormat="json"
      autoExecute={false}
      showDebug={showDebug}
      on:success={handleSuccess}
      on:error={handleError}
    />

    <h2>Example 4: Custom Result Display</h2>
    <ApiQuery 
      multiPass={exampleMultiPasses.bookmarks}
      queryType="bookmarksWithTerms"
      queryMethod="bookmarked"
      outputFormat="json"
      {autoExecute}
      showDebug={showDebug}
      on:success={handleSuccess}
      on:error={handleError}
    >
      <svelte:fragment slot="default" let:result let:queryString>
        <div class="custom-results">
          <h3>Custom Bookmark Display</h3>
          {#if result.results}
            <p>Found {result.results.length} bookmarks</p>
            <div class="bookmarks-grid">
              {#each result.results as bookmark}
                <div class="bookmark-card">
                  {#if bookmark.title}
                    <h4>{bookmark.title}</h4>
                  {/if}
                  {#if bookmark['@id']}
                    <p><strong>URL:</strong> <a href={bookmark['@id']} target="_blank">{bookmark['@id']}</a></p>
                  {/if}
                  {#if bookmark.octothorpes}
                    <p><strong>Tags:</strong></p>
                    <div class="tags">
                      {#each bookmark.octothorpes as tag}
                        <span class="tag">{tag}</span>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {:else}
            <p>No bookmarks found</p>
          {/if}
        </div>
      </svelte:fragment>
    </ApiQuery>

    <h2>Example 5: Debug Mode</h2>
    <ApiQuery 
      multiPass={exampleMultiPasses.domain}
      queryType="everything"
      queryMethod="posted"
      outputFormat="debug"
      {autoExecute}
      showDebug={true}
      on:success={handleSuccess}
      on:error={handleError}
    />
  </div>

  <div class="documentation">
    <h2>Component Usage</h2>
    
    <h3>Basic Usage</h3>
    <pre><code>&lt;ApiQuery 
  multiPass={myMultiPass}
  queryType="everything"
  queryMethod="posted"
  on:success={handleSuccess}
  on:error={handleError}
/&gt;</code></pre>

    <h3>Props</h3>
    <ul>
      <li><strong>multiPass</strong>: MultiPass object or null for auto-generation</li>
      <li><strong>queryType</strong>: 'everything', 'pages', 'thorpes', 'domains', 'bookmarksWithTerms'</li>
      <li><strong>queryMethod</strong>: 'posted', 'thorped', 'linked', 'bookmarked', 'backlinked'</li>
      <li><strong>outputFormat</strong>: 'json', 'rss', 'debug'</li>
      <li><strong>autoExecute</strong>: boolean, whether to execute on mount</li>
      <li><strong>showLoading</strong>: boolean, show loading state</li>
      <li><strong>showError</strong>: boolean, show error state</li>
      <li><strong>showDebug</strong>: boolean, show debug information</li>
    </ul>

    <h3>Events</h3>
    <ul>
      <li><strong>success</strong>: Fired when query succeeds</li>
      <li><strong>error</strong>: Fired when query fails</li>
    </ul>

    <h3>Methods</h3>
    <ul>
      <li><strong>execute()</strong>: Manually execute the query</li>
      <li><strong>reset()</strong>: Reset component state</li>
    </ul>

    <h3>Slots</h3>
    <p>Use the default slot to customize result display:</p>
    <pre><code>&lt;ApiQuery {multiPass}&gt;
  &lt;svelte:fragment slot="default" let:result let:queryString&gt;
    &lt;!-- Custom result display --&gt;
  &lt;/svelte:fragment&gt;
&lt;/ApiQuery&gt;</code></pre>
  </div>
</div>

<style>
  .demo-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  header {
    text-align: center;
    margin-bottom: 2rem;
    padding-bottom: 1rem;
    border-bottom: 2px solid #e1e5e9;
  }

  header h1 {
    color: #2c3e50;
    margin: 0 0 0.5rem 0;
  }

  header p {
    color: #7f8c8d;
    margin: 0;
  }

  .controls {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
    padding: 1rem;
    background: #f8f9fa;
    border-radius: 8px;
    border: 1px solid #dee2e6;
  }

  .control-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .control-group label {
    font-weight: 600;
    color: #495057;
    font-size: 0.875rem;
  }

  .control-group select,
  .control-group input[type="checkbox"] {
    padding: 0.5rem;
    border: 1px solid #ced4da;
    border-radius: 4px;
    font-size: 0.875rem;
  }

  .control-group button {
    background: #6c757d;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
  }

  .control-group button:hover {
    background: #5a6268;
  }

  .examples {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .examples h2 {
    color: #2c3e50;
    border-bottom: 1px solid #e1e5e9;
    padding-bottom: 0.5rem;
    margin-bottom: 1rem;
  }

  .custom-results {
    padding: 1rem;
  }

  .bookmarks-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1rem;
    margin-top: 1rem;
  }

  .bookmark-card {
    background: #f8f9fa;
    border: 1px solid #dee2e6;
    border-radius: 8px;
    padding: 1rem;
  }

  .bookmark-card h4 {
    margin: 0 0 0.5rem 0;
    color: #2c3e50;
  }

  .bookmark-card p {
    margin: 0.5rem 0;
    font-size: 0.875rem;
  }

  .bookmark-card a {
    color: #007bff;
    text-decoration: none;
  }

  .bookmark-card a:hover {
    text-decoration: underline;
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

  .documentation {
    margin-top: 3rem;
    padding-top: 2rem;
    border-top: 2px solid #e1e5e9;
  }

  .documentation h2 {
    color: #2c3e50;
    margin-bottom: 1rem;
  }

  .documentation h3 {
    color: #495057;
    margin: 1.5rem 0 0.5rem 0;
  }

  .documentation ul {
    margin: 0.5rem 0;
    padding-left: 1.5rem;
  }

  .documentation li {
    margin: 0.25rem 0;
    color: #6c757d;
  }

  .documentation pre {
    background: #f8f9fa;
    border: 1px solid #dee2e6;
    border-radius: 4px;
    padding: 1rem;
    overflow-x: auto;
    font-size: 0.875rem;
    margin: 0.5rem 0;
  }

  .documentation code {
    background: #f8f9fa;
    padding: 0.125rem 0.25rem;
    border-radius: 3px;
    font-size: 0.875rem;
  }
</style> 