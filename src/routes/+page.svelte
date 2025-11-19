<script type="text/javascript">
  import BearblogCard from '$lib/components/bearblogCard.svelte'
  import Contribute from '$lib/components/Contribute.svelte'
  import PreviewImage from '$lib/components/PreviewImage.svelte'
  import { onMount } from 'svelte'
  import { browser } from '$app/environment'
  export let data

  let recentResults = []
  let loading = false
  let error = null
  let defaultOctothorpe = data.dashboard_thorpe || 'demo'

  async function fetchRecentResults() {
    if (!browser) return

    loading = true
    error = null

    try {
      const base = window.location.origin
      const url = `${base}/get/everything/thorped?o=${defaultOctothorpe}&limit=3`

      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      recentResults = data.results || []
    } catch (err) {
      error = err.message
      console.error('Error fetching recent results:', err)
    } finally {
      loading = false
    }
  }

  onMount(() => {
    fetchRecentResults()
  })
</script>

<link
  rel="alternate"
  type="application/rss+xml"
  title={data.instance}
  href={`${data.instance}rss/`}>

<div class="title-card">
  <h1>Enjoy the World <br><em>Wide</em> Web</h1>
  <p>
    Octothorpes are hashtags and backlinks that can be used on regular websites, connecting pages across the open internet regardless of where they're hosted.
  </p>

  <p>
    This Server is a network of <mark>{data.thorpes}</mark> <a href="/~">Tags</a> across <mark>{data.domains}</mark> <a href="/domains">Websites.</a>
   </p>

</div>

<div class="dotgrid">
  <div class="dashboard">
    {#if loading}
      <section class="result loading">
        <p>Loading recent content...</p>
      </section>
    {:else if error}
      <section class="result error">
        <p>Error loading content: {error}</p>
      </section>
    {:else if recentResults && recentResults.length > 0}
      {#each recentResults as result}
        <article class="result">
          <PreviewImage
            url={result['@id']}
            image={result.image}
            title={result.title || result['@id']}
            cssClass="dashboard-preview"
          />
          <div class="result-content">
            <h3 class="result-title">
              {#if result.title}
                <a href={result['@id']} target="_blank" rel="noopener noreferrer">{result.title}</a>
              {:else}
                <a href={result['@id']} target="_blank" rel="noopener noreferrer">{new URL(result['@id']).hostname}</a>
              {/if}
            </h3>
            <div class="result-url">{result['@id']}</div>
            {#if result.description}
              <p class="result-description">{result.description}</p>
            {/if}
            {#if result.date}
              <p class="date">{new Date(result.date).toLocaleDateString()}</p>
            {/if}
          </div>
        </article>
      {/each}
    {:else}
      <section class="result empty">
        <p>No recent content found for #{defaultOctothorpe}</p>
      </section>
    {/if}
  </div>

  <Contribute />
</div>


<div class="breaking">
  <header>
    <h2>Server News</h2>
    <p># # # # # # # # # # </p>
  </header>

  <section>
    {#if data.server_name === 'Bear Blog'}
      <date>June 9th, 2025</date>
      <h3><mark>Welcome, Bear Bloggers</mark></h3>
      <p>This is an <a href="https://octothorpe.es/about">Octothorpe relay</a> that lets you use hashtags and backlinks on your blog.</p>
      <p>It's only open to blogs using the Bear platform.</p>
    {:else}
      <!-- <p>Please stand by while we resolve resolve technical difficulties.</p> -->
      <img
        class="launch"
        src="/duplu_plane.avif"
        alt="Duplu plane illustration">
      <date>August 1st, 2025</date>
      <h3><mark>Version 0.5 released</mark></h3>
      <p>Take a journey through what <a href="https://docs.octothorp.es/pitch">Octothorpes has to offer</a> on our <a href="https://docs.octothorp.es/">New documentation site.</a></p>
    {/if}
  </section>
</div>

<style type="text/css">

  h1 {
    text-align: center;
    font-family: var(--serif-stack);
    font-weight: 400;
    font-size: var(--txt-4);
    line-height: 1.1;
  }
  .title-card p {
    font-size: var(--txt-1);
    line-height: 1.1;
    max-width: 18em;
    margin: auto;
    margin-block-end: var(--lead-2);
  }

  .dashboard {
    font-family: "DOS";
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4ch;
    grid-auto-rows: max-content
  }
  @media (max-width: 800px) {
    .dashboard {
      grid-template-columns: repeat(1, 1fr);
    }
  }

  article.result {
    border: 1px solid var(--txt-color);
    background-color: var(--bg-color);
    filter: drop-shadow(1ch 1ch 1px var(--bios-gray));
    display: flex;
    flex-direction: column;
    padding: 1ch;
  }

  section.result.loading,
  section.result.error,
  section.result.empty {
    border: 1px solid var(--txt-color);
    background-color: var(--bg-color);
    filter: drop-shadow(1ch 1ch 1px var(--bios-gray));
    padding: 1ch;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 200px;
  }

  section.result.error {
    background-color: #ffeeee;
  }

  :global(.dashboard-preview) {
    width: 100%;
    height: 150px;
    object-fit: cover;
    margin-block-end: 0.5rem;
    background-image: url(/wonkgraph.png);
  }

  .result-content {
    display: flex;
    flex-direction: column;
    flex: 1;
  }

  .result-title {
    font-size: var(--txt-0);
    line-height: 1.1;
    margin: 0 0 0.25rem 0;
    font-weight: normal;
  }

  .result-title a {
    color: var(--txt-color);
    text-decoration: none;
  }

  .result-title a:hover {
    color: blue;
    background-color: yellow;
  }

  .result-url {
    font-family: var(--mono-stack);
    font-size: var(--txt--2);
    color: var(--bios-gray);
    margin-block-end: 0.5rem;
    word-break: break-all;
  }

  .result-description {
    font-size: var(--txt--1);
    line-height: 1.2;
    margin-block-end: 0.5rem;
    color: var(--txt-color);
  }

  .date {
    font-size: var(--txt--2);
    color: var(--bios-gray);
    margin-block-start: auto;
    text-align: right;
    margin-block-end: 0;
  }

  .breaking {
    max-width: 24rem;
    margin-inline: auto;
  }
  .breaking section {
    margin-top: 0;
    background-color: lightgoldenrodyellow;
    padding: 3ch;
  }
  .breaking header {
    margin-block-start: 2rem;
    text-align: center;
  }
  .breaking header h2 {
    font-family: var(--serif-stack);
    font-size: var(--txt-1);
    margin-block: 0;
  }
  .breaking  h3 {
    font-family: var(--serif-stack);
    font-size: var(--txt-0);
    margin-block-end: 0.5rem;
    margin-block-start: 0.5rem;
  }
  .breaking header p {
    /*letter-spacing: -0.2ch;*/
    font-weight: bold;
    font-family: var(--sans-stack);
    font-size: var(--txt--1);
  }
  .breaking p {
    font-family: var(--sans-stack);
    font-size: var(--txt--1);
    line-height: 1.3;
  }
  .launch {
    width: 190px;
    max-width: 40%;
    float: right;
    padding: 1ch;
  }
</style>
