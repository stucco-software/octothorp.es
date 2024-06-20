<script type="text/javascript">
  import { arrayify } from '$lib/arrayify'
  export let data
</script>

<h1>
  {data.prefLabel}
</h1>

<nav class="dotgrid">
  <!-- New DocToc -->
  {#each arrayify(data.hasPart) as part}
    {#if part.type === 'Collection'}
      <details>
        <summary>
          <span>
            {part.prefLabel}
          </span>
        </summary>
        <ul>
          <li>
            <a href='#{part.id}'>
              Introduction
            </a>
          </li>
          {#each arrayify(part.hasPart) as subpart}
            {#if subpart}
              <li>
                <a href='#{subpart.id}'>
                  {subpart.prefLabel}
                </a>
              </li>
            {/if}
          {/each}
        </ul>
      </details>  
    {/if}
  {/each}
</nav>

<div class="content">
  {@html data.body}
  {#each data.hasPart as part}
    <h2 id={part.id}>
      {part.prefLabel}
    </h2>
    {@html part.body}
    {#each arrayify(part.hasPart) as subpart}
      {#if subpart}
        <h3 id={subpart.id}>
          {subpart.prefLabel}
        </h3>
        {@html subpart.body}
      {/if}
    {/each}
  {/each}
</div>

<style type="text/css">
  nav {
    margin-block-end: var(--baseline);
  }
  .content {
    max-width: 52ch;
  }
</style>

