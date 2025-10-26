<script>
  import { page } from '$app/stores'
  import PreviewImage from '$lib/components/PreviewImage.svelte'

  export let data

  $: what = $page.params.what
  $: format = $page.params.as || 'json'
</script>

<svelte:head>
  <title>API Response - Octothorpes Protocol</title>
</svelte:head>

<h1>API Response</h1>

<div class="explorer-container">
  <main class="results-area">
    <div class="results-header">
      <h3>Results</h3>
      <p class="result-count">
        {data.results?.length || data.actualResults?.length || 0} result{(data.results?.length || data.actualResults?.length) === 1 ? '' : 's'}
      </p>
    </div>

    <section class="results">
      {#if format === 'rss'}
        <pre>{data.rss}</pre>
      {:else if format === 'debug'}
        <details>
          <summary>MultiPass Object</summary>
          <pre>{JSON.stringify(data.multiPass, null, 2)}</pre>
        </details>
        <details>
          <summary>SPARQL Query</summary>
          <pre>{data.query}</pre>
        </details>
        <details open>
          <summary>Actual Results ({data.actualResults?.length || 0})</summary>
          <pre>{JSON.stringify(data.actualResults, null, 2)}</pre>
        </details>
      {:else if what === 'everything'}
        <!-- Formatted blobjects display -->
        <div class="result-list">
          {#each data.results || [] as item}
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
          {#each data.results || [] as item}
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
          {#each data.results || [] as item}
            <div class="thorpe-item">
              <span class="tag tag-large">#{item.term}</span>
            </div>
          {/each}
        </div>
      {:else if what === 'domains'}
        <!-- Formatted domains display -->
        <div class="result-list">
          {#each data.results || [] as item}
            <div class="domain-item">
              <a href={item.origin || item} target="_blank" rel="noopener noreferrer">
                {item.origin || item}
              </a>
            </div>
          {/each}
        </div>
      {:else}
        <!-- Fallback to raw JSON -->
        <pre>{JSON.stringify(data, null, 2)}</pre>
      {/if}
    </section>
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

  .small-button {
    padding: 0.125rem 0.375rem;
    height: 1.5rem;
    font-size: var(--txt--2);
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
</style>
