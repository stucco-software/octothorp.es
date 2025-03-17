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

<style>
  h1 {
    padding-inline: 1.5rem;
    padding-block-start: 1.5rem;
  }
</style>