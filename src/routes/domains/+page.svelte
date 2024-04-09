<script type="text/javascript">
  export let data
</script>

<h1>Verified Domains</h1>

<p>All domains that have been verified with Octothorpes</p>

<ul>
  {#each data.domains as domain}
    <li>
      ✅ <a href="{domain}">{domain}</a>
    </li>
  {/each}
</ul>