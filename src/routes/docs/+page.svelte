<script type="text/javascript">
  import { arrayify } from '$lib/arrayify'
  import { page } from '$app/stores'
  
  let showDraft = Boolean($page.url.searchParams.get('draft'))
  let hideTechnical = Boolean($page.url.searchParams.get('tech'))
  export let data

</script>

<details>
  <summary>
    View Options
  </summary>
  <form 
    method="GET"
    action="/docs">
    <label>
      Draft Content:
    </label>
    <input 
      bind:checked={showDraft}
      type="checkbox" 
      name="draft" 
      value="true" /> Show

<!--     <label>
      Technical Details:
    </label>
    <input
      bind:checked={hideTechnical}
      type="checkbox"
      name="draft"
      value="true" /> Hide
     -->
    <!-- <label>
      Audience:
    </label>
    <input type="radio" name="audience" value="general" /> General
    <input type="radio" name="audience" value="technical" /> Technical -->
    <button>ok</button>
  </form>
</details>
<h1>
  {data.prefLabel}
</h1>

<nav class="dotgrid {showDraft ? '' : 'hide-draft'}">
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

<div class="content {showDraft ? '' : 'hide-draft'}">
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
            {#if subpart.ticket}
              <p>
                <a href={subpart.ticket}>View In Roadmap // Feedback</a>
              </p>
            {/if}
            <h3 id={subpart.id}>
              {subpart.prefLabel}
            </h3>
            {@html subpart.body}
            {#if subpart.ticket}
              <p>
                <a href={subpart.ticket}>View In Roadmap // Feedback</a>
              </p>
            {/if}
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
  .hide-draft .draft,
  .hide-draft .draft-item {
    display: none;
  }
</style>

