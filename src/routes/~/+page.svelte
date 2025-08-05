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
  {#each tags as tag}
  <div class="card">
    <a class="thorpe" href="{tag.term}">#{tag.term.split('/~/')[1]}</a>
    <details>
      <summary>{tag.count} pages</summary>
      <ul>
        {#each tag.pages as page}
        <li>
          <a href="{page.url}">{page.url}</a>
        </li>
        {/each}
      </ul>
    </details>
    <details>
      <summary>{tag.domains.length} domains</summary>
      <ul>
        {#each tag.domains as domain}
          <li>
            <!-- <a href="/domains/{encodeURIComponent(domain)}">{domain}</a> -->
            <a href="{domain}">{domain}</a>
          </li>
        {/each}
      </ul>
    </details>

    <p>Last Updated: {new Date(Number(tag.latest)).getFullYear()}/{new Date(Number(tag.latest)).getMonth()  + 1}/{new Date(Number(tag.latest)).getDate()}</p>
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
</style>