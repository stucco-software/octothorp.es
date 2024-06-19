<script type="text/javascript">
  export let data
</script>

<h1>Websites</h1>
<section class="dotgrid">
  <ul>
    {#each data.domains as domain}
      <li>
        <span><a href="{domain}">{domain}</a></span>
      </li>
    {/each}
  </ul>
</section>