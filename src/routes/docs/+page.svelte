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
            {#if subpart }
              <li class={subpart.draft ? 'draft-item' : ''}>
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
    {#if part.draft}  
      <mark>DRAFT</mark>
    {/if}
    <h2 id={part.id}>
      {part.prefLabel}
    </h2>
    {@html part.body}
    {#each arrayify(part.hasPart) as subpart}
      {#if subpart}
        {#if subpart.draft}  
          <div class="draft">
            <h3 id={subpart.id}>
              {subpart.prefLabel}
            </h3>
            {@html subpart.body}
          </div>
        {:else}
          <h3 id={subpart.id}>
            {subpart.prefLabel}
          </h3>
          {@html subpart.body}
        {/if}
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
  .draft {
    background-color: yellow;
    padding-inline: 1ch;
    padding-block: calc(var(--baseline) / 2);
    margin-block-end: var(--baseline);
  }
  .draft:before {
    content: "DRAFT // IMPLEMENTATION TK // DRAFT"
  }
  .draft:after {
    content: "DRAFT // IMPLEMENTATION TK // DRAFT"
  }
</style>

