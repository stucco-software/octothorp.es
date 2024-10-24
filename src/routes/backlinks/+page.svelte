<script type="text/javascript">
  import LayoutSidebar from '$lib/components/LayoutSidebar.svelte'
  export let data
  console.log(data)
</script>

<h1>Backlinks</h1>
{#each data.backlinks as backlink}
  <section>
      <div class="from">
        from:<br>

        <a href="{backlink.from}">{backlink.fromTitle ? backlink.fromTitle : backlink.from}</a><br>
        {#if backlink.fromDesc}
          <p>{backlink.fromDesc}</p>
        {/if}
        {#if backlink.fromTitle}
          {backlink.from}
        {/if}
      </div>

      <div class="to">
        to:<br>
        <ul>
          {#each backlink.to as to}
            <li><a href="{to}">{to}</a></li>
          {/each}
        </ul>
      </div>
  </section>
{/each}

<style type="text/css">
  section {
    margin-bottom: var(--baseline)
  }
  .to {
    margin-block-start: var(--baseline);
  }
  .to a,
  .from a {
    word-break: break-all;
  }
</style>