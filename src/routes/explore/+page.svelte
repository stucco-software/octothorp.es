<script>

  let what = 'everything';
  let by = 'all';
  let s = '';
  let o = '';
  let notS = '';
  let notO = '';
  let sTokens = [];
  let oTokens = [];
  let notSTokens = [];
  let notOTokens = [];

  $: s = sTokens.join(',');
  $: o = oTokens.join(',');
  $: notS = notSTokens.join(',');
  $: notO = notOTokens.join(',');

  let match = 'unset';
  let limit = 10;
  let offset = 0;
  let whenAfter = '';
  let whenBefore = '';


  let actualResults = null;
  let multiPass = null;
  let error = null;
  let queryUrl = '';
  let downloadUrl = '';
  let gifForDisplay = '';
  let isLoading = false;

  async function handleSubmit() {
    isLoading = true;
    error = null;
    // Don't clear actualResults, multiPass, downloadUrl, or svgForDisplay
    // to preserve the form state during loading

    const params = new URLSearchParams();
    if (s) params.set('s', s);
    if (o) params.set('o', o);
    if (notS) params.set('not-s', notS);
    if (notO) params.set('not-o', notO);
    if (limit) params.set('limit', limit);
    if (offset) params.set('offset', offset);
    if (match !== 'unset') params.set('match', match);

    let whenParts = [];
    if (whenAfter) whenParts.push(`after:${whenAfter}`);
    if (whenBefore) whenParts.push(`before:${whenBefore}`);
    if (whenParts.length > 0) params.set('when', whenParts.join(','));

    queryUrl = `/get/${what}/${by}?${decodeURIComponent(params.toString())}`;


  const whatOptions = ['everything', 'pages', 'links', 'backlinks', 'thorpes', 'domains'];
  const byOptions = [
    'octothorped',
    'linked', 'backlinked', 'cited', 'bookmarked',
    'posted', 'member-of'
  ];
  const matchOptions = [
    'unset', 'exact', 'fuzzy', 'fuzzy-s', 'fuzzy-subject',
    'fuzzy-o', 'fuzzy-object', 'very-fuzzy-o', 'very-fuzzy-object', 'very-fuzzy'
  ];
</script>

<svelte:head>
  <title>API Query Builder</title>
</svelte:head>

<div class="page-layout">
  <div class="form-column">
    <h1>API Query Builder</h1>



    <div class="form-container" on:keydown={handleFormKeydown} role="region" aria-label="Search form">
      <form on:submit|preventDefault={handleSubmit}>
      <div class="grid">
        <div>
          <label for="what">Get what?</label>
          <select id="what" bind:value={what}>
            {#each whatOptions as option}
              <option value={option}>{option}</option>
            {/each}
          </select>
        </div>

        <div>
          <label for="by">Matched by?</label>
          <select id="by" bind:value={by}>
            {#each byOptions as option}
              <option value={option}>{option}</option>
            {/each}
          </select>
        </div>
      </div>
      <label for="s">Subjects (s)</label>
      <TokenInput bind:tokens={sTokens} placeholder="add subject and press enter..." />

      <label for="o">Objects (o)</label>
      <TokenInput bind:tokens={oTokens} placeholder="add object and press enter..." />

      <label for="notS">Exclude Subjects (not-s)</label>
      <TokenInput bind:tokens={notSTokens} placeholder="add excluded subject and press enter..." />

      <label for="notO">Exclude Objects (not-o)</label>
      <TokenInput bind:tokens={notOTokens} placeholder="add excluded object and press enter..." />


      <div class="grid">
        <div>
          <label for="match">Match mode</label>
          <select id="match" bind:value={match}>
            {#each matchOptions as option}
              <option value={option}>{option}</option>
            {/each}
          </select>
        </div>

        <div>
          <label for="limit">Limit</label>
          <input id="limit" type="number" bind:value={limit} min="0">
        </div>

        <div>
          <label for="offset">Offset</label>
          <input id="offset" type="number" bind:value={offset} min="0">
        </div>
      </div>

      <div class="grid">
          <div>
              <label for="whenAfter">Date After</label>
              <input id="whenAfter" type="date" bind:value={whenAfter}>
          </div>
          <div>
              <label for="whenBefore">Date Before</label>
              <input id="whenBefore" type="date" bind:value={whenBefore}>
          </div>
      </div>


      <button type="submit">Query API</button>
      </form>
    </div>
  </div>

  <div class="results-column">
    {#if queryUrl}
      <p><strong>Query URL:</strong> <a href={queryUrl} target="_blank">{queryUrl}</a></p>
    {/if}
    {#if error}
      <pre class="error">{error}</pre>
    {/if}

    {#if isLoading}
      <div class="loading-message">
        <p>Loading results...</p>
      </div>
    {/if}

    {#if actualResults}
      <h2>Results</h2>
      <div class="results-grid">
        {#each actualResults as result}
          <div class="result-row">
            <div class="result-main">
              {#if result.image}
                <img src={result.image} alt="Preview" class="result-image"/>
              {/if}
              <div class="result-content">
                {#if result['@id']} <!-- Blobject rendering -->
                  <h3 class="result-title"><a href={result['@id']} target="_blank" rel="noopener noreferrer">{result.title || result['@id']}</a></h3>
                  {#if result.description}
                    <p class="result-description">{result.description}</p>
                  {/if}
                {:else} <!-- Raw binding rendering -->
                  <h3 class="result-title">Result</h3>
                {/if}
              </div>
            </div>

            <details class="result-details">
              <summary>View details</summary>
              <div class="details-content">
                {#if result['@id']}
                  {#if result.date}
                    <p><strong>Date:</strong> {new Date(result.date * 1000).toLocaleString()}</p>
                  {/if}
                  {#if result.octothorpes && result.octothorpes.length > 0}
                    <div class="tags">
                      <strong>Tags:</strong>
                      {#each result.octothorpes as ot}
                        {#if typeof ot === 'string'}
                          <span class="tag">{ot}</span>
                        {:else if ot.uri}
                          <span class="tag {ot.type}"><a href={ot.uri} target="_blank">{ot.uri.split('/').pop()} ({ot.type})</a></span>
                        {/if}
                      {/each}
                    </div>
                  {/if}
                  {#if result['@id']}
                    <p><strong>ID:</strong> <a href={result['@id']} target="_blank">{result['@id']}</a></p>
                  {/if}
                {:else}
                  <div class="raw-bindings">
                    {#each Object.entries(result) as [key, value]}
                      {#if value.value}
                        <p><strong>{key}:</strong> {value.value}</p>
                      {/if}
                    {/each}
                  </div>
                {/if}
              </div>
            </details>
          </div>
        {:else}
          <p>No results found for this query.</p>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .page-layout {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 2rem;
    align-items: flex-start;
    padding: 1rem;
  }

  @media (max-width: 900px) {
    .page-layout {
      grid-template-columns: 1fr;
    }
  }

  .form-column {
    position: sticky;
    top: 1rem;
  }

  .container {
    max-width: 800px;
    margin: 2rem auto;
    padding: 0 1rem;
  }
  .drop-zone {
    border: 2px dashed #ccc;
    border-radius: 8px;
    padding: 0.5rem;
    text-align: center;
    margin-bottom: 1rem;
    background: #fafafa;
  }
  .drop-zone p {
    margin: 0;
    font-size: 0.6rem;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 2rem;
    padding: 0.75rem;
    border: 1px solid #ccc;
    border-radius: 8px;
    background: #f9f9f9;
  }
  label {
    margin-bottom: 0;
    font-weight: bold;
    display: block;
    font-size: 0.6rem;
  }
  input, select {
    width: 100%;
    padding: 0.25rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 0.6rem;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 0.5rem;
  }
  button, .button {
    padding: 0.3rem 0.65rem;
    border: none;
    border-radius: 4px;
    background-color: #007bff;
    color: white;
    cursor: pointer;
    font-size: 0.6rem;
    text-decoration: none;
    display: inline-block;
  }
  button:hover, .button:hover {
    background-color: #0056b3;
  }
  pre {
    background: #eee;
    padding: 1rem;
    white-space: pre-wrap;
    word-break: break-all;
    border-radius: 4px;
  }
  .error {
    color: red;
    border: 1px solid red;
  }
  .multipass-download {
    margin: 1rem 0;
  }
  .gif-display {
    margin-bottom: 2rem;
  }
  .gif-display .button {
    margin-top: 1rem;
  }
  .gif-container img {
    border: 1px solid #ddd;
    border-radius: 4px;
    max-width: 100%;
  }
  .results-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0;
  }
  .result-row {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #e1e4e8;
    transition: background-color 0.1s ease;
  }
  .result-row:nth-child(even) {
    background-color: #fafbfc;
  }
  .result-row:nth-child(odd) {
    background-color: #ffffff;
  }
  .result-row:hover {
    background-color: #f6f8fa;
  }
  .result-main {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.75rem;
    align-items: start;
  }
  .result-image {
    width: 48px;
    height: 48px;
    border-radius: 4px;
    object-fit: cover;
    border: 1px solid #e1e4e8;
  }
  .result-title {
    margin: 0 0 0.25rem 0;
    font-size: 0.95rem;
    font-weight: 600;
  }
  .result-content a {
    text-decoration: none;
    color: #0969da;
  }
  .result-content a:hover {
    text-decoration: underline;
  }
  .result-description {
    margin: 0;
    font-size: 0.85rem;
    color: #57606a;
    line-height: 1.4;
  }
  .result-details {
    margin-top: 0.5rem;
    border-top: 1px solid #eaecef;
    padding-top: 0.5rem;
  }
  .result-details summary {
    cursor: pointer;
    font-size: 0.9rem;
    color: #0969da;
    font-weight: 500;
  }
  .result-details summary:hover {
    text-decoration: underline;
  }
  .details-content {
    margin-top: 0.5rem;
    font-size: 0.8rem;
    color: #57606a;
  }
  .details-content p {
    margin: 0.25rem 0;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0.5rem 0;
  }
  .tag {
    background-color: #e9ecef;
    padding: 0.25rem 0.5rem;
    border-radius: 1rem;
    font-size: 0.8rem;
  }
  .image-preview {
    margin-top: 0.5rem;
  }
  .image-preview img {
    max-width: 100%;
    max-height: 100px;
    border-radius: 4px;
    border: 1px solid #ddd;
  }

  .loading-message {
    text-align: center;
    padding: 2rem;
    color: #57606a;
    font-style: italic;
  }

  .form-container {
    outline: none; /* Remove focus outline since it's not interactive */
  }
</style>
