<script type="text/javascript">
  export let data
</script>

<div class="container">
  <main class="grid">
    <h1>Verified Websites</h1>

    <p>All domains that have been verified with Octothorpes</p>

    <ul>
      {#each data.domains as domain}
        <li>
          <a href="{domain}">{domain}</a>
        </li>
      {/each}
    </ul>
  </main>
</div>
