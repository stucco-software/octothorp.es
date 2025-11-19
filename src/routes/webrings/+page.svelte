<script type="text/javascript">
  import { goto } from '$app/navigation'
  import PreviewImage from '$lib/components/PreviewImage.svelte'

  export let data

  let filterValue = ''

  $: filteredWebrings = filterValue
    ? data.webrings.filter(webring => 
        webring.uri.toLowerCase().includes(filterValue.toLowerCase()) ||
        webring.title?.toLowerCase().includes(filterValue.toLowerCase()) ||
        webring.description?.toLowerCase().includes(filterValue.toLowerCase())
      )
    : data.webrings

  function goToRandomWebring() {
    if (filteredWebrings.length === 0) return
    const randomWebring = filteredWebrings[Math.floor(Math.random() * filteredWebrings.length)]
    goto(`/webrings/${encodeURIComponent(randomWebring.uri)}`)
  }
</script>

<h1>Web Rings</h1>

<form>
  <label for="filterValue">
      Search
  </label>
  <input
    placeholder="example.com/webring"
    type="text"
    bind:value={filterValue}
    name="filter">
  <button type="button" on:click={goToRandomWebring}>Random Webring</button>
</form>

<section class="webrings-list">
  {#each filteredWebrings as webring}
    <article class="webring-card">
      <PreviewImage
        url={webring.uri}
        image={webring.image}
        title={webring.title || webring.uri}
        cssClass="webring-preview"
      />
      <div class="webring-content">
        <h3 class="webring-title">
          <a href="/webrings/{encodeURIComponent(webring.uri)}">
            {webring.title || webring.uri}
          </a>
        </h3>
        <div class="webring-url">{webring.uri}</div>
        {#if webring.description}
          <p class="webring-description">{webring.description}</p>
        {/if}
        <div class="webring-actions">
          <a href={webring.uri} target="_blank" rel="noopener noreferrer" class="visit-link">
            Visit webring ↗
          </a>
        </div>
      </div>
    </article>
  {/each}
</section>

<style>
  h1 {
    padding-inline: 1.5rem;
    padding-block-start: 1.5rem;
  }

  form {
    margin-block-end: var(--baseline);
    padding-inline: 3ch;
  }

  input {
    width: 100%;
    margin-block-end: 0.5rem;
  }

  button {
    padding: 0.5rem 1rem;
    background-color: var(--bg-color);
    border: 1px solid var(--txt-color);
    cursor: pointer;
    font-family: var(--sans-stack);
    font-size: var(--txt--1);
  }

  button:hover {
    background-color: yellow;
  }

  .webrings-list {
    max-width: 1200px;
    margin: 0 auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .webring-card {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 1rem;
    border-bottom: 1px solid #e0e0e0;
    padding-block-end: 1.5rem;
    align-items: start;
  }

  .webring-card:has(.webring-preview[style*="display: none"]) {
    grid-template-columns: 1fr;
  }

  .webring-card:last-child {
    border-bottom: none;
    padding-block-end: 0;
  }

  :global(.webring-preview) {
    width: 200px;
    height: 150px;
    object-fit: cover;
    background-image: url(/wonkgraph.png);
  }

  .webring-content {
    min-width: 0;
  }

  .webring-title {
    margin: 0 0 0.25rem 0;
    font-family: var(--serif-stack);
    font-size: var(--txt-1);
    font-weight: normal;
    line-height: 1.3;
  }

  .webring-title a {
    color: var(--txt-color);
    text-decoration: none;
  }

  .webring-title a:hover {
    background-color: yellow;
  }

  .webring-url {
    font-family: var(--mono-stack);
    font-size: var(--txt--2);
    color: #666;
    margin-block-end: 0.5rem;
    word-break: break-all;
  }

  .webring-description {
    margin: 0.5rem 0;
    font-size: var(--txt--1);
    line-height: 1.5;
    color: #333;
  }

  .webring-actions {
    margin-block-start: 0.5rem;
  }

  .visit-link {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    background-color: var(--bg-color);
    border: 1px solid var(--txt-color);
    font-family: var(--sans-stack);
    font-size: var(--txt--2);
    color: var(--txt-color);
    text-decoration: none;
  }

  .visit-link:hover {
    background-color: yellow;
  }

  @media (max-width: 700px) {
    .webring-card {
      grid-template-columns: 1fr;
    }

    :global(.webring-preview) {
      width: 100%;
      max-height: 200px;
    }
  }
</style>
