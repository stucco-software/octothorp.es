<script type="text/javascript">
  import { onMount } from 'svelte'
  export let data

  let thorpes = [...data.thorpes]
  let tags = data.tags.sort((a, b) => b.domains.length - a.domains.length)
  let value
  $: {
    console.log(value)
    tags = value
      ? [...data.tags.sort((a, b) => b.domains.length - a.domains.length)].filter(n => n.term.includes(value))
      : [...data.tags.sort((a, b) => b.domains.length - a.domains.length)]
  }

  console.log(data.tags)

  onMount(async () => {
    let response = await fetch('/get/everything')
    let blob = await response.json()
    console.log(blob)
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
    <div class="thorpe-grid grid-header">
        <div class="column">
            Octothorpe
        </div>
        <div class="column">
            Last Updated
        </div>
        <div class="column">
            Domains
        </div>
        <div class="column">
            Pages
        </div>


    </div>
  {#each tags as tag}
  <div class="thorpe-grid">
      <div class="column">
          <a class="thorpe" href="{tag.term}">#{tag.term.split('/~/')[1]}</a>
      </div>
      <div class="column">
          <p>{new Date(Number(tag.latest)).getFullYear()}/{new Date(Number(tag.latest)).getMonth()  + 1}/{new Date(Number(tag.latest)).getDate()}</p>
      </div>
      <div class="column">

        <details>
        <summary>{tag.domains.length}</summary>
        <ul>
            {#each tag.domains as domain}
            <li>
                <!-- <a href="/domains/{encodeURIComponent(domain)}">{domain}</a> -->
                <a href="{domain}">{domain}</a>
            </li>
            {/each}
        </ul>
        </details>
      </div>
      <div class="column">
          <details>
            <summary>{tag.count}</summary>
            <ul>
              {#each tag.pages as page}
              <li>
                <a href="{page.url}">{page.url}</a>
              </li>
              {/each}
            </ul>
          </details>
      </div>

    </div>

  {/each}
  <!-- {#each thorpes as thorpe}
    <span>
      <a class="thorpe" href="{thorpe}">#{thorpe.split('/~/')[1]}</a>
    </span>
  {/each} -->
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
    grid-template-columns: 2fr 1fr 1fr 3fr; /* Default: 4 columns */
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
      position: sticky;
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
