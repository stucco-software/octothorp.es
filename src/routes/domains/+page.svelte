<script type="text/javascript">
  import { goto } from '$app/navigation'

  export let data

  let filterValue = ''

  $: filteredDomains = filterValue
    ? data.domains.filter(domain => {
        // TEMPORARY HACK: filter out glitch.me domains
        if (domain.endsWith('glitch.me')) return false
        // END TEMPORARY HACK
        return domain.toLowerCase().includes(filterValue.toLowerCase())
      })
    : data.domains.filter(domain => {
        // TEMPORARY HACK: filter out glitch.me domains
        if (domain.endsWith('glitch.me')) return false
        // END TEMPORARY HACK
        return true
      })

  function goToRandomSite() {
    if (filteredDomains.length === 0) return
    const randomDomain = filteredDomains[Math.floor(Math.random() * filteredDomains.length)]
    goto(`/domains/${encodeURIComponent(randomDomain)}`)
  }
</script>

<h1>Registered Sites</h1>

<form>
  <label for="filterValue">
      Search
  </label>
  <input
    placeholder="example.com"
    type="text"
    bind:value={filterValue}
    name="filter">
  <button type="button" on:click={goToRandomSite}>Random Site</button>
</form>

<section class="dotgrid">
  <ul>
    {#each filteredDomains as domain}
      <li>
        <span class="domain-item">
          <a href="/domains/{encodeURIComponent(domain)}">{domain}</a>
          <a href={domain} target="_blank" rel="noopener noreferrer" class="link-out" title="Visit {domain}">↗</a>
        </span>
      </li>
    {/each}
  </ul>
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

  .domain-item {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }

  .link-out {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    background-color: var(--bg-color);
    text-decoration: none;
    font-size: var(--txt--1);
    color: var(--dark-gray);
  }

  .link-out:hover {
    background-color: yellow;
  }
</style>
