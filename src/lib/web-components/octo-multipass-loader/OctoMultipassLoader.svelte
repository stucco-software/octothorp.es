<svelte:options customElement="octo-multipass-loader" />

<script>
  import { onMount } from 'svelte';
  import { createOctoQuery } from '../shared/octo-store.js';
  import { parseMultipass, multipassToParams, extractWhatBy } from '../shared/multipass-utils.js';
  
  // Props
  export let render = 'list';  // list, cards, compact
  export let placeholder = 'Drop MultiPass JSON or GIF here';
  
  // State
  let parsedMultiPass = null;
  let queryParams = null;
  let what = 'pages';
  let by = 'thorped';
  let query = null;
  let isDragging = false;
  let error = null;
  let gifPreview = null;
  
  // Reactive: create query when multipass is loaded
  $: {
    if (parsedMultiPass) {
      ({ what, by } = extractWhatBy(parsedMultiPass));
      queryParams = multipassToParams(parsedMultiPass);
      query = createOctoQuery(what, by);
      
      // Auto-load after parsing
      if (query && queryParams) {
        setTimeout(() => load(), 50);
      }
    }
  }
  
  // Load function
  async function load() {
    if (!query || !queryParams) return;
    await query.fetch(queryParams);
  }
  
  // File handling
  function handleDragOver(e) {
    e.preventDefault();
    isDragging = true;
  }
  
  function handleDragLeave(e) {
    e.preventDefault();
    isDragging = false;
  }
  
  function handleDrop(e) {
    e.preventDefault();
    isDragging = false;
    
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      handleFile(file);
    }
  }
  
  function handleFileInput(e) {
    const file = e.target?.files?.[0];
    if (file) {
      handleFile(file);
    }
    // Reset file input
    if (e.target) e.target.value = '';
  }
  
  async function handleFile(file) {
    error = null;
    gifPreview = null;
    
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        let multiPass;
        
        // Check if it's a GIF file
        if (file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif')) {
          // Extract MultiPass from GIF
          multiPass = extractMultipassFromGif(e.target.result);
          
          // Create preview URL
          const blob = new Blob([e.target.result], { type: 'image/gif' });
          gifPreview = URL.createObjectURL(blob);
        } else {
          // Parse as JSON
          multiPass = JSON.parse(e.target.result);
          gifPreview = null;
        }
        
        // Parse and validate
        parsedMultiPass = parseMultipass(multiPass);
        
        if (!parsedMultiPass) {
          throw new Error('Invalid MultiPass structure');
        }
      } catch (err) {
        error = `Error reading file: ${err.message}`;
        parsedMultiPass = null;
        gifPreview = null;
      }
    };
    
    // Read file
    if (file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif')) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  }
  
  // Extract from GIF (needs to be bundled with component)
  function extractMultipassFromGif(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    
    // Verify GIF signature
    const signature = String.fromCharCode(...bytes.slice(0, 6));
    if (!signature.startsWith('GIF')) {
      throw new Error('Not a valid GIF file');
    }
    
    // Skip GIF header (6) + Logical Screen Descriptor (7)
    let pos = 13;
    
    // Skip Global Color Table if present
    const packed = bytes[10];
    if (packed & 0x80) {
      const colorTableSize = 2 << (packed & 0x07);
      pos += colorTableSize * 3;
    }
    
    // Scan for comment extensions (0x21 0xFE)
    while (pos < bytes.length - 1) {
      if (bytes[pos] === 0x21 && bytes[pos + 1] === 0xFE) {
        pos += 2;
        let comment = '';
        
        // Read comment sub-blocks
        while (pos < bytes.length && bytes[pos] !== 0x00) {
          const blockSize = bytes[pos];
          pos++;
          
          if (pos + blockSize > bytes.length) {
            throw new Error('Malformed GIF: comment block extends beyond file');
          }
          
          comment += String.fromCharCode(...bytes.slice(pos, pos + blockSize));
          pos += blockSize;
        }
        
        // Try to parse as JSON
        try {
          const parsed = JSON.parse(comment);
          if (typeof parsed === 'object' && parsed !== null) {
            return parsed;
          }
        } catch (e) {
          // Not valid JSON, keep looking
        }
      }
      pos++;
    }
    
    throw new Error('No MultiPass JSON found in GIF');
  }
  
  function reset() {
    parsedMultiPass = null;
    queryParams = null;
    query = null;
    error = null;
    if (gifPreview) {
      URL.revokeObjectURL(gifPreview);
      gifPreview = null;
    }
  }
  
  // Helper functions
  function getTitle(item) {
    return item.title || item['@id'] || item.uri || item.term || 'Untitled';
  }
  
  function getUrl(item) {
    return item['@id'] || item.uri || '#';
  }
  
  function formatDate(timestamp) {
    if (!timestamp) return '';
    const date = new Date(parseInt(timestamp));
    return date.toLocaleDateString();
  }
</script>

{#if !parsedMultiPass}
  <!-- Upload/Drop zone -->
  <div 
    class="upload-zone"
    class:dragging={isDragging}
    on:dragover={handleDragOver}
    on:dragleave={handleDragLeave}
    on:drop={handleDrop}
    role="button"
    tabindex="0"
  >
    <div class="upload-content">
      <div class="upload-icon">📄</div>
      <p class="upload-text">{placeholder}</p>
      <p class="upload-subtext">JSON or GIF files accepted</p>
      
      <label class="upload-button">
        Browse Files
        <input
          type="file"
          accept=".json,.gif,application/json,image/gif"
          on:change={handleFileInput}
          style="display: none;"
        />
      </label>
      
      {#if error}
        <div class="upload-error">
          <p><strong>Error:</strong> {error}</p>
        </div>
      {/if}
    </div>
  </div>

{:else}
  <!-- Results display -->
  <div class="results-container">
    
    <!-- Header with metadata and reset button -->
    <div class="results-header">
      <div class="header-content">
        {#if gifPreview}
          <img src={gifPreview} alt="MultiPass GIF" class="gif-preview" />
        {/if}
        
        <div class="header-text">
          {#if parsedMultiPass.meta?.title}
            <h2 class="multipass-title">{parsedMultiPass.meta.title}</h2>
          {/if}
          
          {#if parsedMultiPass.meta?.description}
            <p class="multipass-description">{parsedMultiPass.meta.description}</p>
          {/if}
          
          {#if parsedMultiPass.meta?.author}
            <p class="multipass-author">by {parsedMultiPass.meta.author}</p>
          {/if}
        </div>
      </div>
      
      <button class="reset-button" on:click={reset}>
        Load Different MultiPass
      </button>
    </div>
    
    <!-- Loading state -->
    {#if query && $query.loading}
      <div class="loading">
        <div class="spinner"></div>
        <p>Loading results...</p>
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
        <div class="compact">
          {#each $query.results as item, i}
            <a href={getUrl(item)} target="_blank" rel="noopener noreferrer">
              {getTitle(item)}
            </a>{#if i < $query.results.length - 1}, {/if}
          {/each}
        </div>
      {/if}
      
      <!-- Footer -->
      <div class="meta">
        <span class="result-count">{$query.count} result{$query.count === 1 ? '' : 's'}</span>
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
  
  /* Upload zone */
  .upload-zone {
    min-height: 300px;
    border: 3px dashed var(--octo-border);
    border-radius: var(--octo-radius);
    background: var(--octo-background);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--octo-spacing);
    transition: all 0.2s ease;
    cursor: pointer;
  }
  
  .upload-zone:hover {
    border-color: var(--octo-primary);
    background: #f8f9fa;
  }
  
  .upload-zone.dragging {
    border-color: var(--octo-primary);
    border-style: solid;
    background: #e3f2fd;
    transform: scale(1.02);
  }
  
  .upload-content {
    text-align: center;
    max-width: 400px;
  }
  
  .upload-icon {
    font-size: 4rem;
    margin-bottom: var(--octo-spacing);
  }
  
  .upload-text {
    font-size: 1.125rem;
    font-weight: bold;
    margin: 0 0 0.5rem 0;
    color: var(--octo-text);
  }
  
  .upload-subtext {
    font-size: 0.875rem;
    color: #666;
    margin: 0 0 var(--octo-spacing) 0;
  }
  
  .upload-button {
    display: inline-block;
    padding: 0.75rem 1.5rem;
    background: var(--octo-primary);
    color: white;
    border-radius: var(--octo-radius);
    cursor: pointer;
    font-weight: bold;
    transition: opacity 0.2s;
  }
  
  .upload-button:hover {
    opacity: 0.9;
  }
  
  .upload-error {
    margin-top: var(--octo-spacing);
    padding: var(--octo-spacing);
    background: #ffebee;
    border: 1px solid var(--octo-error);
    border-radius: var(--octo-radius);
  }
  
  .upload-error p {
    margin: 0;
    color: var(--octo-error);
  }
  
  /* Results container */
  .results-container {
    background: var(--octo-background);
  }
  
  /* Results header */
  .results-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--octo-spacing);
    padding-bottom: var(--octo-spacing);
    border-bottom: 2px solid var(--octo-border);
    margin-bottom: var(--octo-spacing);
  }
  
  .header-content {
    display: flex;
    gap: var(--octo-spacing);
    flex: 1;
    min-width: 0;
  }
  
  .gif-preview {
    width: 100px;
    height: 100px;
    object-fit: cover;
    border: 1px solid var(--octo-border);
    border-radius: var(--octo-radius);
    flex-shrink: 0;
  }
  
  .header-text {
    flex: 1;
    min-width: 0;
  }
  
  .multipass-title {
    margin: 0 0 0.5rem 0;
    font-size: 1.5rem;
    font-weight: bold;
  }
  
  .multipass-description {
    margin: 0 0 0.5rem 0;
    color: #666;
    line-height: 1.5;
  }
  
  .multipass-author {
    margin: 0;
    font-size: 0.875rem;
    font-style: italic;
    color: #999;
  }
  
  .reset-button {
    padding: 0.5rem 1rem;
    background: var(--octo-background);
    border: 1px solid var(--octo-border);
    border-radius: var(--octo-radius);
    cursor: pointer;
    font-size: 0.875rem;
    white-space: nowrap;
  }
  
  .reset-button:hover {
    background: #f8f9fa;
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
    margin-bottom: var(--octo-spacing);
  }
  
  .error p {
    color: var(--octo-error);
    margin: 0 0 var(--octo-spacing) 0;
  }
  
  .retry-button {
    padding: 0.5rem 1rem;
    background: var(--octo-error);
    color: white;
    border: none;
    border-radius: var(--octo-radius);
    cursor: pointer;
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
    padding: var(--octo-spacing);
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
  }
  
  /* Meta footer */
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
</style>
