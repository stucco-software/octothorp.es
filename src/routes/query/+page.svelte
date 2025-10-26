<script>
  import { enhance } from '$app/forms'
  import PreviewImage from '$lib/components/PreviewImage.svelte'
  import { extractMultipassFromGif } from '$lib/utils.js'
  
  export let form

  $: what = form?.what || 'everything'
  
  let gifPreview = null
  let isDragging = false

  function processFile(file, formEl) {
    const textarea = formEl.querySelector('textarea[name="multipass"]')
    const reader = new FileReader()
    
    reader.onload = (e) => {
      try {
        let multiPassData
        
        // Check if it's a GIF file
        if (file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif')) {
          // Extract MultiPass from GIF comment block
          const multiPass = extractMultipassFromGif(e.target.result)
          multiPassData = JSON.stringify(multiPass, null, 2)
          
          // Create preview URL for the GIF
          const blob = new Blob([e.target.result], { type: 'image/gif' })
          gifPreview = URL.createObjectURL(blob)
        } else {
          // Regular JSON file - use text content directly
          multiPassData = e.target.result
          gifPreview = null
        }
        
        textarea.value = multiPassData
        formEl.requestSubmit()
      } catch (err) {
        alert(`Error reading file: ${err.message}`)
        gifPreview = null
      }
    }
    
    // Read as ArrayBuffer for GIF files, text for JSON
    if (file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif')) {
      reader.readAsArrayBuffer(file)
    } else {
      reader.readAsText(file)
    }
  }

  function handleFileUpload(event) {
    const file = event.target.files[0]
    if (!file) return

    const formEl = event.target.closest('form')
    processFile(file, formEl)
    event.target.value = '' // Reset file input
  }

  function handleDragOver(event) {
    event.preventDefault()
    isDragging = true
  }

  function handleDragLeave(event) {
    event.preventDefault()
    isDragging = false
  }

  function handleDrop(event) {
    event.preventDefault()
    isDragging = false

    const file = event.dataTransfer.files[0]
    if (!file) return

    const formEl = event.target.closest('form')
    processFile(file, formEl)
  }
</script>

<svelte:head>
  <title>MultiPass Query - Octothorpes Protocol</title>
</svelte:head>

<h1>Query with MultiPass</h1>

<div class="explorer-container">
  <aside class="sidebar">
    <form method="POST" use:enhance>
      <fieldset 
        class="compact" 
        class:dragging={isDragging}
        on:dragover={handleDragOver}
        on:dragleave={handleDragLeave}
        on:drop={handleDrop}
      >
        <legend>Upload MultiPass</legend>
        {#if gifPreview}
          <div style="margin-block-end: 0.5rem;">
            <img src={gifPreview} alt="Query GIF" style="max-width: 100%; border: 1px solid var(--txt-color);" />
          </div>
        {/if}
        <label>
          MultiPass JSON or GIF
          <small>Upload a MultiPass JSON or GIF to run query</small>
        </label>
        <div style="margin-block-start: 0.5rem;">
          <label class="rainbow" style="cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0.5rem;">
            {isDragging ? 'Drop file here...' : 'Upload & Run MultiPass'}
            <input
              type="file"
              accept=".json,.gif,application/json,image/gif"
              on:change={handleFileUpload}
              style="display: none;"
            />
          </label>
        </div>
        <details style="margin-block-start: 0.5rem;">
          <summary style="cursor: pointer; font-weight: bold; padding: 0.25rem; background-color: lightgoldenrodyellow;">
            View MultiPass JSON
          </summary>
          <textarea
            name="multipass"
            placeholder="MultiPass will appear here after upload"
            rows="8"
            style="font-family: var(--mono-stack); font-size: var(--txt--2); width: 100%; padding: 0.25rem; margin-block-start: 0.25rem;"
            readonly
          ></textarea>
        </details>
        {#if form?.error}
          <div class="warning" style="margin-block-start: 0.5rem;">
            Error: {form.error}
          </div>
        {/if}
      </fieldset>
    </form>
  </aside>

  <main class="results-area">
    {#if form?.success}
      <div class="results-header">
        <h3>Results</h3>
        <p class="result-count">
          {form.results?.length || 0} result{form.results?.length === 1 ? '' : 's'}
        </p>
      </div>

      <section class="results">
        {#if what === 'everything'}
          <!-- Formatted blobjects display -->
          <div class="result-list">
            {#each form.results || [] as item}
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
            {#each form.results || [] as item}
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
            {#each form.results || [] as item}
              <div class="thorpe-item">
                <span class="tag tag-large">#{item.term}</span>
              </div>
            {/each}
          </div>
        {:else if what === 'domains'}
          <!-- Formatted domains display -->
          <div class="result-list">
            {#each form.results || [] as item}
              <div class="domain-item">
                <a href={item.origin || item} target="_blank" rel="noopener noreferrer">
                  {item.origin || item}
                </a>
              </div>
            {/each}
          </div>
        {:else}
          <!-- Fallback to raw JSON -->
          <pre>{JSON.stringify(form.results, null, 2)}</pre>
        {/if}
      </section>
    {:else}
      <div class="empty-state">
        <p>Upload a MultiPass JSON file to run a query and see results.</p>
      </div>
    {/if}
  </main>
</div>

<style>
  h1 {
    font-family: var(--serif-stack);
    margin-block-end: 0.5rem;
    font-size: var(--txt-1);
    max-width: 1200px;
    margin-inline: auto;
    padding-inline: 1rem;
  }

  .explorer-container {
    display: grid;
    grid-template-columns: 280px 1fr;
    gap: 1rem;
    max-width: 1200px;
    margin-inline: auto;
    align-items: start;
  }

  .sidebar {
    position: sticky;
    padding-top: 1rem;
    padding-right: .5rem;
    top: 1rem;
    max-height: calc(100vh - 2rem);
    overflow-y: auto;
  }

  fieldset.compact {
    border: 0px;
    border-top: 1px solid var(--txt-color);
    padding: 0.375rem;
    margin: 0;
    background-color: var(--bg-color);
    transition: background-color 0.2s ease, border 0.2s ease;
  }

  fieldset.compact.dragging {
    background-color: lightgoldenrodyellow;
    border: 2px dashed blue;
    border-radius: 4px;
  }

  fieldset.compact legend {
    font-weight: bold;
    padding-inline: 0.25rem;
    font-family: var(--sans-stack);
    font-size: var(--txt--2);
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    font-family: var(--sans-stack);
    font-size: var(--txt--2);
    margin-block-end: 0.375rem;
  }

  small {
    line-height: 110%;
    padding: 5px;
  }

  .rainbow {
    box-shadow: 1px 1px 2px blue, 3px 3px 2px red, 5px 5px 2px lime, 7px 7px 2px yellow;
    margin-bottom: 10px;
    border: 1px solid var(--txt-color);
    background-color: var(--bg-color);
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

  .results-area {
    min-height: 300px;
  }

  .results {
    background-color: var(--bg-color);
    padding: 0.5rem;
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
    min-width: 0;
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

  .empty-state {
    padding: 1rem;
    text-align: center;
    color: #666;
    border: 2px dashed var(--txt-color);
    font-size: var(--txt--1);
  }

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
