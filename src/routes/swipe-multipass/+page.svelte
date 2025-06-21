<script>
  let actualResults = null;
  let multiPass = null;
  let error = null;
  let queryUrl = '';
  let uploadedSvg = '';

  function handleDragOver(e) {
    e.preventDefault();
  }

  function handleDrop(e) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'image/svg+xml') {
      const reader = new FileReader();
      reader.onload = (re) => {
        const svgText = re.target.result;
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgText, "image/svg+xml");
        const svgElement = svgDoc.documentElement;
        if (svgElement && svgElement.hasAttribute('data-multipass')) {
          try {
            const jsonString = svgElement.getAttribute('data-multipass');
            const jsonData = JSON.parse(jsonString);
            uploadedSvg = svgText;
            runQuery(jsonData);
          } catch (err) {
            error = 'Failed to parse JSON from SVG data attribute.';
            console.error(err);
          }
        } else {
          error = 'No query data found in the dropped SVG.';
        }
      };
      reader.onerror = () => {
        error = 'Failed to read the dropped file.';
      };
      reader.readAsText(file);
    } else {
      error = 'Please drop a valid SVG file created by the query builder.';
    }
  }

  async function runQuery(multiPassData) {
    error = null;
    actualResults = null;
    queryUrl = '';

    const params = new URLSearchParams();
    
    if (multiPassData.subjects.include.length > 0) {
      params.set('s', multiPassData.subjects.include.join(','));
    }
    if (multiPassData.objects.include.length > 0) {
      params.set('o', multiPassData.objects.include.join(','));
    }
    if (multiPassData.subjects.exclude.length > 0) {
      params.set('not-s', multiPassData.subjects.exclude.join(','));
    }
    if (multiPassData.objects.exclude.length > 0) {
      params.set('not-o', multiPassData.objects.exclude.join(','));
    }
    
    if (multiPassData.filters.limitResults) {
      params.set('limit', multiPassData.filters.limitResults);
    }
    if (multiPassData.filters.offsetResults) {
      params.set('offset', multiPassData.filters.offsetResults);
    }
    if (multiPassData.meta.match && multiPassData.meta.match !== 'unset') {
      params.set('match', multiPassData.meta.match);
    }
    
    if (multiPassData.filters.dateRange) {
      const { after, before } = multiPassData.filters.dateRange;
      let whenParts = [];
      if (after) whenParts.push(`after:${new Date(after * 1000).toISOString().split('T')[0]}`);
      if (before) whenParts.push(`before:${new Date(before * 1000).toISOString().split('T')[0]}`);
      if (whenParts.length > 0) params.set('when', whenParts.join(','));
    }

    queryUrl = `/get/${multiPassData.meta.what}/${multiPassData.meta.by}?${decodeURIComponent(params.toString())}`;

    try {
      const response = await fetch(queryUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      actualResults = data.actualResults;
      multiPass = data.multiPass;
    } catch (e) {
      error = e.message;
    }
  }
</script>

<svelte:head>
  <title>Swipe MultiPass</title>
</svelte:head>

<div class="container">
  <h1>Swipe MultiPass</h1>
  <p class="description">Drop a MultiPass SVG here to quickly run the query</p>
  
  <div class="svg-display-area">
    {#if uploadedSvg}
      <div class="uploaded-svg">
        {@html uploadedSvg}
      </div>
    {:else}
      <div 
        class="drop-zone"
        on:dragover={handleDragOver}
        on:drop={handleDrop}
      >
        <div class="drop-content">
          <div class="drop-icon">📄</div>
          <p>Drop a MultiPass SVG file here</p>
          <p class="drop-hint">The query will run automatically</p>
        </div>
      </div>
    {/if}
  </div>

  {#if queryUrl}
    <div class="query-info">
      <p><strong>Query URL:</strong> <a href={queryUrl} target="_blank">{queryUrl}</a></p>
    </div>
  {/if}

  {#if error}
    <div class="error-message">
      <pre class="error">{error}</pre>
    </div>
  {/if}

  {#if actualResults}
    <h2>Results</h2>
    <div class="results-container">
      {#each actualResults as result}
        <div class="card">
          {#if result['@id']} <!-- Blobject rendering -->
            <h4><a href={result['@id']} target="_blank" rel="noopener noreferrer">{result.title || result['@id']}</a></h4>
            {#if result.description}
              <p>{result.description}</p>
            {/if}
            {#if result.image}
              <img src={result.image} alt="Preview" class="preview-image"/>
            {/if}
            {#if result.date}
              <p><small>Date: {new Date(result.date * 1000).toLocaleString()}</small></p>
            {/if}
            {#if result.octothorpes && result.octothorpes.length > 0}
              <div class="tags">
                {#each result.octothorpes as ot}
                  {#if typeof ot === 'string'}
                    <span class="tag">{ot}</span>
                  {:else if ot.uri}
                    <span class="tag {ot.type}"><a href={ot.uri} target="_blank">{ot.uri.split('/').pop()} ({ot.type})</a></span>
                  {/if}
                {/each}
              </div>
            {/if}
          {:else} <!-- Raw binding rendering -->
            <div class="raw-bindings">
                {#each Object.entries(result) as [key, value]}
                    {#if value.value}
                        <p><strong>{key}:</strong> {value.value}</p>
                    {/if}
                {/each}
            </div>
          {/if}
        </div>
      {:else}
        <p>No results found for this query.</p>
      {/each}
    </div>
  {/if}
</div>

<style>
  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
  }

  h1 {
    text-align: center;
    margin-bottom: 0.5rem;
  }

  .description {
    text-align: center;
    color: #666;
    margin-bottom: 2rem;
  }

  .svg-display-area {
    display: flex;
    justify-content: center;
    margin-bottom: 2rem;
  }

  .drop-zone {
    border: 3px dashed #ccc;
    border-radius: 8px;
    padding: 1rem;
    text-align: center;
    background: #fafafa;
    transition: all 0.3s ease;
    width: 320px;
    height: 170px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .drop-zone:hover {
    border-color: #007bff;
    background: #f0f8ff;
  }

  .drop-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .drop-icon {
    font-size: 2rem;
    opacity: 0.7;
  }

  .drop-zone p {
    margin: 0;
    font-size: 0.9rem;
    color: #333;
  }

  .drop-hint {
    font-size: 0.7rem !important;
    color: #666 !important;
  }

  .uploaded-svg {
    display: flex;
    justify-content: center;
  }

  .uploaded-svg :global(svg) {
    border: 1px solid #ddd;
    border-radius: 4px;
  }

  .query-info {
    background: #e3f2fd;
    padding: 1rem;
    border-radius: 8px;
    margin-bottom: 2rem;
  }

  .query-info a {
    color: #1976d2;
    text-decoration: none;
  }

  .query-info a:hover {
    text-decoration: underline;
  }

  .error-message {
    margin-bottom: 2rem;
  }

  .error {
    background: #ffebee;
    color: #c62828;
    padding: 1rem;
    border-radius: 8px;
    border: 1px solid #ffcdd2;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .results-container {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1rem;
  }

  .card {
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 1rem;
    background: #fff;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .card h4 {
    margin: 0;
    font-size: 1.1rem;
  }

  .card a {
    text-decoration: none;
    color: #007bff;
  }

  .card a:hover {
    text-decoration: underline;
  }

  .preview-image {
    max-width: 100%;
    height: auto;
    border-radius: 4px;
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .tag {
    background-color: #e9ecef;
    padding: 0.25rem 0.5rem;
    border-radius: 1rem;
    font-size: 0.8rem;
  }

  .raw-bindings p {
    margin: 0.25rem 0;
    font-size: 0.9rem;
  }
</style> 