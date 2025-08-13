<script type="text/javascript">
  import { onMount } from 'svelte'


  let loading = true
  let thorpes = []
  let tags = []
  let value
  let blob = {
    tags: []
  }

  $: {
    console.log(value)
    tags = value
      ? [...blob.tags.sort((a, b) => b.domains.length - a.domains.length)].filter(n => n.term.includes(value))
      : [...blob.tags.sort((a, b) => b.domains.length - a.domains.length)]
  }


  onMount(async () => {
    console.log(`fetch on page load?`)
    let response = await fetch('/~')
    blob = await response.json()
    console.log(blob)
    tags = blob.tags.sort((a, b) => b.domains.length - a.domains.length)
    loading = false
  })
</script>

<form>
  <label
    for="value">
    Filter
  </label>
  <input
    placeholder="#…"
    type="text"
    bind:value={value}
    name="filter">
</form>

<section class="dotgrid">
  <!-- <div class="thorpe-grid grid-header"> -->
  <div class="thorpe-grid">
    <div class="column grid-header">
        Octothorpe
    </div>
    <div class="column grid-header">
        Last Updated
    </div>
    <div class="column grid-header">
        Domains
    </div>
    <div class="column grid-header">
        Pages
    </div>

    {#if loading}
      <div class="loading">loading tags…</div>
    {/if}

  {#each tags as tag}
    <div class="column">
      <a
        class="thorpe"
        href="{tag.term}">
        #{tag.term.split('/~/')[1]}
      </a>
    </div>
    <div class="column">
      <p>
        {new Date(Number(tag.latest)).getFullYear()}/{new Date(Number(tag.latest)).getMonth()  + 1}/{new Date(Number(tag.latest)).getDate()}
      </p>
    </div>
    <div class="column">
      <details>
        <summary>{tag.domains.length} <span class="label">Domains</span></summary>
        <ul>
          {#each tag.domains as domain}
            <li>
              <a href="{domain}">{domain}</a>
            </li>
          {/each}
        </ul>
      </details>
    </div>
    <div class="column">
      <details>
        <summary>{tag.count} <span class="label">Pages</span></summary>
        <ul>
          {#each tag.pages as page}
            <li>
              <a href="{page.url}">{page.url}</a>
            </li>
          {/each}
          </ul>
      </details>
    </div>
  {/each}
</section>

<style type="text/css">
a.thorpe {
  font-family: var(--sans-stack);
}
  form {
    margin-block-end: var(--baseline);
    padding-inline: 3ch;
    padding-block-start: var(--baseline);
  }
  input {
    width: 100%;
  }
  span {
    margin-inline-end: 1ch;
  }

  .card {
    border: 1px solid black;
    display: inline-block;
    background-color: white;
    padding: 1ch;
    margin: 1ch;
  }
  .card p {
    margin-block-end: 0;
  }

  .thorpe-grid {
    display: grid;
    width: 100%;
    /*border-bottom: 1px solid #333;*/
    grid-template-columns: max-content 1fr 1fr 1fr; /* Default: 4 columns */
    gap: .5rem; /* Adds spacing between columns */
    font-family: 'Courier New', Courier, monospace;
  }

  .column {
    --baseline: .3rem;
    /*border-right: 1px solid #333;*/
    background-color: var(--light-gray);
    margin: .2rem;
    padding: .3rem 0rem;
    font-size: .7rem;
  }
  .loading {
    grid-column: 1 / 5;
    background-color: var(--light-gray);
    padding: var(--lead-2);
    text-align: center;

  }
  .column:has(details[open]) {
    grid-column: 1 / 5;
  }
  details .label {
    display: none;
  }
  details[open] .label {
    display: inline;
  }

  details {
      cursor: pointer;
      height: auto;
    --baseline: 1rem;

  }

  .column *, .column a {
      font-family: var(--mono-stack);
  }

  .column p, .column a {
      padding: .4rem;
  }

  .grid-header {
    font-family: 'Courier New', Courier, monospace;
    font-weight: bold;
  }

  summary {

            line-height: 1rem;
  }

  /* Medium screens: 2 columns */
  @media (max-width: 768px) {
    .thorpe-grid {
      grid-template-columns: repeat(2, 1fr);
    }
    /* Remove right border from every second column */
    .column:nth-child(2n) {
      border-right: none;
    }
  }

  /* Small screens: 1 column */
  @media (max-width: 480px) {
    .thorpe-grid {
      grid-template-columns: 1fr;
    }
    /* Remove all right borders */
    .column {
      border-right: none;
    }
  }



</style>
