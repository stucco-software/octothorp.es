<script>
  import TokenInput from '$lib/components/TokenInput.svelte';

  let what = 'everything';
  let by = 'thorped';
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
  let multiPassDownloadUrl = '';
  let isLoading = false;
  let uploadMode = false;
  let uploadedMultiPass = null;

  const whatOptions = ['everything', 'pages', 'links', 'backlinks', 'thorpes', 'domains'];
  const byOptions = [
    'thorped', 'tagged', 'linked', 'mentioned', 'backlinked',
    'bookmarked', 'in-webring', 'posted', 'member-of'
  ];
  const matchOptions = [
    'unset', 'exact', 'fuzzy', 'fuzzy-s', 'fuzzy-subject',
    'fuzzy-o', 'fuzzy-object', 'very-fuzzy-o', 'very-fuzzy-object', 'very-fuzzy'
  ];

  // Validation rules for what/by combinations
  const validationRules = {
    everything: ['thorped', 'tagged', 'linked', 'mentioned', 'backlinked', 'bookmarked', 'in-webring', 'posted', 'member-of'],
    pages: ['thorped', 'tagged', 'linked', 'mentioned', 'posted'],
    links: ['thorped', 'tagged', 'linked', 'mentioned', 'posted'],
    backlinks: ['backlinked'],
    thorpes: ['posted'],
    domains: ['posted', 'in-webring', 'member-of']
  };

  // Descriptions for combinations to help users understand
  const combinationDescriptions = {
    'everything-thorped': 'Get full content data for pages tagged with specific hashtags',
    'everything-linked': 'Get full content data for pages that link to specific URLs',
    'everything-backlinked': 'Get full content data for pages with mutual links',
    'everything-bookmarked': 'Get full content data for bookmarked pages',
    'everything-in-webring': 'Get full content data for pages in specific webrings',
    'everything-posted': 'Get all full content data (no filtering)',
    'pages-thorped': 'Get simple page listings tagged with specific hashtags',
    'pages-linked': 'Get simple page listings that link to specific URLs',
    'pages-posted': 'Get all simple page listings (no filtering)',
    'links-thorped': 'Get link listings tagged with specific hashtags',
    'links-linked': 'Get link listings that reference specific URLs',
    'backlinks-backlinked': 'Get mutual link relationships',
    'thorpes-posted': 'Get all hashtag listings',
    'domains-posted': 'Get all registered domains',
    'domains-in-webring': 'Get domains that are members of specific webrings'
  };

  // Helper functions (non-reactive)
  function getSubjectPlaceholder(what, by) {
    if (by === 'in-webring' || by === 'member-of') {
      return 'add webring URL and press enter...';
    }
    if (what === 'domains') {
      return 'add domain (example.com) and press enter...';
    }
    return 'add domain or URL and press enter...';
  }

  function getObjectPlaceholder(what, by) {
    switch (by) {
      case 'thorped':
      case 'tagged':
        return 'add hashtag (without #) and press enter...';
      case 'linked':
      case 'mentioned':
      case 'backlinked':
        return 'add URL or domain and press enter...';
      case 'bookmarked':
        return 'add bookmarked URL and press enter...';
      case 'posted':
        return 'not needed for "posted" queries';
      default:
        return 'add object and press enter...';
    }
  }

  function needsObjectInput(by) {
    return by !== 'posted';
  }

  // Primary reactive statements (independent)
  $: validByOptions = validationRules[what] || byOptions;
  $: isValidCombination = validationRules[what]?.includes(by) ?? true;

  // Auto-correct invalid combinations (only when what changes)
  $: {
    if (validationRules[what] && !validationRules[what].includes(by)) {
      by = validationRules[what][0];
    }
  }

  // Secondary reactive statements (derived from primary)
  $: combinationKey = `${what}-${by}`;
  $: combinationDescription = combinationDescriptions[combinationKey] || 'Custom query combination';
  $: subjectPlaceholder = getSubjectPlaceholder(what, by);
  $: objectPlaceholder = getObjectPlaceholder(what, by);
  $: isObjectFieldRelevant = needsObjectInput(by);

  // Clear object tokens when they're not relevant (only when by changes)
  $: {
    if (!needsObjectInput(by) && oTokens.length > 0) {
      oTokens = [];
      notOTokens = [];
    }
  }


  function handleFormKeydown(event) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      handleSubmit();
    }
  }

  function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        uploadedMultiPass = parsed;
        error = null;

        // Auto-populate form fields if possible
        if (parsed.meta) {
          what = parsed.meta.resultMode === 'blobjects' ? 'everything' :
                 parsed.meta.resultMode === 'links' ? 'links' :
                 parsed.meta.resultMode === 'octothorpes' ? 'thorpes' :
                 parsed.meta.resultMode === 'domains' ? 'domains' : 'everything';
        }

        if (parsed.subjects) {
          sTokens = parsed.subjects.include || [];
          notSTokens = parsed.subjects.exclude || [];
        }

        if (parsed.objects) {
          oTokens = parsed.objects.include || [];
          notOTokens = parsed.objects.exclude || [];
        }

        if (parsed.filters) {
          limit = parsed.filters.limitResults || 10;
          offset = parsed.filters.offsetResults || 0;
        }
      } catch (err) {
        error = 'Invalid MultiPass JSON file: ' + err.message;
        console.error('File upload error:', err);
      }
    };
    reader.readAsText(file);
  }

  async function executeQuery() {
    isLoading = true;
    error = null;

    try {
      const response = await fetch(queryUrl);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      actualResults = data.results || data;

      // Generate download URL for JSON
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      downloadUrl = URL.createObjectURL(blob);

    } catch (err) {
      error = err.message;
      console.error('API request failed:', err);
    } finally {
      isLoading = false;
    }
  }

  function useUploadedMultiPass() {
    if (!uploadedMultiPass) {
      error = 'No MultiPass file uploaded';
      return;
    }

    multiPass = uploadedMultiPass;

    // Generate download URL for MultiPass JSON
    const multiPassBlob = new Blob([JSON.stringify(multiPass, null, 2)], { type: 'application/json' });
    multiPassDownloadUrl = URL.createObjectURL(multiPassBlob);

    // Extract query parameters from MultiPass
    const params = new URLSearchParams();

    if (multiPass.subjects && multiPass.subjects.include && multiPass.subjects.include.length > 0) {
      params.set('s', multiPass.subjects.include.join(','));
    }

    if (multiPass.objects && multiPass.objects.include && multiPass.objects.include.length > 0) {
      params.set('o', multiPass.objects.include.join(','));
    }

    if (multiPass.subjects && multiPass.subjects.exclude && multiPass.subjects.exclude.length > 0) {
      params.set('not-s', multiPass.subjects.exclude.join(','));
    }

    if (multiPass.objects && multiPass.objects.exclude && multiPass.objects.exclude.length > 0) {
      params.set('not-o', multiPass.objects.exclude.join(','));
    }

    if (multiPass.filters) {
      if (multiPass.filters.limitResults) params.set('limit', multiPass.filters.limitResults);
      if (multiPass.filters.offsetResults) params.set('offset', multiPass.filters.offsetResults);

      if (multiPass.filters.dateRange) {
        const whenParts = [];
        if (multiPass.filters.dateRange.after) whenParts.push(`after:${multiPass.filters.dateRange.after}`);
        if (multiPass.filters.dateRange.before) whenParts.push(`before:${multiPass.filters.dateRange.before}`);
        if (whenParts.length > 0) params.set('when', whenParts.join(','));
      }
    }

    // Determine what and by from MultiPass
    let multiPassWhat = 'everything';
    let multiPassBy = 'thorped';

    if (multiPass.meta && multiPass.meta.resultMode) {
      multiPassWhat = multiPass.meta.resultMode === 'blobjects' ? 'everything' :
                     multiPass.meta.resultMode === 'links' ? 'links' :
                     multiPass.meta.resultMode === 'octothorpes' ? 'thorpes' :
                     multiPass.meta.resultMode === 'domains' ? 'domains' : 'everything';
    }

    if (multiPass.objects && multiPass.objects.type) {
      multiPassBy = multiPass.objects.type === 'termsOnly' ? 'tagged' :
                   multiPass.objects.type === 'notTerms' ? 'mentioned' :
                   multiPass.objects.type === 'pagesOnly' ? 'backlinked' : 'thorped';
    }

    queryUrl = `/get/${multiPassWhat}/${multiPassBy}?${decodeURIComponent(params.toString())}`;

    // Execute the query
    executeQuery();
  }

  // Add global keydown listener on mount
  import { onMount } from 'svelte';

  onMount(() => {
    const handleGlobalKeydown = (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        handleSubmit();
      }
    };

    document.addEventListener('keydown', handleGlobalKeydown);

    return () => {
      document.removeEventListener('keydown', handleGlobalKeydown);
    };
  });

  async function handleSubmit() {
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

    // Execute the query
    await executeQuery();

    // Generate MultiPass from server endpoint to avoid server-side imports
    const multiPassResponse = await fetch('/explore', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        what,
        by,
        s: sTokens,
        o: oTokens,
        notS: notSTokens,
        notO: notOTokens,
        match,
        limit,
        offset,
        whenAfter,
        whenBefore
      })
    });

    if (multiPassResponse.ok) {
      const multiPassData = await multiPassResponse.json();
      multiPass = multiPassData.multiPass;

      // Generate download URL for MultiPass JSON
      const multiPassBlob = new Blob([JSON.stringify(multiPass, null, 2)], { type: 'application/json' });
      multiPassDownloadUrl = URL.createObjectURL(multiPassBlob);
    } else {
      console.error('Failed to generate MultiPass:', await multiPassResponse.text());
      multiPass = null;
    }
  }
</script>

<svelte:head>
  <title>API Query Builder</title>
</svelte:head>

<div class="page-layout">
  <div class="form-column">
    <h1>API Query Builder</h1>

    <div class="upload-section" style="margin-bottom: 1rem; padding: 1rem; border: 1px solid #ccc; border-radius: 8px; background: #f9f9f9;">
      <h3 style="margin-top: 0;">Upload MultiPass JSON</h3>
      <input
        type="file"
        accept=".json,application/json"
        on:change={handleFileUpload}
        style="margin-bottom: 0.5rem; width: 100%;"
      />
      {#if uploadedMultiPass}
        <div style="margin: 0.5rem 0; padding: 0.5rem; background: #e8f5e8; border-radius: 4px;">
          <strong>✓ MultiPass loaded successfully</strong>
          <button
            on:click={useUploadedMultiPass}
            style="margin-top: 0.5rem; padding: 0.3rem 0.65rem; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;"
          >
            Use Uploaded MultiPass
          </button>
        </div>
      {/if}
    </div>

    <div class="form-container" role="region" aria-label="Search form">
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
              {#each validByOptions as option}
                <option value={option}>{option}</option>
              {/each}
            </select>
          </div>

        </div>

        <!-- Query Description -->
        <div class="query-description">
          <p class="description-text">
            <strong>Query:</strong> {combinationDescription}
          </p>
        </div>

        <label for="s">Subjects (s)</label>
        <TokenInput bind:tokens={sTokens} placeholder={subjectPlaceholder} />

        {#if isObjectFieldRelevant}
          <label for="o">Objects (o)</label>
          <TokenInput bind:tokens={oTokens} placeholder={objectPlaceholder} />
        {:else}
          <div class="object-field disabled">
            <label for="o">Objects (o) - not needed for "{by}" queries</label>
            <div class="disabled-input">
              Object filtering not applicable for this query type
            </div>
          </div>
        {/if}

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

    {#if actualResults && downloadUrl}
      <div class="download-section">
        <a href={downloadUrl} download="query-results.json" class="button">
          Download JSON Results
        </a>
        {#if multiPassDownloadUrl}
          <a href={multiPassDownloadUrl} download="multipass-config.json" class="button">
            Download MultiPass JSON
          </a>
        {/if}
        {#if queryUrl}
          <a href={queryUrl.replace('?', '/rss?')} target="_blank" class="button">
            View RSS Feed
          </a>
        {/if}
        {#if multiPass}
          <button on:click={() => { multiPass = null; }} class="button">
            Hide MultiPass Debug
          </button>
          <button on:click={() => { multiPass = multiPass; }} class="button">
            Show MultiPass Debug
          </button>
        {/if}
      </div>
    {/if}

    {#if multiPass}
      <details class="debug-section">
        <summary>MultiPass Debug Info</summary>
        <pre>{JSON.stringify(multiPass, null, 2)}</pre>
      </details>
    {/if}

    {#if actualResults}
      <h2>Results</h2>
      <div class="results-grid">
        {#each actualResults as result}
          <div class="result-row {result['@id'] ? 'blobject-result' : result.uri ? 'page-result' : result.value ? 'value-result' : 'other-result'}">
            <div class="result-main">
              {#if result.image}
                <img src={result.image} alt="Preview" class="result-image"/>
              {/if}
              <div class="result-content">
                {#if result['@id']} <!-- Blobject rendering -->
                  <h3 class="result-title"><a href={result['@id']} target="_blank" rel="noopener noreferrer">{result.title || result['@id'].split('/').pop() || result['@id']}</a></h3>
                  <span class="result-type-badge blobject-badge">Blobject</span>
                  {#if result.description}
                    <p class="result-description">{result.description}</p>
                  {/if}

                {:else if result.uri} <!-- Pages query rendering -->
                  <h3 class="result-title"><a href={result.uri} target="_blank" rel="noopener noreferrer">{result.title || result.uri.split('/').pop() || result.uri}</a></h3>
                  <span class="result-type-badge page-badge">Page</span>
                  {#if result.description}
                    <p class="result-description">{result.description}</p>
                  {/if}

                {:else if result.value} <!-- Simple value rendering -->
                  <h3 class="result-title">{result.value}</h3>
                  <span class="result-type-badge value-badge">Value</span>
                  {#if result.type}
                    <p class="result-description">Type: {result.type}</p>
                  {/if}

                {:else} <!-- Fallback rendering for other formats -->
                  <h3 class="result-title">{Object.keys(result).find(k => k !== 'role') || 'Result'}</h3>
                  <span class="result-type-badge other-badge">Other</span>
                  {#if Object.keys(result).length > 0}
                    <p class="result-description">Contains {Object.keys(result).length} properties</p>
                  {/if}
                {/if}
              </div>
            </div>

            <details class="result-details">
              <summary>View details</summary>
              <div class="details-content">
                {#if result['@id']}
                  {#if result.date}
                    <p><strong>Date:</strong> {new Date(typeof result.date === 'number' && result.date < 10000000000 ? result.date * 1000 : result.date).toLocaleString()}</p>
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

                {:else if result.uri}
                  {#if result.date}
                    <p><strong>Date:</strong> {new Date(typeof result.date === 'number' && result.date < 10000000000 ? result.date * 1000 : result.date).toLocaleString()}</p>
                  {/if}
                  {#if result.role}
                    <p><strong>Role:</strong> {result.role}</p>
                  {/if}
                  {#if result.uri}
                    <p><strong>URI:</strong> <a href={result.uri} target="_blank">{result.uri}</a></p>
                  {/if}

                {:else}
                  <div class="raw-bindings">
                    {#each Object.entries(result) as [key, value]}
                      {#if value && typeof value === 'object' && value.value}
                        <p><strong>{key}:</strong> {value.value} {#if value.type}({value.type}){/if}</p>
                      {:else if value !== null && value !== undefined}
                        <p><strong>{key}:</strong> {typeof value === 'object' ? JSON.stringify(value) : value}</p>
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

  .form-container {
    outline: none;
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

  .upload-section input[type="file"] {
    padding: 0.25rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 0.6rem;
  }

  .download-section {
    margin: 1rem 0;
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .debug-section {
    margin: 1rem 0;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 0.5rem;
  }

  .debug-section summary {
    cursor: pointer;
    font-weight: bold;
  }

  .debug-section pre {
    margin-top: 0.5rem;
    background: #f8f9fa;
    padding: 0.5rem;
    overflow-x: auto;
  }

  .loading-message {
    text-align: center;
    padding: 2rem;
    color: #57606a;
    font-style: italic;
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

  .blobject-result {
    border-left: 4px solid #4caf50;
  }

  .page-result {
    border-left: 4px solid #2196f3;
  }

  .value-result {
    border-left: 4px solid #ff9800;
  }

  .other-result {
    border-left: 4px solid #9e9e9e;
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

  .raw-bindings {
    font-family: monospace;
    font-size: 0.7rem;
  }

  .result-type-badge {
    display: inline-block;
    padding: 0.2rem 0.5rem;
    border-radius: 0.75rem;
    font-size: 0.6rem;
    font-weight: 600;
    margin-left: 0.5rem;
    vertical-align: middle;
  }

  .blobject-badge {
    background-color: #e8f5e8;
    color: #2e7d32;
    border: 1px solid #4caf50;
  }

  .page-badge {
    background-color: #e3f2fd;
    color: #1565c0;
    border: 1px solid #2196f3;
  }

  .value-badge {
    background-color: #fff3e0;
    color: #ef6c00;
    border: 1px solid #ff9800;
  }

  .other-badge {
    background-color: #f5f5f5;
    color: #616161;
    border: 1px solid #9e9e9e;
  }

  .query-description {
    margin: 0.5rem 0;
    padding: 0.5rem;
    background: #e3f2fd;
    border-left: 4px solid #2196f3;
    border-radius: 4px;
  }

  .description-text {
    margin: 0;
    font-size: 0.7rem;
    color: #1976d2;
  }

  .object-field.disabled {
    opacity: 0.5;
  }

  .object-field.disabled label {
    color: #666;
    font-style: italic;
  }

  .disabled-input {
    padding: 0.25rem;
    background: #f5f5f5;
    border: 1px solid #ddd;
    border-radius: 4px;
    color: #666;
    font-style: italic;
    font-size: 0.6rem;
    text-align: center;
  }
</style>
